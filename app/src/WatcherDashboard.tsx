import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { shortHash, txUrl } from "./format";

export function WatcherDashboard() {
  const { state, error, loading } = useChainState();
  const evidence = state?.timeline.filter((t) => t.kind === "evidence") ?? [];
  const votes = state?.timeline.filter((t) => t.kind !== "evidence") ?? [];

  return (
    <div className="app">
      <TopBar status={state?.guard?.frozen ? "frozen" : "running"} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">100 · Watcher Runtime Dashboard · LIVE</div>
          <h1>Semantic Guard · quorum 1</h1>
          <p>
            The Watcher reads EvidenceCommitted from chain, judges against the Semantic Guardrails, and
            can only tighten / freeze. It never executes and holds no funds. With quorum=1, one vote
            takes effect immediately.
          </p>
        </div>

        {loading && !state && <div className="note">Loading…</div>}
        {error && <div className="note" style={{ borderColor: "#5a2730", color: "#ff5c5c" }}>RPC error: {error}</div>}

        {state && (
          <div className="grid cols-2">
            <div className="card pad-lg">
              <div className="card-head">
                <h3>Evidence to review</h3>
                <span className="pill role-watch">WATCHER</span>
              </div>
              {evidence.length === 0 && <p className="muted">No evidence in the recent window.</p>}
              <ul className="timeline">
                {evidence.map((t) => (
                  <li key={t.txHash} className="evidence">
                    <div className="t-time">block {String(t.blockNumber)}</div>
                    <div className="t-title">EvidenceCommitted</div>
                    <div className="t-body">{t.reason} · <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer">{shortHash(t.txHash)}</a></div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-head">
                  <h3>Watcher actions</h3>
                  <span className="pill">monotonic</span>
                </div>
                <p className="desc">The Watcher can only narrow capability. Loosen / unfreeze is Owner-only.</p>
                <div className="btn-row">
                  <span className="pill ok">VOTE_TIGHTEN</span>
                  <span className="pill frozen">VOTE_FREEZE</span>
                </div>
                <p className="spec-ref" style={{ marginTop: 12 }}>
                  Votes are signed by the Watcher KMS SessionKey and relayed. On-chain the contract
                  enforces monotonic tightening (NotTightening reverts a loosening patch).
                </p>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Governance actions on chain</h3>
                  <span className="pill">{votes.length}</span>
                </div>
                {votes.length === 0 && <p className="muted">No tighten / freeze votes yet.</p>}
                <ul className="timeline">
                  {votes.map((t) => (
                    <li key={t.txHash} className={t.kind === "freeze" ? "guard" : "watch"}>
                      <div className="t-time">block {String(t.blockNumber)}</div>
                      <div className="t-title">{t.title}</div>
                      <div className="t-body"><a href={txUrl(t.txHash)} target="_blank" rel="noreferrer">{shortHash(t.txHash)}</a></div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · watcher dashboard</p>
      </main>
    </div>
  );
}
