// Minimal GCP access via ADC (no heavy SDKs). One GoogleAuth instance yields bearer tokens for the
// REST calls we make: IAM Credentials signJwt (Firebase custom tokens), Firestore, and Vertex AI.
// On Cloud Run, ADC === the service account; locally it is the developer's ADC (only needed when the
// firebase/firestore/vertex toggles are on — dev/e2e default to off/memory/mock).
import { GoogleAuth } from "google-auth-library";

export const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "ethglobal-nyc2026-rtree";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

let cachedToken: { value: string; exp: number } | null = null;

/** A cloud-platform OAuth bearer token (cached until ~1 min before expiry). */
export async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.exp - 60_000 > now) return cachedToken.value;
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  const value = typeof res === "string" ? res : res.token;
  if (!value) throw new Error("gcp: failed to obtain ADC access token");
  // google-auth-library refreshes ~1h tokens; cache for 50 min to be safe.
  cachedToken = { value, exp: now + 50 * 60_000 };
  return value;
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
