import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { ADDR } from "./config";
import { shortAddr, shortHash, usdc, eth, weth, txUrl, addrUrl } from "./format";

export function OwnerDashboard() {
  const { state, error, loading } = useChainState();
  const g = state?.guard;
  const status = g?.frozen ? "frozen" : state?.delegated ? "running" : "owner-stopped";

  return (
    <div className="app">
      <TopBar status={status} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">090 · Owner Runtime Dashboard · LIVE</div>
          <h1>intent-abc · DCA USDC → WETH</h1>
          <p>
            Live on-chain state of the EIP-7702 delegated Owner account on Base mainnet. Guard,
            accounting, and the EvidenceCommitted timeline are read directly from chain — no backend.
          </p>
        </div>

        {loading && !state && <div className="note">Loading on-chain state…</div>}
        {error && (
          <div className="note" style={{ borderColor: "#5a2730", color: "#ff5c5c" }}>
            RPC error: {error}
          </div>
        )}

        {state && (
          <>
            <div className="grid cols-4" style={{ marginBottom: 20 }}>
              <div className="card">
                <p className="desc">Cumulative spent</p>
                <div className="stat">{usdc(state.cumulativeSpent)}</div>
                <p className="muted mono">cap {g ? usdc(g.cumulativeCap) : "—"}</p>
              </div>
              <div className="card">
                <p className="desc">Per-tx cap</p>
                <div className="stat">{g ? usdc(g.amountCapPerTx) : "—"}</div>
                <p className="muted mono">slippage ≤ {g ? g.slippageCapBps / 100 : "—"}%</p>
              </div>
              <div className="card">
                <p className="desc">Executor gas vault</p>
                <div className="stat">{eth(state.execVault)}</div>
                <p className="muted mono">watcher {eth(state.watcherVault)}</p>
              </div>
              <div className="card">
                <p className="desc">Owner holdings</p>
                <div className="stat" style={{ fontSize: 24 }}>{usdc(state.usdc)}</div>
                <p className="muted mono">{weth(state.weth)}</p>
              </div>
            </div>

            <div className="grid cols-2">
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
                        {t.reason} ·{" "}
                        <a href={txUrl(t.txHash)} target="_blank" rel="noreferrer">
                          {shortHash(t.txHash)}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-head">
                    <h3>Current Hard Guardrails</h3>
                    <span className={`pill ${status}`}>{status}</span>
                  </div>
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
                </div>
                <div className="card">
                  <div className="card-head">
                    <h3>Deployment</h3>
                    <span className="pill ok">Base 8453</span>
                  </div>
                  <table className="kv">
                    <tbody>
                      <tr><td className="k">Owner EOA (7702)</td><td className="v"><a href={addrUrl(ADDR.owner)} target="_blank" rel="noreferrer">{shortAddr(ADDR.owner)}</a></td></tr>
                      <tr><td className="k">Delegate impl</td><td className="v"><a href={addrUrl(ADDR.delegateImpl)} target="_blank" rel="noreferrer">{shortAddr(ADDR.delegateImpl)}</a></td></tr>
                      <tr><td className="k">Delegated</td><td className="v">{String(state.delegated)}</td></tr>
                    </tbody>
                  </table>
                  <p className="spec-ref" style={{ marginTop: 12 }}>Auto-refresh 15s · reconstructed purely from chain.</p>
                </div>
              </div>
            </div>
          </>
        )}
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · live read-only dashboard</p>
      </main>
    </div>
  );
}
