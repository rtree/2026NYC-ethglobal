import { useEffect, useState } from "react";
import { useChainState, activeStatus, hasActiveIntent } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { shortAddr, shortHash, usdc, eth, weth, txUrl, addrUrl } from "./format";
import { ActionButton } from "./ActionButton";
import { api } from "./api";
import { authState } from "./auth";
import type { IntentDoc } from "./intentTypes";

// 090 + 100 + 110 merged (plan/010 §15.1): one screen for the running Intent — guard, vaults,
// balances, shared timeline, Owner controls (trade/resume) AND Watcher controls (freeze/tighten).
// After stop it reads as the Result. A history list (this wallet) makes past Intents reachable.
export function LiveConsole() {
  const { state, error, loading } = useChainState();
  const g = state?.guard;
  const status = activeStatus(state);
  const active = hasActiveIntent(state);
  const terminal = status ?? "owner-stopped";
  const [history, setHistory] = useState<IntentDoc[]>([]);

  useEffect(() => {
    api.listIntents().then((r) => setHistory(r.intents)).catch(() => {});
  }, []);

  // The active Intent for this session (its FIXed guard/draft is what trade/resume/reset bind to).
  const activeIntent = history.find((i) => i.status === "live") ?? history.find((i) => i.executorTokenId);
  const activeIntentId = activeIntent?.intentId;
  const consoleTitle = activeIntent ? `${activeIntent.intentId} · ${activeIntent.title}` : "Running Intent";

  return (
    <div className="app">
      <TopBar status={status} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">Live Console · Owner + Watcher · LIVE</div>
          <h1>{consoleTitle}</h1>
          <p>
            One place for the running Intent: live guard, vaults, balances, the shared EvidenceCommitted
            timeline, and both Owner and Watcher controls. After it stops, this is the Result.
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

            <div className="grid cols-2">
              {/* left: shared timeline */}
              <div className="card pad-lg">
                <div className="card-head">
                  <h3>Shared execution timeline</h3>
                  <span className="pill">{state.timeline.length} events</span>
                </div>
                {state.timeline.length === 0 && <p className="muted">No events in the recent window.</p>}
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
                  <ActionButton label="Resume / unfreeze (Owner only)" className="btn block" run={() => api.ownerResume(activeIntentId)} />
                  <p className="spec-ref">Signed by the Executor SessionKey (KMS) and relayed. Only the Owner can loosen / unfreeze.</p>
                </div>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-head"><h3>Watcher controls</h3><span className="pill role-watch">WATCHER · quorum 1</span></div>
                  <ActionButton label="VOTE_TIGHTEN (halve per-tx cap)" className="btn block" run={api.watcherTighten} />
                  <ActionButton label="VOTE_FREEZE (stop all execution)" className="btn danger block" run={api.watcherFreeze} />
                  <p className="spec-ref">Monotonic: the Watcher can only narrow capability. The contract reverts any loosening patch.</p>
                </div>
                <div className="card">
                  <div className="card-head"><h3>Current Hard Guardrails</h3><span className={`pill ${status ?? ""}`}>{status ?? "—"}</span></div>
                  {g && (
                    <>
                      <div className="guard hard"><span className="g-name">tokenPair</span><span className="g-val">USDC / WETH</span></div>
                      <div className="guard hard"><span className="g-name">amountCapPerTx</span><span className="g-val">{usdc(g.amountCapPerTx)}</span></div>
                      <div className="guard hard"><span className="g-name">cumulativeCap</span><span className="g-val">{usdc(g.cumulativeCap)}</span></div>
                      <div className="guard hard"><span className="g-name">slippageCapBps</span><span className="g-val">{g.slippageCapBps}</span></div>
                      <div className="guard hard"><span className="g-name">frozen</span><span className="g-val">{String(g.frozen)}</span></div>
                      <div className="guard hard"><span className="g-name">bindingNonce</span><span className="g-val">{String(g.bindingNonce)}</span></div>
                    </>
                  )}
                  <table className="kv" style={{ marginTop: 12 }}><tbody>
                    <tr><td className="k">Owner EOA (7702)</td><td className="v">{state ? <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a> : "—"}</td></tr>
                    <tr><td className="k">Delegated</td><td className="v">{String(state.delegated)}</td></tr>
                  </tbody></table>
                </div>
              </div>
            </div>

            <HistoryCard history={history} />
          </>
        )}
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · live console</p>
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
