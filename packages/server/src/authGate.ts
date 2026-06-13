// Per-wallet gate for /api/* (plan/010 §17). When auth is enabled, requires a verified Firebase ID
// token (Bearer) and returns its uid. When off (dev/e2e only), returns a fixed dev uid so the
// per-wallet store still works without GCP. Also a tiny per-uid token-bucket rate limiter.
import type { IncomingMessage } from "node:http";
import { verifyIdToken } from "./firebaseAuth.js";

const DEV_UID = "eip155:8453:0xdev0000000000000000000000000000000000dev";

/** True when running on a Google-managed runtime (Cloud Run sets these). Used to fail closed. */
export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    !!process.env.K_SERVICE || // Cloud Run service name
    !!process.env.GOOGLE_CLOUD_PROJECT
  );
}

/**
 * Auth is FAIL-CLOSED: enabled unless EXPLICITLY turned off, and "off" is REFUSED in production so a
 * leaked/missing env var can never silently open the money-write endpoints. Dev/e2e must opt out with
 * INTENTOS_AUTH=off (only honored off-prod).
 */
export function authEnabled(): boolean {
  const v = (process.env.INTENTOS_AUTH ?? "").toLowerCase();
  if (v === "off") {
    if (isProductionRuntime()) {
      console.warn("[auth] INTENTOS_AUTH=off ignored in production runtime — auth stays ENABLED (fail-closed)");
      return true;
    }
    return false; // dev/e2e opt-out
  }
  // default (unset or "firebase") => enabled
  return true;
}

/** Resolve the caller's uid, or throw 401-worthy error. */
export async function requireUid(req: IncomingMessage): Promise<string> {
  if (!authEnabled()) return DEV_UID;
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Bearer ")) throw new Error("missing bearer token");
  const verified = await verifyIdToken(h.slice(7).trim());
  return verified.uid;
}

// --- token bucket rate limiter (per uid) ---
const buckets = new Map<string, { tokens: number; last: number }>();

/** Allow up to `burst` calls, refilling `perSec` tokens/second. Returns false when limited. */
export function rateLimit(uid: string, burst = 8, perSec = 0.5): boolean {
  const now = Date.now();
  const b = buckets.get(uid) ?? { tokens: burst, last: now };
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(burst, b.tokens + elapsed * perSec);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(uid, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(uid, b);
  return true;
}

export { DEV_UID };
