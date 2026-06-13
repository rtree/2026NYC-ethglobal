// Relayer: fronts gas and submits to the delegate (010 §5 — only the contract is authority).
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { ExecutionDelegate7702Abi, type ExecutionRequest, type GuardPatch } from "@intentos/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;

export async function relaySubmitExecution(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  r: ExecutionRequest,
  reason: string,
  sig: Hex,
  account: Account | Address,
): Promise<Hex> {
  const hash = await wallet.writeContract({
    address: delegate,
    abi,
    functionName: "submitExecutionRequest",
    args: [r, reason, sig],
    account,
    chain: wallet.chain,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function relayWatcherTighten(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  patch: GuardPatch,
  sig: Hex,
  account: Account | Address,
): Promise<Hex> {
  const hash = await wallet.writeContract({
    address: delegate,
    abi,
    functionName: "watcherTighten",
    args: [patch, sig],
    account,
    chain: wallet.chain,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function relayWatcherFreeze(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  sig: Hex,
  account: Account | Address,
): Promise<Hex> {
  const hash = await wallet.writeContract({
    address: delegate,
    abi,
    functionName: "watcherFreeze",
    args: [sig],
    account,
    chain: wallet.chain,
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
