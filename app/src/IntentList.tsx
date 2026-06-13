import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { usdc } from "./format";

export function IntentList() {
  const { state } = useChainState();
  const active = !!state?.delegated;
  const status = state?.guard?.frozen ? "frozen" : active ? "running" : "—";

  return (
    <div className="app">
      <TopBar status={active ? status : undefined} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">020 · Intent List</div>
          <h1>Your Intents</h1>
          <p>One active Intent per Owner. The active Intent is live on Base mainnet; review it on the dashboard or open the launch flow for a new one.</p>
        </div>

        <div className="grid cols-2">
          <a className="card nav-card pad-lg" href="#/dashboard">
            <div className="card-head">
              <span className="num">intent-abc</span>
              <span className={`pill ${status}`}>{status}</span>
            </div>
            <h3>DCA USDC → WETH</h3>
            <p className="desc">
              {state ? `Cumulative spent ${usdc(state.cumulativeSpent)} · per-tx cap ${usdc(state.guard?.amountCapPerTx ?? 0n)}` : "Loading live state…"}
            </p>
            <span className="pill role-exec">Executor #1</span> <span className="pill role-watch">Watcher</span>
          </a>

          <a className="card nav-card pad-lg" href="#/launch">
            <div className="card-head">
              <span className="num">new</span>
              <span className="arrow">→</span>
            </div>
            <h3>Run a new Intent</h3>
            <p className="desc">Speak an intent, generate the Agent Package, mint the Executor, delegate via EIP-7702, fund the gas vault, and start.</p>
            <span className="pill">IntentBuilder → mint → 7702 → start</span>
          </a>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026</p>
      </main>
    </div>
  );
}
