// Redeploys AgentNFT (after the _mint change) and writes the new address into deployments.
// Usage: tsx packages/runtime/scripts/deploy-agentnft.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import { AgentNFTAbi } from "@intentos/shared";
import { getBaseRpcUrl, getPlatformAccount } from "../src/index.js";

function artifactBytecode(): Hex {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(resolve(here, "../../../contracts/out/AgentNFT.sol/AgentNFT.json"), "utf8")).bytecode.object as Hex;
}

async function main() {
  const platform = await getPlatformAccount();
  const rpc = await getBaseRpcUrl();
  const transport = http(rpc, { retryCount: 5, retryDelay: 800 });
  const pub = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ chain: base, transport });

  console.log("deploying AgentNFT from", platform.address);
  const hash = await wallet.deployContract({ abi: AgentNFTAbi as never, bytecode: artifactBytecode(), account: platform, chain: base });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  const addr = rcpt.contractAddress;
  console.log("AgentNFT:", addr, "tx:", hash);

  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../../../deployments/base-mainnet.json");
  const j = JSON.parse(readFileSync(path, "utf8"));
  j.contracts.agentNFT = addr;
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
  console.log("updated deployments/base-mainnet.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
