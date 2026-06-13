// Web3 login (SIWE / EIP-4361-style). The wallet signature is the primary credential; on success we
// mint a Firebase custom token (firebaseAuth.ts) so the browser can sign into Firebase Auth.
// uid = CAIP-10 `eip155:<chainId>:<lowercased address>` (plan/010 §17).
import { randomBytes } from "node:crypto";
import { createPublicClient, fallback, http, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
import { getBaseRpcUrls } from "@intentos/runtime";
import { mintCustomToken } from "./firebaseAuth.js";

const CHAIN_ID = 8453;

// A Base public client used to verify signatures. CRITICAL: we use the CLIENT verifyMessage (not the
// standalone one) so it handles smart-account signatures — ERC-1271 (contract wallets) and ERC-6492
// (pre-deploy), AND EIP-7702-delegated EOAs (MetaMask Smart Account etc.). The standalone verifyMessage
// only does EOA ecrecover and FAILS for those wallets ("invalid signature").
let _verifyClient: PublicClient | null = null;
async function verifyClient(): Promise<PublicClient> {
  if (_verifyClient) return _verifyClient;
  const rpcs = await getBaseRpcUrls();
  const transport = fallback(rpcs.map((u) => http(u, { retryCount: 2, retryDelay: 500 })));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _verifyClient = createPublicClient({ chain: base, transport }) as any;
  return _verifyClient!;
}

// nonce store: address -> array of recent { nonce, exp }. We keep several outstanding nonces per
// address (not just the latest) so retried / concurrent GET /api/auth/nonce calls don't invalidate a
// message the wallet is still signing (which produced "nonce mismatch"). Single-use: consumed on verify.
const nonces = new Map<string, { nonce: string; exp: number }[]>();
const NONCE_TTL_MS = 10 * 60_000;
const MAX_NONCES_PER_ADDR = 6;

export function issueNonce(address: string): string {
  const nonce = randomBytes(16).toString("hex");
  const key = address.toLowerCase();
  const now = Date.now();
  const list = (nonces.get(key) ?? []).filter((n) => n.exp > now); // drop expired
  list.push({ nonce, exp: now + NONCE_TTL_MS });
  if (list.length > MAX_NONCES_PER_ADDR) list.splice(0, list.length - MAX_NONCES_PER_ADDR);
  nonces.set(key, list);
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

  const key = address.toLowerCase();
  const now = Date.now();
  const list = (nonces.get(key) ?? []).filter((n) => n.exp > now);
  if (list.length === 0) throw new Error("unknown or expired nonce; request a new one");
  const idx = list.findIndex((n) => n.nonce === nonceInMsg);
  if (idx === -1) throw new Error("nonce mismatch");
  // single-use: consume this nonce now (keep the rest so a parallel handshake can still complete)
  list.splice(idx, 1);
  nonces.set(key, list);

  // Verify via the public client so smart-account / 7702 signatures (ERC-1271/6492) are accepted, not
  // just plain EOA ecrecover. If RPC is unreachable, fall back to a local EOA check so plain EOAs still
  // work offline.
  let ok = false;
  try {
    const client = await verifyClient();
    ok = await client.verifyMessage({ address: address as Address, message, signature });
  } catch {
    const { verifyMessage: verifyEoa } = await import("viem");
    ok = await verifyEoa({ address: address as Address, message, signature }).catch(() => false);
  }
  if (!ok) throw new Error("invalid signature");

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
