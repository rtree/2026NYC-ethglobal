import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { encodeFunctionData, type Abi } from "viem";
import { useChainState, activeStatus, hasActiveIntent } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { delegateAbi, tokenPair } from "./config";
import { shortAddr, shortHash, usdc, eth, weth, txUrl, addrUrl, tokenTxUrl } from "./format";
import { ActionButton } from "./ActionButton";
import { api, type GuardWire } from "./api";
import { authState, ownerModeCached } from "./auth";
import type { IntentDoc, RuntimeRecord } from "./intentTypes";

// 090 + 100 + 110 merged (plan/010 §15.1): one screen for the running Intent — guard, vaults,
// balances, shared timeline, Owner controls (trade/resume) AND Watcher controls (freeze/tighten).
// After stop it reads as the Result. A history list (this wallet) makes past Intents reachable.
export function LiveConsole() {
  const { address } = useAccount();
  const connectedMode = ownerModeCached() === "connected";
  const { data: walletClient } = useWalletClient();
  const [history, setHistory] = useState<IntentDoc[]>([]);
  const [runtimeRecord, setRuntimeRecord] = useState<RuntimeRecord | null>(null);

  useEffect(() => {
    api.listIntents().then((r) => setHistory(r.intents)).catch(() => {});
  }, []);

  // The active Intent for this session (its FIXed guard/draft is what trade/resume/reset bind to).
  const activeIntent = history.find((i) => i.status === "live") ?? history.find((i) => i.executorTokenId);
  const activeIntentId = activeIntent?.intentId;
  const { state, error, loading } = useChainState(12_000, connectedMode && address ? address : undefined, activeIntentId);
  const g = state?.guard;
  const status = activeStatus(state);
  const active = hasActiveIntent(state);
  const terminal = status ?? "owner-stopped";
  const consoleTitle = activeIntent ? `${activeIntent.intentId} · ${activeIntent.title}` : "Running Intent";
  const runtimeActive = runtimeRecord?.status === "scheduled" || runtimeRecord?.status === "running" || runtimeRecord?.status === "stopping";

  async function stopRuntime(reason: string) {
    const r = await api.runtimeStop(activeIntentId, reason);
    setRuntimeRecord(r.runtimeRecord);
    return { ok: true } as const;
  }

  async function ownerResume() {
    if (walletClient && state?.delegate && activeIntentId) {
      const plan = await api.ownerGuardPlan(activeIntentId);
      const data = encodeFunctionData({
        abi: delegateAbi as Abi,
        functionName: "ownerUpdateGuard",
        args: [toGuard(plan.guard)],
      });
      const txHash = await walletClient.sendTransaction({ to: state.delegate, data });
      return { txHash };
    }

    function toGuard(g: GuardWire) {
      return {
        router: g.router,
        selector: g.selector,
        tokenA: g.tokenA,
        tokenB: g.tokenB,
        poolFee: Number(g.poolFee),
        amountCapPerTx: BigInt(String(g.amountCapPerTx)),
        cumulativeCap: BigInt(String(g.cumulativeCap)),
        slippageCapBps: Number(g.slippageCapBps),
        expiry: BigInt(String(g.expiry)),
        frozen: Boolean(g.frozen),
        bindingNonce: BigInt(String(g.bindingNonce)),
      };
    }
    return api.ownerResume(activeIntentId);
  }

  useEffect(() => {
    if (!activeIntentId) return;
    let active = true;
    async function refreshRuntime() {
      if (!activeIntentId) return;
      try {
        const r = await api.runtimeStatus(activeIntentId);
        if (active) setRuntimeRecord(r.runtimeRecord);
      } catch {
        /* keep prior runtime status */
      }
    }
    refreshRuntime();
    const t = setInterval(refreshRuntime, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [activeIntentId]);

  return (
    <div className="app">
      <TopBar status={status} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">Live Console · Owner + Watcher · Control Panel</div>
          <h1>{consoleTitle}</h1>
          <p>
            One place for the running Intent: live guard, vaults, balances, the shared EvidenceCommitted
            timeline, and both Owner and Watcher controls. OpenClaw runtime sessions are bounded Cloud Run
            requests with explicit stop controls.
          </p>
        </div>

        {loading && !state && <div className="note">Loading on-chain state…</div>}
        {error && <div className="note" style={{ borderColor: "#5a2730", color: "#ff5c5c" }}>RPC error: {error}</div>}

        {/* No session-active Intent yet: don't show the shared demo Owner's history as if it were the
            user's. Show an empty state + the user's own (per-wallet) history list. */}
        {state && !active && (
          <>
            <div className="card pad-lg" style={{ marginBottom: 20 }}>
              <div className="card-head"><h3>No running Intent yet</h3><span className="pill">—</span></div>
              <p className="desc">
                You haven&apos;t launched an Intent in this session. Create one in the launch flow — speak
                an intent, build the Executor &amp; Watcher Agent Packages, mint, and start. Once it&apos;s
                live, this console shows its guard, vaults, the shared evidence timeline, and the Owner /
                Watcher controls.
              </p>
              <a className="btn primary" href="#/launch">Launch an Intent →</a>
            </div>
            <HistoryCard history={history} />
          </>
        )}

        {state && active && (
          <>
            <div className="grid cols-4" style={{ marginBottom: 20 }}>
              <div className="card">
                <p className="desc">Current state</p>
                <div className="stat" style={{ fontSize: 24 }}><span className={`pill ${active ? status : terminal}`}>{active ? status : terminal}</span></div>
              </div>
              <div className="card">
                <p className="desc">Cumulative spent</p>
                <div className="stat">{usdc(state.cumulativeSpent)}</div>
                <p className="muted mono">cap {g ? usdc(g.cumulativeCap) : "—"}</p>
              </div>
              <div className="card">
                <p className="desc">WETH acquired</p>
                <div className="stat" style={{ fontSize: 22 }}>{weth(state.weth)}</div>
                <p className="muted mono">USDC {usdc(state.usdc)}</p>
              </div>
              <div className="card">
                <p className="desc">Gas vaults</p>
                <div className="stat" style={{ fontSize: 22 }}>{eth(state.execVault)}</div>
                <p className="muted mono">watcher {eth(state.watcherVault)}</p>
              </div>
            </div>

            {runtimeRecord && (
              <div className="card pad-lg" style={{ marginBottom: 20 }}>
                <div className="card-head"><h3>OpenClaw runtime</h3><span className={`pill ${runtimeRecord.status === "running" ? "running" : ""}`}>{runtimeRecord.status}</span></div>
                <table className="kv"><tbody>
                  <tr><td className="k">runtimeId</td><td className="v">{runtimeRecord.runtimeId}</td></tr>
                  <tr><td className="k">executor package</td><td className="v">{shortHash(runtimeRecord.packageHash)}</td></tr>
                  {runtimeRecord.executorSemanticSnapshot && <tr><td className="k">executor semantic</td><td className="v">{runtimeRecord.executorSemanticSnapshot.join(" · ")}</td></tr>}
                  {runtimeRecord.watcherPackageHash && <tr><td className="k">watcher package</td><td className="v">{shortHash(runtimeRecord.watcherPackageHash)}</td></tr>}
                  {runtimeRecord.watcherSemanticSnapshot && <tr><td className="k">watcher semantic</td><td className="v">{runtimeRecord.watcherSemanticSnapshot.join(" · ")}</td></tr>}
                  <tr><td className="k">ticks</td><td className="v">{runtimeRecord.executedTicks} / {runtimeRecord.plannedTicks}</td></tr>
                  <tr><td className="k">last action</td><td className="v">{runtimeRecord.lastTickAction ?? "—"}{runtimeRecord.lastTickTxHash ? ` · ${shortHash(runtimeRecord.lastTickTxHash)}` : ""}</td></tr>
                  {runtimeRecord.lastOpenClawResponse && <tr><td className="k">OpenClaw Executor</td><td className="v">{runtimeRecord.lastOpenClawResponse}</td></tr>}
                  <tr><td className="k">watcher action</td><td className="v">{runtimeRecord.lastWatcherAction ?? "—"}{runtimeRecord.lastWatcherTxHash ? ` · ${shortHash(runtimeRecord.lastWatcherTxHash)}` : ""}</td></tr>
                  {runtimeRecord.lastWatcherResponse && <tr><td className="k">OpenClaw Watcher</td><td className="v">{runtimeRecord.lastWatcherResponse}</td></tr>}
                  {runtimeRecord.lastWatcherReason && <tr><td className="k">watcher reason</td><td className="v">{runtimeRecord.lastWatcherReason}</td></tr>}
                  <tr><td className="k">LLM budget</td><td className="v">${runtimeRecord.estimatedVertexCostUsd.toFixed(4)} / ${runtimeRecord.maxVertexCostUsd.toFixed(2)} · {runtimeRecord.llmCallsUsed} calls</td></tr>
                  <tr><td className="k">updated</td><td className="v">{new Date(runtimeRecord.updatedAt).toLocaleTimeString()}</td></tr>
                  {runtimeRecord.failureReason && <tr><td className="k">stop reason</td><td className="v">{runtimeRecord.failureReason}</td></tr>}
                </tbody></table>
                {runtimeActive && (
                  <div className="grid cols-2" style={{ marginTop: 12 }}>
                    <ActionButton label="Force stop Executor runtime" className="btn danger block" run={() => stopRuntime("operator stopped executor runtime")} />
                    <ActionButton label="Force stop Watcher process" className="btn danger block" run={() => stopRuntime("operator stopped watcher process")} />
                  </div>
                )}
              </div>
            )}

            <div className="grid cols-2">
              {/* left: shared timeline */}
              <div className="card pad-lg">
                <div className="card-head">
                  <h3>{activeIntentId ? "Active Intent evidence timeline" : "Shared execution timeline"}</h3>
                  <span className="pill">{state.timeline.length} events</span>
                </div>
                {state.timeline.length === 0 && <p className="muted">No active-intent evidence in the recent window. Guard state is account-level and may reflect prior Watcher votes.</p>}
                <ul className="timeline">
                  {state.timeline.map((t) => (
                    <li key={t.txHash + String(t.blockNumber)} className={t.kind === "evidence" ? "evidence" : t.kind === "freeze" ? "guard" : "watch"}>
                      <div className="t-time">block {String(t.blockNumber)} · {t.kind}</div>
                      <div className="t-title">{t.title}</div>
                      <div className="t-body">
                        {t.reason} · <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer">{shortHash(t.txHash)}</a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* right: controls + guard */}
              <div>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-head"><h3>Owner controls</h3><span className="pill role-exec">EXECUTOR</span></div>
                  <ActionButton label="Execute guarded trade (0.001 USDC → WETH)" className="btn primary block" run={() => api.trade(activeIntentId)} />
                  <ActionButton label="Resume / unfreeze (Owner only)" className="btn block" run={ownerResume} />
                  <p className="spec-ref">Signed by the Executor SessionKey (KMS) and relayed. Only the Owner can loosen / unfreeze.</p>
                </div>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-head"><h3>Watcher controls</h3><span className="pill role-watch">WATCHER · quorum 1</span></div>
                  <ActionButton label="VOTE_TIGHTEN (halve per-tx cap)" className="btn block" run={() => api.watcherTighten(activeIntentId)} />
                  <ActionButton label="VOTE_FREEZE (stop all execution)" className="btn danger block" run={() => api.watcherFreeze(activeIntentId)} />
                  <p className="spec-ref">Monotonic: the Watcher can only narrow capability. The contract reverts any loosening patch.</p>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Current Hard Guardrails</h3><span className={`pill ${status ?? ""}`}>{status ?? "—"}</span></div>
                  {g && (
                    <>
                      <div className="guard hard"><span className="g-name">tokenPair</span><span className="g-val">{tokenPair(g.tokenA, g.tokenB)}</span></div>
                      <div className="guard hard"><span className="g-name">amountCapPerTx</span><span className="g-val">{usdc(g.amountCapPerTx)}</span></div>
                      <div className="guard hard"><span className="g-name">cumulativeCap</span><span className="g-val">{usdc(g.cumulativeCap)}</span></div>
                      <div className="guard hard"><span className="g-name">slippageCapBps</span><span className="g-val">{g.slippageCapBps}</span></div>
                      <div className="guard hard"><span className="g-name">frozen</span><span className="g-val">{String(g.frozen)}</span></div>
                      <div className="guard hard"><span className="g-name">bindingNonce</span><span className="g-val">{String(g.bindingNonce)}</span></div>
                    </>
                  )}
                  <table className="kv" style={{ marginTop: 12 }}><tbody>
                    <tr>
                      <td className="k">Owner EOA (7702)</td>
                      <td className="v">
                        {state ? (
                          <>
                            <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a>
                            {" · "}
                            <a href={tokenTxUrl(state.delegate)} target="_blank" rel="noreferrer">token txns</a>
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                    <tr><td className="k">Delegated</td><td className="v">{String(state.delegated)}</td></tr>
                  </tbody></table>
                </div>
              </div>
            </div>

            <HistoryCard history={history} />
          </>
        )}
        <p className="footer-note">intentOS · ETHGlobal NYC 2026 · live console</p>
      </main>
    </div>
  );
}

function HistoryCard({ history }: { history: IntentDoc[] }) {
  return (
    <div className="card pad-lg" style={{ marginTop: 20 }}>
      <div className="card-head"><h3>Your past Intents</h3><span className="pill">{history.length}</span></div>
      {!authState() && <p className="spec-ref">Sign in with your wallet to see your Intent history.</p>}
      {authState() && history.length === 0 && <p className="muted">No Intents yet — create one in the launch flow.</p>}
      {history.length > 0 && (
        <table className="kv"><tbody>
          {history.map((i) => (
            <tr key={i.intentId}>
              <td className="k">{i.intentId}</td>
              <td className="v">
                {i.title} · <span className={`pill ${i.status === "live" ? "running" : i.status === "stopped" ? "owner-stopped" : ""}`}>{i.status}</span>
                {i.executorTokenId ? ` · Executor #${i.executorTokenId}` : ""}
              </td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}
