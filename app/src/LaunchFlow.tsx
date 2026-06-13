import { useState } from "react";
import { TopBar, Nav } from "./Chrome";
import { ADDR } from "./config";
import { shortAddr, addrUrl } from "./format";
import { ActionButton } from "./ActionButton";
import { api } from "./api";

const SCRIPT: { who: "owner" | "agent"; text: string }[] = [
  { who: "owner", text: "I want to swap USDC into ETH little by little." },
  { who: "agent", text: "Got it — recurring small BUYs on USDC↔WETH. What size per trade, and a total ceiling?" },
  { who: "owner", text: "Max 0.002 USDC per trade, 0.01 USDC total. Stop on big swings." },
  { who: "agent", text: "I'll set a per-tx cap and a cumulative cap with a slippage limit. Avoid unnatural routes and stale quotes?" },
  { who: "owner", text: "Yes. And on failure, fall back to USDC." },
  { who: "agent", text: "Done. Review the Agent Package on the right, then mint the Executor and delegate via EIP-7702." },
];

const STEPS = [
  ["Intent creation", "IntentBuilder → Agent Package → packageHash", true],
  ["Executor Agent mint", "AgentNFT (ERC-721 / ERC-8004)", true],
  ["EIP-7702 delegate + initialize", "burn HardGuardState into the Owner EOA", true],
  ["Gas vault funding", "seed the executor lane (in initialize)", true],
  ["Agent identity", "agent-<tokenId>.intentos.base.eth + registration", false],
  ["Watcher Agent (optional)", "quorum=1 semantic circuit breaker", false],
  ["Start", "begin the bounded AgentLoop", true],
] as const;

export function LaunchFlow() {
  const [shown, setShown] = useState(2);

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">030–080 · Intent Launch</div>
          <h1>Launch a guarded Intent</h1>
          <p>
            Speak purpose and limits — not contract arguments. The IntentBuilder compiles the
            conversation into an Agent Package: enforceable Hard Guardrails + after-the-fact Semantic
            Guardrails. The demo Owner is already deployed on Base mainnet.
          </p>
        </div>

        <div className="grid cols-2">
          <div className="card pad-lg">
            <div className="card-head">
              <h3>IntentBuilder</h3>
              <span className="pill role-exec">EXECUTOR</span>
            </div>
            <div className="chat">
              {SCRIPT.slice(0, shown).map((m, i) => (
                <div key={i} className={`bubble ${m.who}`}>{m.text}</div>
              ))}
            </div>
            {shown < SCRIPT.length ? (
              <button className="btn block" style={{ marginTop: 14 }} onClick={() => setShown((s) => Math.min(SCRIPT.length, s + 1))}>
                Continue conversation
              </button>
            ) : (
              <div style={{ marginTop: 14 }}>
                <ActionButton label="① Create Executor Agent (mint + EIP-7702 + initialize)" className="btn primary block" run={api.createExecutor} />
                <ActionButton label="② Create Watcher Agent (mint + bind, quorum 1)" className="btn block" run={api.createWatcher} />
                <p className="spec-ref">Real Base mainnet transactions. Then open the Owner dashboard to trade, and the Watcher dashboard to freeze.</p>
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-head">
                <h3>Agent Package preview</h3>
                <span className="pill">packageHash 0x7c…e2</span>
              </div>
              <p className="desc">Hard Guardrails → CONSTRAINTS.json → ExecutionContract</p>
              <div className="guard hard"><span className="g-name">tokenPair</span><span className="g-val">USDC / WETH</span></div>
              <div className="guard hard"><span className="g-name">amountCapPerTx</span><span className="g-val">0.002 USDC</span></div>
              <div className="guard hard"><span className="g-name">cumulativeCap</span><span className="g-val">0.01 USDC</span></div>
              <div className="guard hard"><span className="g-name">slippageCapBps</span><span className="g-val">300 (3%)</span></div>
              <p className="desc" style={{ marginTop: 14 }}>Semantic Guardrails → Watcher reads after execution</p>
              <div className="guard sem"><span className="g-name">route naturalness</span><span className="g-val">avoid unnatural</span></div>
              <div className="guard sem"><span className="g-name">quote freshness</span><span className="g-val">reject stale</span></div>
              <div className="guard sem"><span className="g-name">recovery preference</span><span className="g-val">→ USDC on fail</span></div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Setup steps</h3>
                <span className="pill ok">live on Base</span>
              </div>
              {STEPS.map(([title, sub, done]) => (
                <div className="guard" key={title}>
                  <span className="g-name" style={{ fontFamily: "var(--sans)" }}>
                    {title}<br /><span className="muted" style={{ fontSize: 13 }}>{sub}</span>
                  </span>
                  <span className="g-val">{done ? "✓" : "—"}</span>
                </div>
              ))}
              <p className="spec-ref" style={{ marginTop: 12 }}>
                Demo Owner <a href={addrUrl(ADDR.owner)} target="_blank" rel="noreferrer">{shortAddr(ADDR.owner)}</a> is already delegated + initialized.
              </p>
            </div>
          </div>
        </div>
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026 · launch flow</p>
      </main>
    </div>
  );
}
