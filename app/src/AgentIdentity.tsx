import { useChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { shortAddr, addrUrl } from "./format";

// 050 · Agent identity. After mint, the tokenId is fixed; we assign an ENS/Basename subname and an
// ERC-8004 registration JSON (North Star §2 / §X). ENS subname registration is shown as the planned
// permanent name; the registration JSON is the discoverable identity record.
export function AgentIdentity() {
  const { state } = useChainState();
  const execId = state?.session.executorTokenId;
  const watchId = state?.session.watcherTokenId;

  const ensName = execId ? `agent-${execId}.intentos.base.eth` : "agent-<tokenId>.intentos.base.eth";
  const registration = {
    schema: "erc8004-agent-registration",
    schemaVersion: "0.1",
    name: `IntentOS Executor Agent #${execId ?? "?"}`,
    role: "EXECUTOR_AGENT",
    description: "Executes an Owner Intent through EIP-7702 Hard Guardrails.",
    ens: ensName,
    agentNft: state?.agentNft,
    executionContract: state?.delegate,
    sessionKey: state?.sessionKey,
    supportedTrust: ["hard-guarded-execution", "optional-semantic-guard", "evidence-logging"],
    registries: { reputation: { status: "planned" }, validation: { status: "planned" } },
  };

  return (
    <div className="app">
      <TopBar status={state?.delegated ? "running" : undefined} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">050 · Agent Identity</div>
          <h1>Name &amp; register the Agent</h1>
          <p>
            Once the Executor NFT is minted, its tokenId is fixed. We assign a permanent ENS/Basename
            subname and publish an ERC-8004 registration so the Agent is discoverable. Naming happens
            before the runtime binding so runtime, evidence, and dashboards all reference one name.
          </p>
        </div>

        {!execId && <div className="note">Mint the Executor Agent first (Intent creation) — then its identity is assigned here.</div>}

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head"><h3>Identity</h3><span className="pill role-exec">EXECUTOR</span></div>
            <table className="kv"><tbody>
              <tr><td className="k">tokenId</td><td className="v">{execId ?? "—"}</td></tr>
              <tr><td className="k">ENS / Basename</td><td className="v">{ensName}</td></tr>
              <tr><td className="k">AgentNFT</td><td className="v">{state ? <a href={addrUrl(state.agentNft)} target="_blank" rel="noreferrer">{shortAddr(state.agentNft)}</a> : "—"}</td></tr>
              <tr><td className="k">ExecutionContract</td><td className="v">{state ? <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a> : "—"}</td></tr>
              <tr><td className="k">SessionKey</td><td className="v">{state ? shortAddr(state.sessionKey) : "—"}</td></tr>
            </tbody></table>
            {watchId && (
              <>
                <div className="divider" />
                <div className="card-head"><h3 style={{ fontSize: 16 }}>Watcher identity</h3><span className="pill role-watch">WATCHER</span></div>
                <table className="kv"><tbody>
                  <tr><td className="k">tokenId</td><td className="v">{watchId}</td></tr>
                  <tr><td className="k">ENS / Basename</td><td className="v">watcher-{watchId}.intentos.base.eth</td></tr>
                  <tr><td className="k">WatcherKey</td><td className="v">{state ? shortAddr(state.watcherKey) : "—"}</td></tr>
                </tbody></table>
              </>
            )}
          </div>

          <div className="card pad-lg">
            <div className="card-head"><h3>ERC-8004 registration JSON</h3><span className="pill ok">tokenURI</span></div>
            <pre className="code" style={{ maxHeight: 360 }}>{JSON.stringify(registration, null, 2)}</pre>
            <p className="spec-ref" style={{ marginTop: 12 }}>ENSIP-26 agent-context / agent-endpoint[web] + ENSIP-25 agent-registration are written into the subname's text records.</p>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          <a className="btn" href="#/launch/runtime">Next → Runtime &amp; funding</a>
          <a className="btn" href="#/launch">Back to hub</a>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · agent identity</p>
      </main>
    </div>
  );
}
