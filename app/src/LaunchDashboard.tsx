import { useChainState, activeStatus } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { useGate } from "./gate";
import { usdc, eth } from "./format";

// 030 · Intent Launch Dashboard. The card-grid navigation hub (North Star §2). Each card links to its
// setup screen and shows live completion derived from /api/state. When the required cards are complete,
// "Start" is enabled.
export function LaunchDashboard() {
  const { state } = useChainState();
  const { verified, isConnected } = useGate();

  const hasExecutor = !!state?.session.executorTokenId;
  const hasWatcher = !!state?.session.watcherTokenId;
  const initialized = !!state?.delegated && !!state?.guard;
  const funded = (state?.execVault ?? 0n) > 0n;

  const cards: { n: string; title: string; desc: string; href: string; done: boolean; optional?: boolean }[] = [
    { n: "040", title: "Intent creation", desc: "IntentBuilder → Agent Package", href: "#/launch/intent", done: hasExecutor },
    { n: "040", title: "Executor Agent", desc: hasExecutor ? `minted #${state?.session.executorTokenId}` : "mint the Executor NFT", href: "#/launch/intent", done: hasExecutor },
    { n: "050", title: "Agent Identity", desc: "tokenId · ENS · ERC-8004", href: "#/launch/identity", done: hasExecutor },
    { n: "010", title: "Human Proof", desc: "World ID gate", href: "#/", done: verified },
    { n: "060", title: "Gas Funding", desc: funded ? `exec ${eth(state!.execVault)}` : "fund the vault lane", href: "#/launch/runtime", done: funded },
    { n: "060", title: "Runtime Preview", desc: "Cloud Run capsule + binding", href: "#/launch/runtime", done: initialized },
    { n: "070", title: "Watcher Guard", desc: hasWatcher ? `watcher #${state?.session.watcherTokenId}` : "optional · quorum=1", href: "#/launch/watcher", done: hasWatcher, optional: true },
    { n: "080", title: "Start Conditions", desc: "preconditions + launch", href: "#/launch/start", done: false },
  ];

  const requiredDone = hasExecutor && initialized && funded && verified && isConnected;

  return (
    <div className="app">
      <TopBar status={activeStatus(state)} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">030 · Intent Launch Dashboard</div>
          <h1>Set up your guarded Intent</h1>
          <p>A navigation hub to each setup step. Complete the required cards, then start. Watcher Guard is optional.</p>
        </div>

        <div className="grid cols-4">
          {cards.map((c) => (
            <a key={c.title} className="card nav-card" href={c.href}>
              <div className="card-head">
                <span className="num">{c.n}</span>
                <span className={`pill ${c.done ? "ok" : c.optional ? "optional" : ""}`}>{c.done ? "✓" : c.optional ? "optional" : "todo"}</span>
              </div>
              <h3>{c.title}</h3>
              <p className="desc">{c.desc}</p>
            </a>
          ))}
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head">
            <h3>Cumulative spent</h3>
            <span className="pill">{state ? usdc(state.cumulativeSpent) : "—"}</span>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <a className={`btn ${requiredDone ? "primary" : ""}`} href="#/launch/start" aria-disabled={!requiredDone}>
              {requiredDone ? "Start trading →" : "Complete required cards to start"}
            </a>
            <a className="btn" href="#/dashboard">Open Owner dashboard</a>
          </div>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · launch hub</p>
      </main>
    </div>
  );
}
