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
