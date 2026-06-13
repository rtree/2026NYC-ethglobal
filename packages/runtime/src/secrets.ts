// Loads accounts from GCP Secret Manager. Keys never touch disk or logs.
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { privateKeyToAccount } from "viem/accounts";
import { SECRETS } from "@intentos/shared";
import type { Hex } from "viem";

const sm = new SecretManagerServiceClient();

async function loadAccount(secretName: string) {
  const [version] = await sm.accessSecretVersion({ name: secretName });
  const raw = version.payload?.data?.toString().trim();
  if (!raw) throw new Error(`Secret Manager: empty secret ${secretName}`);
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return privateKeyToAccount(pk);
}

/** Platform = deployer + relayer (gas sponsor). */
export function getPlatformAccount() {
  return loadAccount(SECRETS.platformWalletKey);
}

/** Owner = the demo Owner EOA that gets 7702-delegated and holds the USDC. */
export function getOwnerAccount() {
  return loadAccount("projects/ethglobal-nyc2026-rtree/secrets/owner-test-wallet-key/versions/latest");
}

/** Optional Base RPC URL from Secret Manager (e.g. an Alchemy URL with an embedded key). Returns the
 *  public endpoint if the secret is absent, so nothing breaks without it. The secret never appears in
 *  source, logs, or chat. */
export async function getBaseRpcUrl(): Promise<string> {
  if (process.env.INTENTOS_RPC) return process.env.INTENTOS_RPC;
  try {
    const [v] = await sm.accessSecretVersion({
      name: "projects/ethglobal-nyc2026-rtree/secrets/base-rpc-url/versions/latest",
    });
    const url = v.payload?.data?.toString().trim();
    if (url) return url;
  } catch {
    /* secret not set yet — fall through to public */
  }
  return "https://mainnet.base.org";
}

// Well-known public Base mainnet RPCs used as fallbacks (no key). Ordered roughly by reliability.
const PUBLIC_BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://1rpc.io/base",
];

/**
 * An ORDERED, de-duplicated list of Base mainnet RPC URLs for a viem fallback() transport, so a single
 * endpoint failing (rate-limit, 5xx, the Infura "no access" blip we hit) auto-fails over to the next.
 * Order: explicit override(s) in INTENTOS_RPC (comma/space separated) -> the keyed providers in the
 * `base-rpc-urls` secret (Alchemy, Infura, ...) -> the legacy single `base-rpc-url` secret -> public
 * RPCs. Secrets/keys never get logged. Returns at least one URL.
 */
export async function getBaseRpcUrls(): Promise<string[]> {
  const urls: string[] = [];
  const push = (u?: string | null) => {
    const t = (u ?? "").trim();
    if (t && !urls.includes(t)) urls.push(t);
  };

  // 1) explicit override(s): INTENTOS_RPC may hold one URL or several (comma / whitespace separated)
  if (process.env.INTENTOS_RPC) {
    for (const u of process.env.INTENTOS_RPC.split(/[\s,]+/)) push(u);
  }
  // 2) keyed providers list (Alchemy + Infura + ...), newline/comma separated, ordered by preference
  try {
    const [v] = await sm.accessSecretVersion({
      name: "projects/ethglobal-nyc2026-rtree/secrets/base-rpc-urls/versions/latest",
    });
    const blob = v.payload?.data?.toString() ?? "";
    for (const u of blob.split(/[\s,]+/)) push(u);
  } catch {
    /* secret not set */
  }
  // 3) the legacy single keyed secret (kept for back-compat)
  try {
    const [v] = await sm.accessSecretVersion({
      name: "projects/ethglobal-nyc2026-rtree/secrets/base-rpc-url/versions/latest",
    });
    push(v.payload?.data?.toString());
  } catch {
    /* secret not set */
  }
  // 4) public RPCs (always appended so there is always a fallback)
  for (const u of PUBLIC_BASE_RPCS) push(u);

  return urls.length ? urls : ["https://mainnet.base.org"];
}
