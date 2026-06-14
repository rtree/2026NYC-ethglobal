import type { Address, Hex } from "viem";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletClientLike = {
  account?: Address | { address?: Address };
  sendTransaction: (tx: { account?: Address; to: Address; data: Hex }) => Promise<Hex>;
};

export function walletErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const r = e as Record<string, unknown>;
    for (const key of ["shortMessage", "message", "details", "reason"]) {
      const v = r[key];
      if (typeof v === "string" && v) return v;
    }
    const data = r.data;
    if (data && typeof data === "object") {
      const msg = (data as Record<string, unknown>).message;
      if (typeof msg === "string" && msg) return msg;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}

function walletAccount(walletClient: WalletClientLike | undefined, fallback: Address | undefined): Address | undefined {
  const a = walletClient?.account;
  if (typeof a === "string") return a;
  return a?.address ?? fallback;
}

export async function sendOwnerSelfCall(
  walletClient: WalletClientLike | undefined,
  from: Address | undefined,
  to: Address,
  data: Hex,
): Promise<Hex> {
  const account = walletAccount(walletClient, from);
  let walletClientError: unknown;
  if (walletClient) {
    try {
      return await walletClient.sendTransaction(account ? { account, to, data } : { to, data });
    } catch (e) {
      walletClientError = e;
    }
  }

  const eth = (globalThis as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth || !account) {
    const suffix = walletClientError ? `: ${walletErrorMessage(walletClientError)}` : "";
    throw new Error(`wallet client not ready; reconnect your wallet${suffix}`);
  }
  try {
    return (await eth.request({ method: "eth_sendTransaction", params: [{ from: account, to, data }] })) as Hex;
  } catch (e) {
    if (!walletClientError) throw new Error(walletErrorMessage(e));
    throw new Error(`${walletErrorMessage(e)} (walletClient fallback after: ${walletErrorMessage(walletClientError)})`);
  }
}
