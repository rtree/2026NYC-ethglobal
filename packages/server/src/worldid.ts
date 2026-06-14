// World ID v4 (Proof of Human) — server side. plan/110-worldid-integration.md.
//
// IntentOS uses World ID as a HUMAN-PROOF ABUSE GATE before runtime creation (North Star §2): each
// Agent spins up a real Cloud Run runtime, so a wallet alone must not be able to mass-create them. The
// proof is verified HERE (never trusted from the client) and bound to the signed-in Owner EOA, and the
// nullifier is stored uniquely so one human can't farm many accounts through the gate.
//
// This module is self-contained and degrades safely: when not configured (no app_id/rp_id, or
// INTENTOS_WORLDID=off) `worldIdEnabled()` is false and the app keeps the clearly-labeled dev mock.
//
// SECURITY: the RP signing key authenticates our app to the protocol. It lives ONLY in Secret Manager
// (or an env for local dev), never in a VITE_* var, never logged. Signing happens server-side only.
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const sm = new SecretManagerServiceClient();

const APP_ID = process.env.WORLDID_APP_ID ?? "";
const RP_ID = process.env.WORLDID_RP_ID ?? "";
const ACTION = process.env.WORLDID_ACTION ?? "intentos-onboarding";
const ENVIRONMENT = (process.env.WORLDID_ENVIRONMENT as "production" | "staging") ?? "production";
const SIGNING_KEY_SECRET =
  process.env.WORLDID_SIGNING_KEY_SECRET ??
  "projects/ethglobal-nyc2026-rtree/secrets/worldid-rp-signing-key/versions/latest";

const VERIFY_BASE = "https://developer.world.org/api/v4/verify";

let _signingKey: string | null = null;
async function loadSigningKey(): Promise<string> {
  if (_signingKey) return _signingKey;
  // Local/dev override (never used in prod): a raw key in the env.
  if (process.env.WORLDID_RP_SIGNING_KEY) {
    _signingKey = process.env.WORLDID_RP_SIGNING_KEY.trim();
    return _signingKey;
  }
  const [v] = await sm.accessSecretVersion({ name: SIGNING_KEY_SECRET });
  const raw = v.payload?.data?.toString().trim();
  if (!raw) throw new Error("WorldID: RP signing key secret is empty");
  _signingKey = raw;
  return _signingKey;
}

/** Whether the SERVER enforces World ID. Single source of truth (mirrors authEnabled / ownerMode):
 *  the client must learn this from /api/config, not decide from its own build flag. Enabled requires a
 *  configured Developer-Portal app (app_id + rp_id); the signing key is checked lazily on first sign. */
export function worldIdEnabled(): boolean {
  const flag = (process.env.INTENTOS_WORLDID ?? "").toLowerCase();
  if (flag === "off") return false;
  return !!(APP_ID && RP_ID);
}

export function worldIdConfig() {
  return { appId: APP_ID, rpId: RP_ID, action: ACTION, environment: ENVIRONMENT };
}

/** Step 3: sign the RP request in the backend. Returns the snake_case fields IDKit's rp_context wants. */
export async function signRpRequest(action: string = ACTION) {
  const signingKeyHex = await loadSigningKey();
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex, action });
  return { sig, nonce, created_at: createdAt, expires_at: expiresAt };
}

type IdkitResponseItem = { identifier?: string; signal_hash?: string; nullifier?: string };
type IdkitPayload = {
  action?: string;
  environment?: string;
  responses?: IdkitResponseItem[];
  // legacy/flat shapes (be defensive across proof versions):
  nullifier_hash?: string;
  nullifier?: string;
  signal_hash?: string;
};

/** Pull the nullifier + signal_hash out of an IDKit result payload, tolerating shape differences. */
export function extractProofFields(payload: unknown): { nullifier: string | null; signalHash: string | null } {
  const p = (payload ?? {}) as IdkitPayload;
  const first = Array.isArray(p.responses) && p.responses.length > 0 ? p.responses[0] : undefined;
  const nullifier = first?.nullifier ?? p.nullifier_hash ?? p.nullifier ?? null;
  const signalHash = first?.signal_hash ?? p.signal_hash ?? null;
  return { nullifier, signalHash };
}

/** Does the proof's signal bind to the given Owner address? (signal = address; we re-check server-side.) */
export function signalMatchesAddress(signalHash: string | null, address: string): boolean {
  if (!signalHash) return false;
  try {
    return hashSignal(address.toLowerCase()).toLowerCase() === signalHash.toLowerCase();
  } catch {
    return false;
  }
}

/** Step 5: verify the proof in the backend by forwarding the IDKit payload BYTE-FOR-BYTE to World. */
export async function verifyProof(payload: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (!RP_ID) throw new Error("WorldID: WORLDID_RP_ID not configured");
  const res = await fetch(`${VERIFY_BASE}/${RP_ID}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload), // do NOT mutate/re-encode fields
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
