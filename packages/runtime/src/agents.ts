// Agent NFT minting + owner-only guard updates (resume/loosen). Server-side write helpers reused by
// the control-panel API. Platform account is the AgentNFT owner (Ownable); the Owner EOA is the
// 7702-delegated account that holds funds and whose guard is updated by an owner self-call.
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { decodeEventLog, encodeFunctionData } from "viem";
import { AgentNFTAbi, ExecutionDelegate7702Abi, type HardGuardState } from "@intentos/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nftAbi = AgentNFTAbi as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delAbi = ExecutionDelegate7702Abi as any;

export interface MintResult {
  tokenId: bigint;
  txHash: Hex;
}

function tokenIdFromLogs(logs: readonly { data: Hex; topics: readonly Hex[] }[], event: string): bigint {
  for (const log of logs) {
    try {
      const ev = decodeEventLog({
        abi: nftAbi,
        data: log.data,
        topics: log.topics as [signature: Hex, ...args: Hex[]],
      }) as {
        eventName: string;
        args: Record<string, unknown>;
      };
      if (ev.eventName === event) return ev.args.tokenId as bigint;
    } catch {
      /* not ours */
    }
  }
  throw new Error(`mint: ${event} not found in logs`);
}

export async function mintExecutorNft(
  wallet: WalletClient,
  pub: PublicClient,
  platform: Account,
  agentNft: Address,
  ownerEoa: Address,
  args: { agentManifestHash: Hex; runtimeManifestHash: Hex; intentId: Hex; executionContract: Address; hardGuardrailsHash: Hex },
): Promise<MintResult> {
  const hash = await wallet.writeContract({
    address: agentNft,
    abi: nftAbi,
    functionName: "mintExecutor",
    args: [
      ownerEoa,
      { role: 0, agentManifestHash: args.agentManifestHash, runtimeManifestHash: args.runtimeManifestHash },
      { fundOwner: ownerEoa, intentId: args.intentId, executionContract: args.executionContract, hardGuardrailsHash: args.hardGuardrailsHash },
    ],
    account: platform,
    chain: wallet.chain,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  return { tokenId: tokenIdFromLogs(rcpt.logs as never, "ExecutorMinted"), txHash: hash };
}

export async function mintWatcherNft(
  wallet: WalletClient,
  pub: PublicClient,
  platform: Account,
  agentNft: Address,
  ownerEoa: Address,
  args: {
    agentManifestHash: Hex;
    runtimeManifestHash: Hex;
    watchedExecutorTokenId: bigint;
    watchedIntentId: Hex;
    executorPackageHash: Hex;
    hardGuardrailsHash: Hex;
    semanticGuardrailsHash: Hex;
    watcherPackageHash: Hex;
  },
): Promise<MintResult> {
  const hash = await wallet.writeContract({
    address: agentNft,
    abi: nftAbi,
    functionName: "mintWatcher",
    args: [
      ownerEoa,
      { role: 1, agentManifestHash: args.agentManifestHash, runtimeManifestHash: args.runtimeManifestHash },
      {
        watchedExecutorTokenId: args.watchedExecutorTokenId,
        watchedIntentId: args.watchedIntentId,
        executorPackageHash: args.executorPackageHash,
        hardGuardrailsHash: args.hardGuardrailsHash,
        semanticGuardrailsHash: args.semanticGuardrailsHash,
        watcherPackageHash: args.watcherPackageHash,
        quorumSetId: 1n,
      },
    ],
    account: platform,
    chain: wallet.chain,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  return { tokenId: tokenIdFromLogs(rcpt.logs as never, "WatcherMinted"), txHash: hash };
}

/** Owner-only guard replacement (the resume / loosen path — only the Owner can do this, 010 §14).
 *  Sent as a 7702 self-call (msg.sender == address(this) == Owner EOA). bindingNonce is preserved
 *  on-chain by the contract. */
export async function ownerUpdateGuard(
  wallet: WalletClient,
  pub: PublicClient,
  owner: Account,
  newGuard: HardGuardState,
): Promise<Hex> {
  const data = encodeFunctionData({ abi: delAbi, functionName: "ownerUpdateGuard", args: [newGuard] });
  const hash = await wallet.sendTransaction({ account: owner, to: owner.address, data, chain: wallet.chain });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function readGuard(pub: PublicClient, ownerEoa: Address): Promise<HardGuardState> {
  return (await pub.readContract({ address: ownerEoa, abi: delAbi, functionName: "guard" })) as HardGuardState;
}
