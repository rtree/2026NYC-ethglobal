import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { shortAddr, addrUrl, usdc, eth } from "./format";

// 060 · Runtime / fund preparation. Shows the runtime binding + gas-vault lanes (010 §10). The
// executor lane is seeded in initialize; here the Owner can review and top up.
export function RuntimeFunding() {
  const { state } = useChainState();
  const execId = state?.session.executorTokenId;

  return (
    <div className="app">
      <TopBar status={state?.delegated ? "running" : undefined} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">060 · Runtime &amp; Funding</div>
          <h1>Runtime binding &amp; gas vault</h1>
          <p>
            The runtime is bound to the current NFT owner; gas is reimbursed from a vault lane inside
            the Owner's EIP-7702 delegated account (not a standalone sponsor). The Watcher lane is
            separate so it can never touch execution funds.
          </p>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head"><h3>Runtime record</h3><span className={`pill ${state?.delegated ? "ok" : ""}`}>{state?.delegated ? "bound" : "unbound"}</span></div>
            <table className="kv"><tbody>
              <tr><td className="k">Executor tokenId</td><td className="v">{execId ?? "—"}</td></tr>
              <tr><td className="k">Runtime substrate</td><td className="v">Cloud Run (OpenClaw)</td></tr>
              <tr><td className="k">Owner EOA (7702)</td><td className="v">{state ? <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a> : "—"}</td></tr>
              <tr><td className="k">SessionKey (KMS)</td><td className="v">{state ? shortAddr(state.sessionKey) : "—"}</td></tr>
              <tr><td className="k">bindingNonce</td><td className="v">{state?.guard ? String(state.guard.bindingNonce) : "—"}</td></tr>
            </tbody></table>
          </div>

          <div className="card pad-lg">
            <div className="card-head"><h3>Gas vault lanes</h3><span className="pill ok">Owner-funded</span></div>
            <div className="guard"><span className="g-name" style={{ fontFamily: "var(--sans)" }}>Executor lane</span><span className="g-val">{state ? eth(state.execVault) : "—"}</span></div>
            <div className="guard"><span className="g-name" style={{ fontFamily: "var(--sans)" }}>Watcher lane</span><span className="g-val">{state ? eth(state.watcherVault) : "—"}</span></div>
            <p className="desc" style={{ marginTop: 12 }}>Cumulative spent {state ? usdc(state.cumulativeSpent) : "—"} of {state?.guard ? usdc(state.guard.cumulativeCap) : "—"} cap.</p>
            <p className="spec-ref">The executor lane is seeded in initialize(); relayer gas is clamped at gasPerTxCap and settled from this lane.</p>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          <a className="btn" href="#/launch/watcher">Next → Watcher (optional)</a>
          <a className="btn" href="#/launch/start">Skip to Start</a>
          <a className="btn" href="#/launch">Back to hub</a>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · runtime &amp; funding</p>
      </main>
    </div>
  );
}
