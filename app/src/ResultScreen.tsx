import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { usdc, eth, weth } from "./format";

export function ResultScreen() {
  const { state } = useChainState();
  const g = state?.guard;
  const terminal = g?.frozen ? "frozen" : state?.delegated ? "running" : "owner-stopped";
  const states = ["running", "tightened", "frozen", "self-stopped", "owner-stopped", "fund-exhausted", "transferred"];

  return (
    <div className="app">
      <TopBar status={terminal} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">110 · Result / Performance · LIVE</div>
          <h1>intent-abc · current state</h1>
          <p>Terminal state and performance, derived from live chain state. Funds remain with the Owner.</p>
        </div>

        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <div className="card"><p className="desc">Current state</p><div className="stat" style={{ fontSize: 26 }}><span className={`pill ${terminal}`}>{terminal}</span></div></div>
          <div className="card"><p className="desc">Cumulative spent</p><div className="stat">{state ? usdc(state.cumulativeSpent) : "—"}</div></div>
          <div className="card"><p className="desc">WETH acquired</p><div className="stat" style={{ fontSize: 22 }}>{state ? weth(state.weth) : "—"}</div></div>
          <div className="card"><p className="desc">Gas vault remaining</p><div className="stat">{state ? eth(state.execVault) : "—"}</div></div>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head"><h3>Outcome</h3><span className="pill ok">Base 8453</span></div>
            <table className="kv"><tbody>
              <tr><td className="k">frozen</td><td className="v">{g ? String(g.frozen) : "—"}</td></tr>
              <tr><td className="k">final amountCapPerTx</td><td className="v">{g ? usdc(g.amountCapPerTx) : "—"}</td></tr>
              <tr><td className="k">final cumulativeCap</td><td className="v">{g ? usdc(g.cumulativeCap) : "—"}</td></tr>
              <tr><td className="k">final slippageCapBps</td><td className="v">{g ? g.slippageCapBps : "—"}</td></tr>
              <tr><td className="k">executor gas vault</td><td className="v">{state ? eth(state.execVault) : "—"}</td></tr>
            </tbody></table>
          </div>
          <div className="card pad-lg">
            <div className="card-head"><h3>Performance</h3></div>
            <table className="kv"><tbody>
              <tr><td className="k">USDC balance</td><td className="v">{state ? usdc(state.usdc) : "—"}</td></tr>
              <tr><td className="k">WETH balance</td><td className="v">{state ? weth(state.weth) : "—"}</td></tr>
              <tr><td className="k">USDC spent (cumulative)</td><td className="v">{state ? usdc(state.cumulativeSpent) : "—"}</td></tr>
              <tr><td className="k">evidence events</td><td className="v">{state ? state.timeline.filter((t) => t.kind === "evidence").length : "—"}</td></tr>
            </tbody></table>
            <p className="desc" style={{ marginTop: 16 }}>Canonical terminal states (010 §13)</p>
            <div className="btn-row">
              {states.map((s) => (
                <span key={s} className={`pill ${s === terminal ? s : ""}`} style={s === terminal ? {} : { opacity: 0.5 }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · result</p>
      </main>
    </div>
  );
}
