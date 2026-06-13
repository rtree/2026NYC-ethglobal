// Web3 login (SIWE / EIP-4361-style). The wallet signature is the primary credential; on success we
// mint a Firebase custom token (firebaseAuth.ts) so the browser can sign into Firebase Auth.
// uid = CAIP-10 `eip155:<chainId>:<lowercased address>` (plan/010 §17).
import { randomBytes } from "node:crypto";
import { verifyMessage, type Address } from "viem";
import { mintCustomToken } from "./firebaseAuth.js";

const CHAIN_ID = 8453;

// nonce store: address -> { nonce, exp }. In-memory is fine (short TTL, single demo instance).
const nonces = new Map<string, { nonce: string; exp: number }>();
const NONCE_TTL_MS = 10 * 60_000;

export function issueNonce(address: string): string {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(address.toLowerCase(), { nonce, exp: Date.now() + NONCE_TTL_MS });
  return nonce;
}

/** The exact message the wallet must sign. Domain-bound to prevent cross-site replay. */
export function siweMessage(address: string, nonce: string, domain: string): string {
  const issuedAt = new Date().toISOString();
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to IntentOS. This request will not trigger a blockchain transaction or cost any gas.",
    "",
    `URI: https://${domain}`,
    `Version: 1`,
    `Chain ID: ${CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function uidFor(address: string): string {
  return `eip155:${CHAIN_ID}:${address.toLowerCase()}`;
}

/** Verify the signed SIWE message, consume the nonce, and mint a Firebase custom token. */
export async function verifyAndMint(message: string, signature: `0x${string}`): Promise<{
  customToken: string;
  uid: string;
  address: string;
}> {
  const address = extractField(message, "account:\n", "\n") ?? extractLine2(message);
  if (!address) throw new Error("could not parse address from message");
  const nonceInMsg = extractField(message, "Nonce: ", "\n");
  if (!nonceInMsg) throw new Error("no nonce in message");

  const rec = nonces.get(address.toLowerCase());
  if (!rec) throw new Error("unknown or expired nonce; request a new one");
  if (rec.exp < Date.now()) {
    nonces.delete(address.toLowerCase());
    throw new Error("nonce expired");
  }
  if (rec.nonce !== nonceInMsg) throw new Error("nonce mismatch");

  const ok = await verifyMessage({ address: address as Address, message, signature });
  if (!ok) throw new Error("invalid signature");

  // single-use nonce
  nonces.delete(address.toLowerCase());

  const uid = uidFor(address);
  const customToken = await mintCustomToken(uid, { address: address.toLowerCase(), chainId: CHAIN_ID });
  return { customToken, uid, address: address.toLowerCase() };
}

// minimal field extractors (avoid a full SIWE parser dep)
function extractField(msg: string, after: string, until: string): string | null {
  const i = msg.indexOf(after);
  if (i < 0) return null;
  const start = i + after.length;
  const end = msg.indexOf(until, start);
  return (end < 0 ? msg.slice(start) : msg.slice(start, end)).trim();
}
function extractLine2(msg: string): string | null {
  const lines = msg.split("\n");
  return lines[1]?.trim() || null;
}
