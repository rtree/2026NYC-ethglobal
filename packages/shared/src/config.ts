// Non-secret config. Addresses + KMS refs from deployments/base-mainnet.json. NEVER store keys here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Address } from "viem";

export const CHAIN_ID = 8453;

export const TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  WETH: "0x4200000000000000000000000000000000000006" as Address,
};

export const UNISWAP = {
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  usdcWethPoolFee: 500,
};

export const KMS = {
  executorSessionKey:
    "projects/ethglobal-nyc2026-rtree/locations/us-central1/keyRings/intentos/cryptoKeys/executor-session-key",
  watcherSessionKey:
    "projects/ethglobal-nyc2026-rtree/locations/us-central1/keyRings/intentos/cryptoKeys/watcher-session-key",
};

export const SECRETS = {
  platformWalletKey: "projects/ethglobal-nyc2026-rtree/secrets/platform-wallet-key/versions/latest",
};

export interface Deployments {
  network: string;
  chainId: number;
  wallets: { platform: Address };
  contracts: { executionDelegate7702Impl: Address | null; agentNFT: Address | null };
}

/** Read deployments/base-mainnet.json. Override path with INTENTOS_DEPLOYMENTS. */
export function readDeployments(): Deployments {
  const here = dirname(fileURLToPath(import.meta.url));
  const path =
    process.env.INTENTOS_DEPLOYMENTS ?? resolve(here, "../../../deployments/base-mainnet.json");
  return JSON.parse(readFileSync(path, "utf8")) as Deployments;
}

/** Base RPC URL. Default to the public endpoint; override with BASE_RPC_URL (e.g. Alchemy). */
export function baseRpcUrl(): string {
  return process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
}
