// Live Base mainnet reads for the dashboards. Reconstructs state purely from on-chain events + state
// (010 §14 "evidence is canonical onchain"). No backend.
import { useEffect, useState } from "react";
import { createPublicClient, decodeEventLog, http, type Address, type Hex } from "viem";
import { base } from "wagmi/chains";
import { ADDR, BASE_RPC, delegateAbi, erc20Abi } from "./config";

// Single shared client; cap concurrency low so a rate-limited public RPC stays happy.
const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC, { retryCount: 4, retryDelay: 800, batch: { wait: 30 } }),
});

// Module-level cache so multiple mounted screens (and StrictMode double-mount) share one in-flight
// fetch + the last good result, instead of each firing its own burst of RPC calls.
let inflight: Promise<ChainState> | null = null;
let lastGood: ChainState | null = null;
let lastAt = 0;

export interface GuardView {
  router: Address;
  tokenA: Address;
  tokenB: Address;
  poolFee: number;
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

export interface ChainState {
  delegated: boolean;
  guard: GuardView | null;
  cumulativeSpent: bigint;
  execVault: bigint;
  watcherVault: bigint;
  usdc: bigint;
  weth: bigint;
  timeline: TimelineItem[];
}

export async function loadChainState(): Promise<ChainState> {
  const code = await client.getCode({ address: ADDR.owner });
  const delegated = !!code && code.toLowerCase().startsWith("0xef0100");

  let guard: GuardView | null = null;
  let cumulativeSpent = 0n;
  let execVault = 0n;
  let watcherVault = 0n;

  if (delegated) {
    // Serial reads (not Promise.all) to avoid a burst that trips public-RPC rate limits.
    const g = await client.readContract({ address: ADDR.owner, abi: delegateAbi, functionName: "guard" });
    const cs = await client.readContract({ address: ADDR.owner, abi: delegateAbi, functionName: "cumulativeSpent" });
    const gv = await client.readContract({ address: ADDR.owner, abi: delegateAbi, functionName: "gasVaults" });
    guard = g as unknown as GuardView;
    cumulativeSpent = cs as bigint;
    const vaults = gv as readonly bigint[];
    execVault = vaults[0];
    watcherVault = vaults[1];
  }

  const usdc = await client.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.owner] });
  const weth = await client.readContract({ address: ADDR.weth, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.owner] });

  const latest = await client.getBlockNumber();
  const fromBlock = latest > 9_000n ? latest - 9_000n : 0n;
  const logs = await client.getLogs({ address: ADDR.owner, fromBlock, toBlock: "latest" });
  const timeline: TimelineItem[] = [];
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi: delegateAbi, data: log.data, topics: log.topics }) as {
        eventName: string;
        args: Record<string, unknown>;
      };
      if (ev.eventName === "EvidenceCommitted") {
        timeline.push({ kind: "evidence", title: "EvidenceCommitted", reason: String(ev.args.reason ?? ""), txHash: log.transactionHash as Hex, blockNumber: log.blockNumber as bigint });
      } else if (ev.eventName === "GuardTightened") {
        timeline.push({ kind: "tighten", title: "Watcher · VOTE_TIGHTEN", reason: "Future capability narrowed", txHash: log.transactionHash as Hex, blockNumber: log.blockNumber as bigint });
      } else if (ev.eventName === "GuardFrozen") {
        timeline.push({ kind: "freeze", title: "Watcher · VOTE_FREEZE", reason: "Execution frozen", txHash: log.transactionHash as Hex, blockNumber: log.blockNumber as bigint });
      }
    } catch {
      /* not our event */
    }
  }
  timeline.sort((a, b) => Number(b.blockNumber - a.blockNumber));

  return { delegated, guard, cumulativeSpent, execVault, watcherVault, usdc: usdc as bigint, weth: weth as bigint, timeline };
}

// Dedupe concurrent callers and serve a short-lived cache so screens don't each hammer the RPC.
function loadChainStateShared(maxAgeMs = 10_000): Promise<ChainState> {
  if (inflight) return inflight;
  if (lastGood && Date.now() - lastAt < maxAgeMs) return Promise.resolve(lastGood);
  inflight = loadChainState()
    .then((s) => {
      lastGood = s;
      lastAt = Date.now();
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useChainState(pollMs = 20_000) {
  const [state, setState] = useState<ChainState | null>(lastGood);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!lastGood);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const s = await loadChainStateShared();
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
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [pollMs]);

  return { state, error, loading };
}
