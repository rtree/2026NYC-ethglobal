import { useEffect, useState } from "react";
import { useChainState, hasActiveIntent, activeStatus } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { ActionButton } from "./ActionButton";
import { api } from "./api";
import { usdc } from "./format";
import type { IntentDoc } from "./intentTypes";

export function IntentList() {
  const { state } = useChainState();
  const active = hasActiveIntent(state);
  const status = activeStatus(state);
  const [intent, setIntent] = useState<IntentDoc | null>(null);

  // Load this wallet's active Intent so the card renders REAL values (id, title) — not static copy.
  useEffect(() => {
    api.listIntents()
      .then((r) => setIntent(r.intents.find((i) => i.status === "live") ?? r.intents.find((i) => i.executorTokenId) ?? null))
      .catch(() => {});
  }, []);

  const cardTitle = intent?.title ?? "DCA USDC → WETH";
  const cardId = intent?.intentId ?? "intent";

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
            <a className="card nav-card pad-lg" href="#/console">
              <div className="card-head">
                <span className="num">{cardId}</span>
                <span className={`pill ${status}`}>{status}</span>
              </div>
              <h3>{cardTitle}</h3>
              <p className="desc">
                {state ? `Cumulative spent ${usdc(state.cumulativeSpent)} · per-tx cap ${usdc(state.guard?.amountCapPerTx ?? 0n)}` : "Loading live state…"}
              </p>
              <span className="pill role-exec">Executor #{state?.session.executorTokenId}</span>{" "}
              {state?.session.watcherTokenId && <span className="pill role-watch">Watcher #{state.session.watcherTokenId}</span>}
            </a>
          ) : (
            <div className="card pad-lg" style={{ opacity: 0.75 }}>
              <div className="card-head">
                <span className="num">none</span>
                <span className="pill">—</span>
              </div>
              <h3>No active Intent yet</h3>
              <p className="desc">
                You haven&apos;t created an Intent in this session. Start one from the card on the
                right: speak an intent, build the Executor &amp; Watcher Agent Packages, mint, delegate
                via EIP-7702, and go live on Base mainnet.
              </p>
            </div>
          )}

          <div className="card pad-lg">
            <div className="card-head">
              <span className="num">new</span>
              <span className="arrow">→</span>
            </div>
            <h3>{active ? "Run a new Intent" : "Run an Intent"}</h3>
            <p className="desc">Speak an intent, generate the Executor &amp; Watcher Agent Packages, mint, delegate via EIP-7702, fund the gas vault, and start.</p>
            {active ? (
              <>
                <button className="btn block" disabled aria-disabled="true" title="One active Intent per Owner">
                  One active Intent per Owner
                </button>
                <p className="spec-ref" style={{ marginTop: 8 }}>Reset the current Intent below to start a new one.</p>
              </>
            ) : (
              <a className="btn primary block" href="#/launch">Create an Intent →</a>
            )}
          </div>
        </div>
        {active && (
          <div style={{ marginTop: 18 }}>
            <ActionButton label="Reset demo session (clear agents · unfreeze)" className="btn" run={() => api.reset(intent?.intentId)} />
          </div>
        )}
        <p className="footer-note">IntentOS · ETHGlobal NYC 2026</p>
      </main>
    </div>
  );
}
