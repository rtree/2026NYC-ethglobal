// Minimal GCP access via ADC (no heavy SDKs). One GoogleAuth instance yields bearer tokens for the
// REST calls we make: IAM Credentials signJwt (Firebase custom tokens), Firestore, and Vertex AI.
// On Cloud Run, ADC === the service account; locally it is the developer's ADC (only needed when the
// firebase/firestore/vertex toggles are on — dev/e2e default to off/memory/mock).
import { GoogleAuth } from "google-auth-library";

export const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "ethglobal-nyc2026-rtree";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

let cachedToken: { value: string; exp: number } | null = null;

/** A cloud-platform OAuth bearer token. Honors the credential's REAL expiry (not a fixed 50 min) so we
 *  never keep serving a token the metadata server already rotated/expired — the cause of sticky 401s on
 *  signJwt ("Request had invalid authentication credentials"). Pass force=true to bypass the cache and
 *  mint a fresh token (used to retry once after an auth failure). */
export async function accessToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cachedToken && cachedToken.exp - 60_000 > now) return cachedToken.value;
  const client = await auth.getClient();
  // Force the underlying client to re-fetch from the metadata server when we're recovering from a 401.
  if (force && typeof (client as { refreshAccessToken?: () => Promise<unknown> }).refreshAccessToken === "function") {
    try {
      await (client as { refreshAccessToken: () => Promise<unknown> }).refreshAccessToken();
    } catch {
      /* fall through to getAccessToken */
    }
  }
  const res = await client.getAccessToken();
  const value = typeof res === "string" ? res : res.token;
  if (!value) throw new Error("gcp: failed to obtain ADC access token");
  // Honor the credential's real expiry_date when available; otherwise fall back to a conservative 30 min
  // (metadata tokens live ~1h, but a cached one may have far less left — never assume 50 min).
  const expiryDate = (client as { credentials?: { expiry_date?: number } }).credentials?.expiry_date;
  const exp = typeof expiryDate === "number" && expiryDate > now ? expiryDate : now + 30 * 60_000;
  cachedToken = { value, exp };
  return value;
}

/** Drop the cached access token so the next accessToken() re-mints from the metadata server. */
export function invalidateAccessToken(): void {
  cachedToken = null;
}


/** The service-account email this process runs as (for signJwt iss/sub). Cloud Run: from metadata or
 *  env; local: from INTENTOS_SA_EMAIL. */
let cachedSaEmail: string | null = null;
export async function serviceAccountEmail(): Promise<string> {
  if (cachedSaEmail) return cachedSaEmail;
  if (process.env.INTENTOS_SA_EMAIL) return (cachedSaEmail = process.env.INTENTOS_SA_EMAIL);
  // Cloud Run / GCE metadata server.
  try {
    const r = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (r.ok) return (cachedSaEmail = (await r.text()).trim());
  } catch {
    /* not on GCP */
  }
  // Fall back to the known panel SA.
  return (cachedSaEmail = `intentos-panel@${PROJECT_ID}.iam.gserviceaccount.com`);
}
