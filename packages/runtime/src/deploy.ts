// Deploys the ExecutionDelegate7702 implementation (the 7702 delegate target) + AgentNFT, using the
// Foundry build artifacts. The delegate impl is deployed ONCE; every Owner EOA delegates to it and
// keeps independent storage in its own account (010 §6 / North Star EIP-7702 model).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { ExecutionDelegate7702Abi, AgentNFTAbi } from "@intentos/shared";

function artifact(name: string): { abi: unknown; bytecode: Hex } {
  const here = dirname(fileURLToPath(import.meta.url));
  const j = JSON.parse(
    readFileSync(resolve(here, `../../../contracts/out/${name}.sol/${name}.json`), "utf8"),
  );
  return { abi: j.abi, bytecode: j.bytecode.object as Hex };
}

function deployedAddress(receipt: { status: "success" | "reverted"; contractAddress?: Address | null | undefined }, what: string): Address {
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${what} deployment failed`);
  return receipt.contractAddress;
}

export async function deployContracts(
  wallet: WalletClient,
  pub: PublicClient,
  deployer: Account,
): Promise<{ delegateImpl: Address; agentNft: Address }> {
  const del = artifact("ExecutionDelegate7702");
  const nft = artifact("AgentNFT");

  const h1 = await wallet.deployContract({
    abi: ExecutionDelegate7702Abi as never,
    bytecode: del.bytecode,
    account: deployer,
    chain: wallet.chain,
  });
  const delegateImpl = deployedAddress(await pub.waitForTransactionReceipt({ hash: h1 }), "ExecutionDelegate7702");

  const h2 = await wallet.deployContract({
    abi: AgentNFTAbi as never,
    bytecode: nft.bytecode,
    account: deployer,
    chain: wallet.chain,
    args: [],
  });
  const agentNft = deployedAddress(await pub.waitForTransactionReceipt({ hash: h2 }), "AgentNFT");

  return { delegateImpl, agentNft };
}
