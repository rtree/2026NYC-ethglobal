// EIP-7702 owner setup: the Owner EOA delegates to the ExecutionDelegate7702 impl and, in the same
// self-transaction, initializes its HardGuardState (msg.sender == address(this) == Owner). Then funds
// the executor gas-vault lane. This is the on-chain half of mock screens 040/060.
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { encodeFunctionData } from "viem";
import { ExecutionDelegate7702Abi, type HardGuardState } from "@intentos/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;

function assertTxSuccess(status: "success" | "reverted", what: string, hash: Hex) {
  if (status !== "success") throw new Error(`${what} reverted on-chain (tx ${hash})`);
}

export interface InitParams {
  guard: HardGuardState;
  sessionKey: Address;
  watcherKey: Address;
  relayer: Address;
  gasPerTxCap: bigint;
  initialExecVault: bigint;
  initialWatcherVault: bigint;
  packageHash: Hex;
  semanticGuardHash: Hex;
}

/** Delegate the Owner EOA to `delegateImpl` and call initialize() in one self-tx. Returns the tx hash. */
export async function delegateAndInitialize(
  wallet: WalletClient,
  pub: PublicClient,
  owner: Account,
  delegateImpl: Address,
  p: InitParams,
): Promise<Hex> {
  // executor: 'self' tells viem the authorizing account also sends the tx (nonce += 1 handling).
  const authorization = await wallet.signAuthorization({
    account: owner,
    contractAddress: delegateImpl,
    executor: "self",
  });

  const data = encodeFunctionData({
    abi,
    functionName: "initialize",
    args: [
      p.guard,
      p.sessionKey,
      p.watcherKey,
      p.relayer,
      p.gasPerTxCap,
      p.initialExecVault,
      p.initialWatcherVault,
      p.packageHash,
      p.semanticGuardHash,
    ],
  });

  const hash = await wallet.sendTransaction({
    account: owner,
    to: owner.address, // self-call: msg.sender == address(this) == Owner EOA
    data,
    authorizationList: [authorization],
    chain: wallet.chain,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  assertTxSuccess(rcpt.status, "delegate and initialize", hash);
  return hash;
}

/** Fund a gas-vault lane (executor=false / watcher=true). Owner self-call. */
export async function fundGasVault(
  wallet: WalletClient,
  pub: PublicClient,
  owner: Account,
  watcherLane: boolean,
  amount: bigint,
): Promise<Hex> {
  const data = encodeFunctionData({ abi, functionName: "fundGasVault", args: [watcherLane, amount] });
  const hash = await wallet.sendTransaction({
    account: owner,
    to: owner.address,
    data,
    chain: wallet.chain,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  assertTxSuccess(rcpt.status, "fund gas vault", hash);
  return hash;
}
