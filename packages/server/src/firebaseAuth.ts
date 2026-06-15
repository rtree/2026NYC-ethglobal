// Web3 -> Firebase Auth bridge, with NO firebase-admin and NO service-account JSON key.
//
// Mint side: a Firebase custom token is a JWT (iss=sub=SA email, aud=IdentityToolkit, exp<=+1h, uid).
// We sign it key-LESSLY via the IAM Credentials `signJwt` REST API using ADC (the Cloud Run SA needs
// roles/iam.serviceAccountTokenCreator on itself).
//
// Verify side: inbound Firebase ID tokens are RS256 JWTs signed by Google's securetoken@system SA.
// We verify them with node crypto against the published x509 certs (no SDK). See plan/010 §17.
import { createPublicKey, createVerify } from "node:crypto";
import { accessToken, invalidateAccessToken, serviceAccountEmail, PROJECT_ID } from "./gcp.js";

const IDENTITYTOOLKIT_AUD =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Mint a Firebase custom token for `uid` with optional claims. Signed via IAM Credentials signJwt. */
export async function mintCustomToken(
  uid: string,
  claims: Record<string, unknown> = {},
): Promise<string> {
  const sa = await serviceAccountEmail();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa,
    sub: sa,
    aud: IDENTITYTOOLKIT_AUD,
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };
  // signJwt with the ADC token; if the metadata token was rotated/expired under us the call returns 401
  // ("Request had invalid authentication credentials"). That is NOT an IAM problem — retry ONCE with a
  // freshly minted token before surfacing the error.
  const signOnce = async (force: boolean): Promise<Response> => {
    const token = await accessToken(force);
    return fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:signJwt`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
      },
    );
  };
  let res = await signOnce(false);
  if (res.status === 401 || res.status === 403) {
    invalidateAccessToken();
    res = await signOnce(true);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`signJwt failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { signedJwt?: string };
  if (!data.signedJwt) throw new Error("signJwt: no signedJwt in response");
  return data.signedJwt;
}

// --- ID token verification ---
const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certCache: { certs: Record<string, string>; exp: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.exp > now) return certCache.certs;
  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error(`failed to fetch securetoken certs (${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  // Respect cache-control max-age; default 1h.
  const cc = res.headers.get("cache-control") ?? "";
  const m = cc.match(/max-age=(\d+)/);
  const ttl = m ? Number(m[1]) * 1000 : 3_600_000;
  certCache = { certs, exp: now + ttl };
  return certs;
}

export interface VerifiedIdToken {
  uid: string;
  address?: string;
  chainId?: number;
}

/** Verify a Firebase ID token (RS256, aud=projectId, iss=securetoken/<projectId>, not expired). */
export async function verifyIdToken(idToken: string): Promise<VerifiedIdToken> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed ID token");
  const [h, p, s] = parts;
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg: string; kid: string };
  const payload = JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>;
  if (header.alg !== "RS256") throw new Error("unexpected alg");

  const certs = await googleCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("unknown signing key");
  const key = createPublicKey(cert);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  if (!verifier.verify(key, Buffer.from(s, "base64url"))) throw new Error("bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) throw new Error("token expired");
  if (payload.aud !== PROJECT_ID) throw new Error("wrong audience");
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error("wrong issuer");
  const uid = String(payload.sub ?? payload.user_id ?? "");
  if (!uid) throw new Error("no subject");

  return { uid, address: payload.address as string | undefined, chainId: payload.chainId as number | undefined };
}

export { b64url, IDENTITYTOOLKIT_AUD };
