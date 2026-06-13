// Dashboard data comes from the control-panel server (/api/state), same-origin. The server reads Base
// mainnet with its Infura RPC; the browser never sees an RPC key and there's no CORS / rate-limit.
import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";

export interface GuardView {
  tokenA: Address;
  tokenB: Address;
  amountCapPerTx: bigint;
  cumulativeCap: bigint;
  slippageCapBps: number;
  expiry: bigint;
  frozen: boolean;
  bindingNonce: bigint;
}

export interface TimelineItem {
  kind: "evidence" | "tighten" | "freeze";
  title: string;
  reason: string;
  txHash: Hex;
  blockNumber: bigint;
}

export interface ActionItem {
  at: number;
  action: string;
  txHash?: Hex;
  ok: boolean;
  detail?: string;
}

export interface ChainState {
  delegate: Address;
  agentNft: Address;
  sessionKey: Address;
  watcherKey: Address;
  delegated: boolean;
  guard: GuardView | null;
  cumulativeSpent: bigint;
  execVault: bigint;
  watcherVault: bigint;
  usdc: bigint;
  weth: bigint;
  timeline: TimelineItem[];
  session: { executorTokenId: string | null; watcherTokenId: string | null };
  actions: ActionItem[];
}

let lastGood: ChainState | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapState(d: any): ChainState {
  return {
    delegate: d.delegate,
    agentNft: d.agentNft,
    sessionKey: d.sessionKey,
    watcherKey: d.watcherKey,
    delegated: d.delegated,
    guard: d.guard
      ? {
          tokenA: d.guard.tokenA,
          tokenB: d.guard.tokenB,
          amountCapPerTx: BigInt(d.guard.amountCapPerTx),
          cumulativeCap: BigInt(d.guard.cumulativeCap),
          slippageCapBps: Number(d.guard.slippageCapBps),
          expiry: BigInt(d.guard.expiry),
          frozen: d.guard.frozen,
          bindingNonce: BigInt(d.guard.bindingNonce),
        }
      : null,
    cumulativeSpent: BigInt(d.cumulativeSpent),
    execVault: BigInt(d.execVault),
    watcherVault: BigInt(d.watcherVault),
    usdc: BigInt(d.usdc),
    weth: BigInt(d.weth),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timeline: (d.timeline ?? []).map((t: any) => ({ ...t, blockNumber: BigInt(t.blockNumber) })),
    session: d.session ?? { executorTokenId: null, watcherTokenId: null },
    actions: d.actions ?? [],
  };
}

export async function loadChainState(): Promise<ChainState> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`/api/state ${res.status}`);
  const d = await res.json();
  const s = mapState(d);
  lastGood = s;
  return s;
}

/** Force a refetch (call after a write action). */
export function invalidateChainState() {
  window.dispatchEvent(new CustomEvent("intentos:refresh"));
}

// The journey is session-scoped. The Owner EOA is permanently EIP-7702-delegated on Base mainnet
// (from earlier runs), so `delegated` is always true and must NOT be used to decide whether an Intent
// is live. An Intent is "active" only once its Executor has been created in THIS session.
export function hasActiveIntent(state: ChainState | null): boolean {
  return !!state?.session.executorTokenId;
}

/** Pill status for the active Intent, or undefined when nothing has been created this session. */
export function activeStatus(state: ChainState | null): "running" | "frozen" | undefined {
  if (!hasActiveIntent(state)) return undefined;
  return state?.guard?.frozen ? "frozen" : "running";
}

export function useChainState(pollMs = 12_000) {
  const [state, setState] = useState<ChainState | null>(lastGood);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!lastGood);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const s = await loadChainState();
        if (active) {
          setState(s);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    refresh();
    const t = setInterval(refresh, pollMs);
    const onRefresh = () => refresh();
    window.addEventListener("intentos:refresh", onRefresh);
    return () => {
      active = false;
      clearInterval(t);
      window.removeEventListener("intentos:refresh", onRefresh);
    };
  }, [pollMs]);

  return { state, error, loading };
}
