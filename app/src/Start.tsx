import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { useGate } from "./gate";
import { eth } from "./format";

// 080 · Start. Preconditions checklist; "Start trading" enabled only when the required ones are met.
// Executor-only is allowed; with a Watcher attached, its lane must be funded too.
export function Start() {
  const { state } = useChainState();
  const { isConnected, verified } = useGate();

  const checks: { label: string; ok: boolean; required: boolean }[] = [
    { label: "Wallet connected", ok: isConnected, required: true },
    { label: "World ID human-proof", ok: verified, required: true },
    { label: "Executor Agent minted", ok: !!state?.session.executorTokenId, required: true },
    { label: "EIP-7702 delegated + HardGuardState initialized", ok: !!state?.delegated && !!state?.guard, required: true },
    { label: "Executor gas vault funded", ok: (state?.execVault ?? 0n) > 0n, required: true },
    { label: "Not frozen", ok: !state?.guard?.frozen, required: true },
    { label: "Watcher attached (optional)", ok: !!state?.session.watcherTokenId, required: false },
    { label: "Watcher gas lane funded (if attached)", ok: !state?.session.watcherTokenId || (state?.watcherVault ?? 0n) > 0n, required: false },
  ];
  const ready = checks.filter((c) => c.required).every((c) => c.ok);

  return (
    <div className="app">
      <TopBar status={state?.guard?.frozen ? "frozen" : state?.delegated ? "running" : undefined} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">080 · Start</div>
          <h1>Confirm &amp; launch</h1>
          <p>Start is enabled only when the required preconditions are met. The Executor (and the Watcher, if attached) begin operating in the bounded AgentLoop.</p>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head"><h3>Preconditions</h3><span className={`pill ${ready ? "ok" : ""}`}>{ready ? "all met" : "incomplete"}</span></div>
            {checks.map((c) => (
              <div className="guard" key={c.label}>
                <span className="g-name" style={{ fontFamily: "var(--sans)" }}>{c.label}{!c.required && <span className="muted"> · optional</span>}</span>
                <span className="g-val">{c.ok ? "✓" : c.required ? "—" : "·"}</span>
              </div>
            ))}
          </div>

          <div className="card pad-lg">
            <div className="card-head"><h3>Launch summary</h3><span className="pill">{state?.session.watcherTokenId ? "Executor + Watcher" : "Executor only"}</span></div>
            <table className="kv"><tbody>
              <tr><td className="k">Pair</td><td className="v">USDC / WETH</td></tr>
              <tr><td className="k">Executor</td><td className="v">#{state?.session.executorTokenId ?? "—"}</td></tr>
              <tr><td className="k">Watcher</td><td className="v">{state?.session.watcherTokenId ? `#${state.session.watcherTokenId} · quorum 1` : "none"}</td></tr>
              <tr><td className="k">Gas vault</td><td className="v">{state ? eth(state.execVault) : "—"}</td></tr>
            </tbody></table>
            <a className={`btn block ${ready ? "primary" : ""}`} style={{ marginTop: 14 }} href={ready ? "#/dashboard" : "#/launch"} aria-disabled={!ready}>
              {ready ? "Start trading → Owner dashboard" : "Complete required preconditions"}
            </a>
            <a className="btn block" style={{ marginTop: 10 }} href="#/dashboard">Start Executor-only</a>
          </div>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · start</p>
      </main>
    </div>
  );
}
