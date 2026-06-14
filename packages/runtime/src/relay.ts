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
  const hash = await writeContractWithFreshNonce(wallet, pub, args);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  // CRITICAL: a mined tx can still have reverted. Surface it instead of reporting false success.
  if (receipt.status !== "success") throw new TxRevertedError(hash, what);
  return hash;
}

const nonceLocks = new Map<string, Promise<unknown>>();

function accountAddress(account: Account | Address): Address {
  return (typeof account === "string" ? account : account.address) as Address;
}

function isNonceTooLow(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /nonce (provided .*lower|too low)|tx nonce/i.test(msg);
}

async function withAccountNonceLock<T>(account: Account | Address, fn: () => Promise<T>): Promise<T> {
  const key = accountAddress(account).toLowerCase();
  const prev = nonceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => next, () => next);
  nonceLocks.set(key, chained);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (nonceLocks.get(key) === chained) nonceLocks.delete(key);
  }
}

async function writeContractWithFreshNonce(
  wallet: WalletClient,
  pub: PublicClient,
  args: { address: Address; functionName: string; args: unknown[]; account: Account | Address },
): Promise<Hex> {
  return withAccountNonceLock(args.account, async () => {
    const account = accountAddress(args.account);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const nonce = await pub.getTransactionCount({ address: account, blockTag: "pending" });
        const estimatedGas = await pub.estimateContractGas({
          address: args.address,
          abi,
          functionName: args.functionName,
          args: args.args,
          account: args.account,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        return await wallet.writeContract({
          address: args.address,
          abi,
          functionName: args.functionName,
          args: args.args,
          account: args.account,
          chain: wallet.chain,
          nonce,
          gas: (estimatedGas * 3n) / 2n + 50_000n,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      } catch (e) {
        lastErr = e;
        if (!isNonceTooLow(e)) throw e;
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      }
    }
    throw lastErr;
  });
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
