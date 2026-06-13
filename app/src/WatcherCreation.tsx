import { useChainState, activeStatus } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { ActionButton } from "./ActionButton";
import { api } from "./api";
import { shortAddr } from "./format";

// 070 · Watcher Agent creation. Optional semantic circuit breaker (quorum=1). Bound to the Executor
// as immutable context; can only tighten / freeze, never loosen, never touch funds.
export function WatcherCreation() {
  const { state } = useChainState();
  const execId = state?.session.executorTokenId;
  const watchId = state?.session.watcherTokenId;

  return (
    <div className="app">
      <TopBar status={activeStatus(state)} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">070 · Watcher Agent (optional)</div>
          <h1>Add a semantic circuit breaker</h1>
          <p>
            The Watcher reads the Executor's evidence and judges it against the Semantic Guardrails.
            With quorum=1, a single vote tightens or freezes immediately. It holds no funds and can
            only narrow capability — only the Owner can loosen.
          </p>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head"><h3>Watcher package (immutable context)</h3><span className="pill role-watch">WATCHER</span></div>
            <table className="kv"><tbody>
              <tr><td className="k">watchedExecutorTokenId</td><td className="v">{execId ?? "—"}</td></tr>
              <tr><td className="k">watchedIntentId</td><td className="v">intent-abc</td></tr>
              <tr><td className="k">quorum</td><td className="v">1 (immediate)</td></tr>
              <tr><td className="k">WatcherKey (KMS)</td><td className="v">{state ? shortAddr(state.watcherKey) : "—"}</td></tr>
              <tr><td className="k">status</td><td className="v">{watchId ? `minted #${watchId}` : "not created"}</td></tr>
            </tbody></table>
          </div>

          <div className="card pad-lg">
            <div className="card-head"><h3>Create Watcher</h3><span className="pill optional">optional</span></div>
            <p className="desc">Mints the Watcher NFT bound to the Executor and funds its separate gas lane. Requires the Executor to exist first.</p>
            <ActionButton label="Create Watcher Agent (mint + bind, quorum 1)" className="btn primary block" run={api.createWatcher} disabled={!execId || !!watchId} />
            {watchId && <div className="pill ok" style={{ marginTop: 8 }}><span className="dot" />Watcher #{watchId} active</div>}
            <p className="spec-ref" style={{ marginTop: 12 }}>Then open the Watcher dashboard to read evidence and vote tighten / freeze.</p>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          <a className="btn" href="#/launch/start">Next → Start</a>
          <a className="btn" href="#/watcher">Open Watcher dashboard</a>
          <a className="btn" href="#/launch">Back to hub</a>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · watcher creation</p>
      </main>
    </div>
  );
}
