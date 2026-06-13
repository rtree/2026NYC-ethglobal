// Loads the platform (relayer/deployer) account from GCP Secret Manager. Key never touches disk/logs.
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { privateKeyToAccount } from "viem/accounts";
import { SECRETS } from "@intentos/shared";
import type { Hex } from "viem";

const sm = new SecretManagerServiceClient();

export async function getPlatformAccount() {
  const [version] = await sm.accessSecretVersion({ name: SECRETS.platformWalletKey });
  const raw = version.payload?.data?.toString().trim();
  if (!raw) throw new Error("Secret Manager: empty platform key");
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return privateKeyToAccount(pk);
}
