// Relayer: fronts gas and submits to the delegate (010 §5 — only the contract is authority).
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { ExecutionDelegate7702Abi, type ExecutionRequest, type GuardPatch } from "@intentos/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;

/** Thrown when a relayed tx is mined but REVERTED. Carries the hash so the UI can link to it. */
export class TxRevertedError extends Error {
  constructor(public readonly txHash: Hex, what: string) {
    super(`${what} reverted on-chain (tx ${txHash})`);
    this.name = "TxRevertedError";
  }
}

async function submitAndConfirm(
  wallet: WalletClient,
  pub: PublicClient,
  what: string,
  args: { address: Address; functionName: string; args: unknown[]; account: Account | Address },
): Promise<Hex> {
  const hash = await wallet.writeContract({
    address: args.address,
    abi,
    functionName: args.functionName,
    args: args.args,
    account: args.account,
    chain: wallet.chain,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  // CRITICAL: a mined tx can still have reverted. Surface it instead of reporting false success.
  if (receipt.status !== "success") throw new TxRevertedError(hash, what);
  return hash;
}

export async function relaySubmitExecution(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  r: ExecutionRequest,
  reason: string,
  sig: Hex,
  account: Account | Address,
): Promise<Hex> {
  return submitAndConfirm(wallet, pub, "guarded execution", {
    address: delegate,
    functionName: "submitExecutionRequest",
    args: [r, reason, sig],
    account,
  });
}

export async function relayWatcherTighten(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  patch: GuardPatch,
  sig: Hex,
  account: Account | Address,
): Promise<Hex> {
  return submitAndConfirm(wallet, pub, "watcher tighten", {
    address: delegate,
    functionName: "watcherTighten",
    args: [patch, sig],
    account,
  });
}

export async function relayWatcherFreeze(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  sig: Hex,
  account: Account | Address,
): Promise<Hex> {
  return submitAndConfirm(wallet, pub, "watcher freeze", {
    address: delegate,
    functionName: "watcherFreeze",
    args: [sig],
    account,
  });
}
