import { useChainState, hasActiveIntent, activeStatus } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { ActionButton } from "./ActionButton";
import { api } from "./api";
import { usdc } from "./format";

export function IntentList() {
  const { state } = useChainState();
  const active = hasActiveIntent(state);
  const status = activeStatus(state);

  return (
    <div className="app">
      <TopBar status={status} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">020 · Intent List</div>
          <h1>Your Intents</h1>
          <p>One active Intent per Owner. Create your first Intent in the launch flow — it goes live on Base mainnet, then you can review it on the dashboard.</p>
        </div>

        <div className="grid cols-2">
          {active ? (
            <a className="card nav-card pad-lg" href="#/dashboard">
              <div className="card-head">
                <span className="num">intent-abc</span>
                <span className={`pill ${status}`}>{status}</span>
              </div>
              <h3>DCA USDC → WETH</h3>
              <p className="desc">
                {state ? `Cumulative spent ${usdc(state.cumulativeSpent)} · per-tx cap ${usdc(state.guard?.amountCapPerTx ?? 0n)}` : "Loading live state…"}
              </p>
              <span className="pill role-exec">Executor #{state?.session.executorTokenId}</span>{" "}
              {state?.session.watcherTokenId && <span className="pill role-watch">Watcher #{state.session.watcherTokenId}</span>}
            </a>
          ) : (
            <div className="card pad-lg" style={{ opacity: 0.7 }}>
              <div className="card-head">
                <span className="num">none</span>
                <span className="pill">—</span>
              </div>
              <h3>No active Intent yet</h3>
              <p className="desc">
                You haven&apos;t created an Intent in this session. Start one in the launch flow: speak an
                intent, mint the Executor, delegate via EIP-7702, and go live.
              </p>
              <a className="btn primary" href="#/launch">Create your first Intent →</a>
            </div>
          )}

          <a className="card nav-card pad-lg" href="#/launch">
            <div className="card-head">
              <span className="num">new</span>
              <span className="arrow">→</span>
            </div>
            <h3>{active ? "Run a new Intent" : "Run an Intent"}</h3>
            <p className="desc">Speak an intent, generate the Agent Package, mint the Executor, delegate via EIP-7702, fund the gas vault, and start.</p>
            <span className="pill">IntentBuilder → mint → 7702 → start</span>
          </a>
        </div>
        {active && (
          <div style={{ marginTop: 18 }}>
            <ActionButton label="Reset demo session (clear agents · unfreeze)" className="btn" run={api.reset} />
          </div>
        )}
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026</p>
      </main>
    </div>
  );
}
