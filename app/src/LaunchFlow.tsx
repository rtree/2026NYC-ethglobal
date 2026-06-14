import { useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { encodeFunctionData, type Abi } from "viem";
import { useChainState, activeStatus, invalidateChainState, type ChainState } from "./useChainState";
import { TopBar, Nav } from "./Chrome";
import { ActionButton } from "./ActionButton";
import { api, type ChatResponse, type ActivatePlan, type GuardWire } from "./api";
import { authState, ownerModeCached, fetchAuthRequired } from "./auth";
import { tokenPair, delegateAbi } from "./config";
import { shortAddr, shortHash, addrUrl, txUrl, usdc, eth } from "./format";
import type { AgentPackageDraft, IntentDoc, RuntimeRecord } from "./intentTypes";
import { sendOwnerSelfCall } from "./walletSelfCall";

// 030/040/050/060/070/080 collapsed into ONE master/detail screen (plan/010 §15.1). Left = step nav,
// right = the controls for the selected step. No route hops. The IntentBuilder authors BOTH Agent
// Packages; minting happens in the Executor/Watcher steps; identity is inline; Start sets the real
// AgentLoop period + Cloud Run TTL.

type StepId = "intent" | "executor" | "watcher" | "funding" | "start";

const STEPS: { id: StepId; n: string; title: string; sub: string }[] = [
  { id: "intent", n: "①", title: "Intent & Agent Packages", sub: "speak intent → Executor + Watcher packages → FIX" },
  { id: "executor", n: "②", title: "Executor Agent", sub: "mint + EIP-7702 delegate + initialize + identity" },
  { id: "watcher", n: "③", title: "Watcher Agent", sub: "mint + bind (quorum 1) + identity" },
  { id: "funding", n: "④", title: "Gas Funding", sub: "executor / watcher gas-vault lanes" },
  { id: "start", n: "⑤", title: "Start Conditions", sub: "AgentLoop period + Cloud Run TTL" },
];

/**
 * PRODUCT mode (plan/080): "Activate" gate shown BEFORE the IntentBuilder. The visitor signs ONE
 * EIP-7702 (type-4) self-tx that delegates their OWN EOA to ExecutionDelegate7702 and initializes the
 * guard. After this the agent runs strictly inside their guardrails; funds never leave their account.
 */
function ActivateGate({ address, onActivated }: { address: `0x${string}`; onActivated: () => void }) {
  const { data: walletClient } = useWalletClient();
  const [plan, setPlan] = useState<ActivatePlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  // Browser wallets (MetaMask) refuse to sign an EIP-7702 authorization for a dApp-chosen contract
  // (viem throws `Account type "json-rpc" is not supported`). When that happens we offer the local
  // Activation Kit (signs the 7702 authorization with a Ledger / imported key on the user's machine).
  const [needsKit, setNeedsKit] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .activatePlan()
      .then((p) => {
        if (!active) return;
        setPlan(p);
        if (p.alreadyDelegated) onActivated();
      })
      .catch((e) => active && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activate() {
    if (!plan || !walletClient) return;
    setBusy(true);
    setErr(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = plan.initialize.guard as any;
      const guard = {
        router: g.router,
        selector: g.selector,
        tokenA: g.tokenA,
        tokenB: g.tokenB,
        poolFee: Number(g.poolFee),
        amountCapPerTx: BigInt(g.amountCapPerTx),
        cumulativeCap: BigInt(g.cumulativeCap),
        slippageCapBps: Number(g.slippageCapBps),
        expiry: BigInt(g.expiry),
        frozen: !!g.frozen,
        bindingNonce: BigInt(g.bindingNonce),
      };
      const data = encodeFunctionData({
        abi: delegateAbi as Abi,
        functionName: "initialize",
        args: [
          guard,
          plan.initialize.sessionKey,
          plan.initialize.watcherKey,
          plan.initialize.relayer,
          BigInt(plan.initialize.gasPerTxCap),
          BigInt(plan.initialize.initialExecVault),
          BigInt(plan.initialize.initialWatcherVault),
          plan.initialize.packageHash,
          plan.initialize.semanticGuardHash,
        ],
      });
      // `executor: "self"` tells viem the signer also sends the tx (nonce handling). One transaction
      // sets the EOA code to the delegate AND runs initialize() in the same self-call.
      const auth = await walletClient.signAuthorization({
        account: walletClient.account,
        contractAddress: plan.delegateImpl,
        executor: "self",
      });
      const hash = await walletClient.sendTransaction({ to: address, data, authorizationList: [auth] });
      // Poll the plan until the delegation lands on Base, then proceed. Bounded (~75s).
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const p = await api.activatePlan();
        if (p.alreadyDelegated) {
          invalidateChainState();
          onActivated();
          return;
        }
      }
      setErr(`activation sent but not yet confirmed — refresh in a moment (tx ${hash.slice(0, 10)}…)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The expected wallet limitation: surface the Activation Kit instead of a raw viem error.
      if (/json-rpc|signAuthorization|does not support/i.test(msg)) {
        setNeedsKit(true);
        setErr(null);
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (needsKit) {
    return (
      <div className="card pad-lg" style={{ maxWidth: 720 }}>
        <div className="card-head">
          <h3>Activate with the Local Kit</h3>
          <span className="pill">EIP-7702</span>
        </div>
        <p className="desc">
          Your browser wallet won't sign an EIP-7702 delegation to a third-party contract (a deliberate
          MetaMask restriction). Activate from your own machine instead — the key never leaves it, and we
          only ever learn your address. <strong>Ledger is recommended</strong>; a dedicated imported key
          works as a fallback.
        </p>
        <ol className="desc" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Download the kit: <a href="/activate-kit/activate.mjs" download><code>activate.mjs</code></a>{" "}
            (and the <a href="/activate-kit/README.md" target="_blank" rel="noreferrer">README</a>).</li>
          <li>Run it: <code>node activate.mjs --ledger</code> &nbsp;(or <code>node activate.mjs --key-file key.txt</code>).</li>
          <li>Fund the address it shows with a little Base ETH, then it delegates + initializes in one tx.</li>
          <li>Come back and sign in with that <strong>same EOA</strong> to build your Intent.</li>
        </ol>
        <p className="spec-ref">No install needed — <code>viem</code> is bundled. Ledger support needs two extra npm packages (see README).</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a className="btn primary" href="/activate-kit/activate.mjs" download>Download activation kit</a>
          <button className="btn" onClick={() => { setNeedsKit(false); invalidateChainState(); api.activatePlan().then((p) => { if (p.alreadyDelegated) onActivated(); }).catch(() => {}); }}>
            I've activated — continue
          </button>
        </div>
      </div>
    );
  }

  const elsewhere = !!plan?.delegatedElsewhere && !confirmOverwrite;
  return (
    <div className="card pad-lg" style={{ maxWidth: 720 }}>
      <div className="card-head">
        <h3>Activate your account</h3>
        <span className={`pill ${plan ? "" : "muted"}`}>{plan ? "EIP-7702" : "loading…"}</span>
      </div>
      <p className="desc">
        intentOS is non-custodial: your funds stay in your EOA. Activating points your account at the
        intentOS guard (<code>{shortAddr(plan?.delegateImpl ?? "0x")}</code>) and initializes your Hard
        Guardrails in one transaction. The agent can then only trade inside those rails.
      </p>
      <p className="spec-ref">You need a little Base ETH on this EOA (gas + a small gas-vault reserve).</p>
      {elsewhere && (
        <div className="pill fund-exhausted" style={{ display: "block", padding: 12, marginBottom: 12 }}>
          This EOA is already delegated to another contract (e.g. a MetaMask Smart Account at{" "}
          <code>{shortAddr(plan?.currentImpl ?? "0x")}</code>). Activating will OVERWRITE that delegation.
          Use a fresh EOA, or confirm to proceed.
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => setConfirmOverwrite(true)}>
            I understand — use this EOA anyway
          </button>
        </div>
      )}
      <button className="btn primary block" disabled={!plan || !walletClient || busy || elsewhere} onClick={activate}>
        {busy ? "Activating… confirm in your wallet" : `Activate ${shortAddr(address)} (1 transaction)`}
      </button>
      <button className="pill-link" style={{ marginTop: 8 }} onClick={() => setNeedsKit(true)}>
        Use the Local Activation Kit instead (Ledger / hardware) →
      </button>
      {err && <p className="pill fund-exhausted" style={{ marginTop: 10 }}>{err.slice(0, 160)}</p>}
    </div>
  );
}

export function LaunchFlow() {
  const { address } = useAccount();
  const [connectedMode, setConnectedMode] = useState(ownerModeCached() === "connected");
  const [activated, setActivated] = useState(false);
  // The SERVER decides the Owner mode (plan/080). In "connected" mode the visitor delegates their OWN
  // EOA, so read THEIR account and gate the wizard on activation; "demo" mode is unchanged.
  useEffect(() => {
    fetchAuthRequired()
      .then(() => setConnectedMode(ownerModeCached() === "connected"))
      .catch(() => {});
  }, []);
  const { state } = useChainState(12_000, connectedMode && address ? address : undefined);
  const [step, setStep] = useState<StepId>("intent");
  const [intent, setIntent] = useState<IntentDoc | null>(null);

  const hasExecutor = !!intent?.executorTokenId;
  const hasWatcher = !!intent?.watcherTokenId;
  const execFixed = !!intent?.packages.executor.fixed;
  const watchFixed = !!intent?.packages.watcher.fixed;

  // Load the latest draft intent (this wallet) so re-entering the wizard resumes.
  useEffect(() => {
    let active = true;
    api
      .listIntents()
      .then((r) => {
        if (!active) return;
        const draft = r.intents.find((i) => i.status === "draft") ?? null;
        if (draft) return api.getIntent(draft.intentId).then((full) => { if (active) setIntent(full); });
      })
      .catch(() => {/* not signed in / store empty */});
    return () => {
      active = false;
    };
  }, []);

  const done: Record<StepId, boolean> = {
    intent: execFixed && watchFixed,
    executor: hasExecutor,
    watcher: hasWatcher,
    funding: (state?.execVault ?? 0n) > 0n && (state?.watcherVault ?? 0n) > 0n,
    start: false,
  };
  const requiredMet = done.intent && done.executor && done.funding;

  // PRODUCT mode (plan/080): before building an Intent, the visitor delegates their OWN EOA. This gate
  // sits in front of the wizard (i.e. before the IntentBuilder) and only appears in connected mode.
  if (connectedMode && address && !activated) {
    return (
      <div className="app">
        <TopBar status={activeStatus(state)} />
        <main className="main">
          <Nav />
          <div className="page-head" style={{ marginTop: 20 }}>
            <div className="eyebrow">Launch · activate your account</div>
            <h1>Activate intentOS on your EOA</h1>
            <p>Before building an Intent, delegate your own EOA to the intentOS guard with one EIP-7702 transaction. After this, the agent operates strictly inside your guardrails — your funds never leave your account.</p>
          </div>
          <ActivateGate address={address} onActivated={() => setActivated(true)} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar status={activeStatus(state)} />
      <main className="main">
        <Nav />
        <div className="page-head" style={{ marginTop: 20 }}>
          <div className="eyebrow">Launch · single-screen wizard</div>
          <h1>Launch an Intent</h1>
          <p>Author both Agent Packages, mint the Executor (and optional Watcher), fund the gas vault, set the loop — all on one screen. Real Base mainnet transactions.</p>
        </div>

        <div className="launch-grid">
          {/* left: step nav */}
          <div className="card pad-lg" style={{ alignSelf: "start" }}>
            {STEPS.map((s) => (
              <button
                key={s.id}
                className={`step-nav ${step === s.id ? "active" : ""} ${done[s.id] ? "done" : ""}`}
                onClick={() => setStep(s.id)}
              >
                <span className="step-num">{done[s.id] ? "✓" : s.n}</span>
                <span className="step-text">
                  <strong>{s.title}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{s.sub}</span>
                </span>
              </button>
            ))}
            <div className="divider" />
            <div className={`pill ${requiredMet ? "ok" : ""}`} style={{ width: "100%", justifyContent: "center" }}>
              {requiredMet ? "required cards complete" : "complete required cards to start"}
            </div>
            <a className={`btn block ${requiredMet ? "primary" : ""}`} style={{ marginTop: 10 }} href={requiredMet ? "#/console" : undefined} aria-disabled={!requiredMet}>
              {requiredMet ? "Go to Live Console →" : "Finish required steps"}
            </a>
          </div>

          {/* right: detail pane */}
          <div>
            {step === "intent" && <IntentStep intent={intent} setIntent={setIntent} />}
            {step === "executor" && <ExecutorStep state={state} intent={intent} setIntent={setIntent} fixed={execFixed} pkg={intent?.packages.executor} />}
            {step === "watcher" && <WatcherStep state={state} intent={intent} setIntent={setIntent} fixed={watchFixed} hasExecutor={hasExecutor} pkg={intent?.packages.watcher} />}
            {step === "funding" && <FundingStep state={state} intentId={intent?.intentId} />}
            {step === "start" && <StartStep state={state} intent={intent} setIntent={setIntent} />}
          </div>
        </div>
        <p className="footer-note">intentOS · ETHGlobal NYC 2026 · launch</p>
      </main>
    </div>
  );
}

// ---------- ① Intent & Agent Packages ----------
function IntentStep({ intent, setIntent }: { intent: IntentDoc | null; setIntent: (d: IntentDoc | null) => void }) {
  const [turns, setTurns] = useState<{ role: "owner" | "agent"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<"vertex" | "mock" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pkgs = intent?.packages;
  const scroller = useRef<HTMLDivElement>(null);

  // hydrate transcript when an intent is loaded
  useEffect(() => {
    if (!intent) {
      setTurns([]);
      return;
    }
    api.getIntent(intent.intentId).then((full) => {
      setTurns(full.transcript.map((t) => ({ role: t.role as "owner" | "agent", text: t.text })));
    }).catch(() => {});
  }, [intent?.intentId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    setTurns((t) => [...t, { role: "owner", text }]);
    setDraft("");
    try {
      const res: ChatResponse = await api.intentChat(text, intent?.intentId);
      setLlm(res.llm);
      setTurns((t) => [...t, { role: "agent", text: res.reply }]);
      const full = await api.getIntent(res.intentId);
      setIntent(full);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fix(role: "EXECUTOR" | "WATCHER") {
    if (!intent) return;
    try {
      await api.fixPackage(intent.intentId, role);
      const full = await api.getIntent(intent.intentId);
      setIntent(full);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid cols-2">
      <div className="card pad-lg">
        <div className="card-head">
          <h3>IntentBuilder</h3>
          <span className="pill">{llm === "vertex" ? "Vertex AI" : llm === "mock" ? "scripted" : "chat"}</span>
        </div>
        {intent?.status === "live" && (
          <button className="btn block" style={{ marginBottom: 12 }} onClick={() => setIntent(null)}>
            Start a fresh Intent draft
          </button>
        )}
        <div className="chat" ref={scroller} style={{ maxHeight: 320, overflowY: "auto" }}>
          {turns.length === 0 && <div className="bubble agent">Tell me what you want your funds to do. e.g. “DCA USDC into ETH, small and careful.”</div>}
          {turns.map((m, i) => (
            <div key={i} className={`bubble ${m.role === "owner" ? "owner" : "agent"}`}>{m.text}</div>
          ))}
          {busy && <div className="bubble agent">…thinking</div>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Describe purpose & limits…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn primary" onClick={send} disabled={busy}>Send</button>
        </div>
        {!authState() && <p className="spec-ref" style={{ marginTop: 8 }}>Sign in with your wallet (top-right) to save drafts to your account.</p>}
        {err && <p className="pill fund-exhausted" style={{ marginTop: 8 }}>{err.slice(0, 80)}</p>}
      </div>

      <div>
        <PackageCard title="Executor Agent Package" role="EXECUTOR" intentId={intent?.intentId} pkg={pkgs?.executor} setIntent={setIntent} onFix={() => fix("EXECUTOR")} />
        <div style={{ height: 16 }} />
        <PackageCard title="Watcher Agent Package" role="WATCHER" intentId={intent?.intentId} pkg={pkgs?.watcher} setIntent={setIntent} onFix={() => fix("WATCHER")} />
      </div>
    </div>
  );
}

function PackageCard({
  title,
  role,
  intentId,
  pkg,
  setIntent,
  onFix,
}: {
  title: string;
  role: "EXECUTOR" | "WATCHER";
  intentId?: string;
  pkg?: AgentPackageDraft;
  setIntent: (d: IntentDoc | null) => void;
  onFix: () => void;
}) {
  const [semanticText, setSemanticText] = useState(pkg?.semantic.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setSemanticText(pkg?.semantic.join("\n") ?? ""), [pkg?.packageHash, pkg?.semantic.join("\n")]);
  async function saveSemantic() {
    if (!intentId || !pkg || pkg.fixed) return;
    setSaving(true);
    try {
      await api.updatePackageSemantic(intentId, role, semanticText.split("\n"));
      setIntent(await api.getIntent(intentId));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="card">
      <div className="card-head">
        <h3 style={{ fontSize: 18 }}>{title}</h3>
        <span className={`pill ${role === "EXECUTOR" ? "role-exec" : "role-watch"}`}>{role}</span>
      </div>
      {!pkg ? (
        <p className="desc">Start the conversation to generate this package.</p>
      ) : (
        <>
          <p className="desc" style={{ marginTop: 0 }}>{pkg.summary}</p>
          <div className="guard hard"><span className="g-name">amountCapPerTx</span><span className="g-val">{usdc(BigInt(pkg.constraints.amountCapPerTx))}</span></div>
          <div className="guard hard"><span className="g-name">cumulativeCap</span><span className="g-val">{usdc(BigInt(pkg.constraints.cumulativeCap))}</span></div>
          <div className="guard hard"><span className="g-name">slippageCapBps</span><span className="g-val">{pkg.constraints.slippageCapBps}</span></div>
          <details style={{ marginTop: 8 }}>
            <summary className="spec-ref">AGENTS.md</summary>
            <pre className="code" style={{ maxHeight: 160, whiteSpace: "pre-wrap" }}>{pkg.agents}</pre>
          </details>
          <div className="guard sem" style={{ marginTop: 6 }}><span className="g-name">semantic</span><span className="g-val" style={{ fontSize: 12 }}>{pkg.semantic.join(" · ")}</span></div>
          {!pkg.fixed && (
            <label className="field" style={{ marginTop: 10 }}>
              <span>Edit semantic guardrails (one per line)</span>
              <textarea className="input" value={semanticText} onChange={(e) => setSemanticText(e.target.value)} />
              <button className="btn block" style={{ marginTop: 8 }} onClick={saveSemantic} disabled={saving}>
                {saving ? "Saving semantic..." : "Save semantic guardrails"}
              </button>
            </label>
          )}
          <div style={{ marginTop: 12 }}>
            {pkg.fixed ? (
              <span className="pill ok"><span className="dot" />FIXED · {pkg.packageHash?.slice(0, 12)}…</span>
            ) : (
              <button className="btn primary block" onClick={onFix}>FIX this package</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- ② Executor Agent ----------
function ExecutorStep({
  state,
  intent,
  setIntent,
  fixed,
  pkg,
}: {
  state: ChainState | null;
  intent: IntentDoc | null;
  setIntent: (d: IntentDoc | null) => void;
  fixed: boolean;
  pkg?: AgentPackageDraft;
}) {
  const execId = intent?.executorTokenId ?? null;
  const ensName = execId ? `agent-${execId}.intentos.base.eth` : "agent-<tokenId>.intentos.base.eth";
  return (
    <div className="grid cols-2">
      <div className="card pad-lg">
        <div className="card-head"><h3>Create Executor Agent</h3><span className="pill role-exec">EXECUTOR</span></div>
        <p className="desc">Mint the AgentNFT, delegate the Owner EOA via EIP-7702, and initialize the Hard Guardrails from the fixed package. One real transaction.</p>
        {!fixed && <div className="note">FIX the Executor package in step ① first.</div>}
        <ActionButton
          label={execId ? `Executor minted #${execId}` : "Create Executor (mint + EIP-7702 + initialize)"}
          workingLabel="Minting Executor..."
          className="btn primary block"
          run={async () => {
            const r = await api.createExecutor(intent?.intentId);
            if (intent?.intentId) setIntent(await api.getIntent(intent.intentId));
            return r;
          }}
          disabled={!fixed || !!execId}
        />
        {intent?.executorTxHash && (
          <p className="spec-ref">
            mint tx <a href={txUrl(intent.executorTxHash)} target="_blank" rel="noreferrer">{shortHash(intent.executorTxHash)}</a>
          </p>
        )}
        <p className="spec-ref">packageHash {pkg?.packageHash ? `${pkg.packageHash.slice(0, 14)}…` : "— (fix first)"}</p>
      </div>
      <div className="card pad-lg">
        <div className="card-head"><h3>Agent identity</h3>{execId ? <span className="pill ok">minted #{execId}</span> : <span className="pill">after mint</span>}</div>
        <table className="kv"><tbody>
          <tr><td className="k">tokenId</td><td className="v">{execId ?? "—"}</td></tr>
          <tr><td className="k">ENS / Basename</td><td className="v">{ensName} {execId ? <span className="muted">(planned)</span> : null}</td></tr>
          <tr><td className="k">AgentNFT</td><td className="v">{state ? <a href={addrUrl(state.agentNft)} target="_blank" rel="noreferrer">{shortAddr(state.agentNft)}</a> : "—"}</td></tr>
          <tr><td className="k">ExecutionContract</td><td className="v">{state ? <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a> : "—"}</td></tr>
          <tr><td className="k">SessionKey (KMS)</td><td className="v">{state ? shortAddr(state.sessionKey) : "—"}</td></tr>
        </tbody></table>
        <p className="spec-ref" style={{ marginTop: 10 }}>ENS subname + ERC-8004 registration are <strong>planned</strong> (not yet written on-chain in this MVP); the AgentNFT + ExecutionContract above are real.</p>
      </div>
    </div>
  );
}

// ---------- ③ Watcher Agent ----------
function WatcherStep({
  state,
  intent,
  setIntent,
  fixed,
  hasExecutor,
  pkg,
}: {
  state: ChainState | null;
  intent: IntentDoc | null;
  setIntent: (d: IntentDoc | null) => void;
  fixed: boolean;
  hasExecutor: boolean;
  pkg?: AgentPackageDraft;
}) {
  const watchId = intent?.watcherTokenId ?? null;
  return (
    <div className="grid cols-2">
      <div className="card pad-lg">
        <div className="card-head"><h3>Create Watcher Agent</h3><span className="pill role-watch">WATCHER · quorum 1</span></div>
        <p className="desc">Mint the Watcher AgentNFT bound to the Executor. It can only tighten / freeze — never loosen, never move funds.</p>
        {!hasExecutor && <div className="note">Create the Executor Agent (step ②) first.</div>}
        {hasExecutor && !fixed && <div className="note">FIX the Watcher package in step ① first.</div>}
        <ActionButton
          label={watchId ? `Watcher minted #${watchId}` : "Create Watcher (mint + bind, quorum 1)"}
          workingLabel="Minting Watcher..."
          className="btn block"
          run={async () => {
            const r = await api.createWatcher(intent?.intentId);
            if (intent?.intentId) setIntent(await api.getIntent(intent.intentId));
            return r;
          }}
          disabled={!hasExecutor || !fixed || !!watchId}
        />
        {intent?.watcherTxHash && (
          <p className="spec-ref">
            mint tx <a href={txUrl(intent.watcherTxHash)} target="_blank" rel="noreferrer">{shortHash(intent.watcherTxHash)}</a>
          </p>
        )}
        <p className="spec-ref">packageHash {pkg?.packageHash ? `${pkg.packageHash.slice(0, 14)}…` : "— (fix first)"}</p>
      </div>
      <div className="card pad-lg">
        <div className="card-head"><h3>Watcher identity</h3>{watchId ? <span className="pill ok">minted #{watchId}</span> : <span className="pill">after mint</span>}</div>
        <table className="kv"><tbody>
          <tr><td className="k">tokenId</td><td className="v">{watchId ?? "—"}</td></tr>
          <tr><td className="k">ENS / Basename</td><td className="v">{watchId ? `watcher-${watchId}.intentos.base.eth` : "watcher-<tokenId>.intentos.base.eth"} {watchId ? <span className="muted">(planned)</span> : null}</td></tr>
          <tr><td className="k">AgentNFT</td><td className="v">{state ? <a href={addrUrl(state.agentNft)} target="_blank" rel="noreferrer">{shortAddr(state.agentNft)}</a> : "—"}</td></tr>
          <tr><td className="k">ExecutionContract</td><td className="v">{state ? <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a> : "—"}</td></tr>
          <tr><td className="k">WatcherKey (KMS)</td><td className="v">{state ? shortAddr(state.watcherKey) : "—"}</td></tr>
          <tr><td className="k">watchedExecutor</td><td className="v">{intent?.executorTokenId ?? "—"}</td></tr>
        </tbody></table>
        <p className="spec-ref" style={{ marginTop: 10 }}>The Watcher is optional but recommended — it is the semantic circuit breaker.</p>
      </div>
    </div>
  );
}

// ---------- ④ Gas Funding ----------
function FundingStep({ state, intentId }: { state: ChainState | null; intentId?: string }) {
  const { data: walletClient } = useWalletClient();
  const connected = ownerModeCached() === "connected";
  async function fundLane(lane: "executor" | "watcher") {
    if (connected) {
      if (!walletClient || !state?.delegate) throw new Error("connect your wallet first");
      const amount = lane === "watcher" ? 800_000_000_000_000n : 1_000_000_000_000_000n;
      const data = encodeFunctionData({
        abi: delegateAbi as Abi,
        functionName: "fundGasVault",
        args: [lane === "watcher", amount],
      });
      const txHash = await walletClient.sendTransaction({ to: state.delegate, data });
      invalidateChainState();
      return { txHash };
    }
    return api.fundGas(lane, intentId);
  }

  return (
    <div className="grid cols-2">
      <div className="card pad-lg">
        <div className="card-head"><h3>Runtime record</h3><span className={`pill ${state?.delegated ? "ok" : ""}`}>{state?.delegated ? "bound" : "unbound"}</span></div>
        <table className="kv"><tbody>
          <tr><td className="k">Executor tokenId</td><td className="v">{state?.session.executorTokenId ?? "—"}</td></tr>
          <tr><td className="k">Runtime substrate</td><td className="v">Control panel only (OpenClaw not provisioned)</td></tr>
          <tr><td className="k">Owner EOA (7702)</td><td className="v">{state ? <a href={addrUrl(state.delegate)} target="_blank" rel="noreferrer">{shortAddr(state.delegate)}</a> : "—"}</td></tr>
          <tr><td className="k">bindingNonce</td><td className="v">{state?.guard ? String(state.guard.bindingNonce) : "—"}</td></tr>
        </tbody></table>
      </div>
      <div className="card pad-lg">
        <div className="card-head"><h3>Gas vault lanes</h3>{(state && ((state.execVault ?? 0n) > 0n || (state.watcherVault ?? 0n) > 0n)) ? <span className="pill ok">Owner-funded</span> : <span className="pill">unfunded</span>}</div>
        <div className="guard"><span className="g-name" style={{ fontFamily: "var(--sans)" }}>Executor lane</span><span className="g-val">{state ? eth(state.execVault) : "—"}</span></div>
        <div className="guard"><span className="g-name" style={{ fontFamily: "var(--sans)" }}>Watcher lane</span><span className="g-val">{state ? eth(state.watcherVault) : "—"}</span></div>
        <p className="desc" style={{ marginTop: 12 }}>Cumulative spent {state ? usdc(state.cumulativeSpent) : "—"} of {state?.guard ? usdc(state.guard.cumulativeCap) : "—"} cap.</p>
        <p className="spec-ref">The executor lane is seeded in initialize(); the Watcher lane is topped up on Watcher creation. Top up a lane here if it runs low.</p>
        <div style={{ marginTop: 12 }}>
          <ActionButton label="Top up Executor lane (+0.001 ETH)" className="btn block" run={() => fundLane("executor")} />
          <ActionButton label="Top up Watcher lane (+0.0008 ETH)" className="btn block" run={() => fundLane("watcher")} />
        </div>
      </div>
    </div>
  );
}

// ---------- ⑤ Start Conditions ----------
function StartStep({ state, intent, setIntent }: { state: ChainState | null; intent: IntentDoc | null; setIntent: (d: IntentDoc) => void }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const cfg = intent?.startConfig ?? { loopPeriodSec: 10, ttlMinutes: 1, watcherEnabled: true };
  const [loop, setLoop] = useState(cfg.loopPeriodSec);
  const [ttl, setTtl] = useState(cfg.ttlMinutes);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [started, setStarted] = useState<{ autoStopAt: number; plannedTicks: number } | null>(intent?.runtime ?? null);
  const [runtimeRecord, setRuntimeRecord] = useState<RuntimeRecord | null>(null);

  useEffect(() => {
    setLoop(cfg.loopPeriodSec);
    setTtl(cfg.ttlMinutes);
    setStarted(intent?.runtime ?? null);
    setRuntimeRecord(null);
    if (!intent?.intentId) return;
    let active = true;
    async function refreshRuntime() {
      if (!intent?.intentId) return;
      api.runtimeStatus(intent.intentId)
        .then((r) => {
          if (!active) return;
          setRuntimeRecord(r.runtimeRecord);
          if (r.runtimeRecord && !["scheduled", "running", "stopping"].includes(r.runtimeRecord.status)) {
            setStarted(null);
          }
        })
        .catch(() => {});
    }
    refreshRuntime();
    const t = setInterval(refreshRuntime, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [intent?.intentId]);

  async function save() {
    if (!intent) return;
    setErr(null);
    try {
      const r = await api.setStartConfig(intent.intentId, { loopPeriodSec: loop, ttlMinutes: ttl });
      setIntent({ ...intent, startConfig: r.startConfig });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const hasExecutor = !!intent?.executorTokenId;
  const pkg = intent?.packages.executor;
  const runtimeActive = runtimeRecord?.status === "scheduled" || runtimeRecord?.status === "running";
  async function applyIntentGuard() {
    if (ownerModeCached() !== "connected") return;
    if (!state?.delegate || !intent?.intentId) throw new Error("active intent not ready");
    const plan = await api.ownerGuardPlan(intent.intentId);
    const data = encodeFunctionData({
      abi: delegateAbi as Abi,
      functionName: "ownerUpdateGuard",
      args: [toGuard(plan.guard)],
    });
    await sendOwnerSelfCall(walletClient, address, state.delegate, data);
    invalidateChainState();
  }
  return (
    <div className="grid cols-2">
      <div className="card pad-lg">
        <div className="card-head"><h3>Start conditions</h3><span className="pill">bounded</span></div>
        <label className="field"><span>AgentLoop period (seconds)</span>
          <input className="input" type="number" min={5} max={60} value={loop} onChange={(e) => setLoop(Number(e.target.value))} />
        </label>
        <label className="field" style={{ marginTop: 12 }}><span>Auto-stop after (minutes) — Cloud Run TTL</span>
          <input className="input" type="number" min={1} max={5} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
        </label>
        <p className="spec-ref" style={{ marginTop: 10 }}>
          This starts a bounded OpenClaw session: one tick every {loop}s after the previous tick
          completes, hard stop after {ttl} min (max 5m here), with Owner stop and budget self-stop.
        </p>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={save}>{saved ? "Saved ✓" : "Save start conditions"}</button>
        {err && <p className="pill fund-exhausted" style={{ marginTop: 8 }}>{err.slice(0, 80)}</p>}
      </div>
      <div className="card pad-lg">
        <div className="card-head"><h3>Launch summary</h3>{state?.delegated ? <span className="pill ok">live on Base</span> : <span className="pill">not yet live</span>}</div>
        <table className="kv"><tbody>
          <tr><td className="k">Pair</td><td className="v">{tokenPair(state?.guard?.tokenA, state?.guard?.tokenB)}</td></tr>
          <tr><td className="k">Executor</td><td className="v">{intent?.executorTokenId ? `#${intent.executorTokenId}` : "—"}</td></tr>
          <tr><td className="k">Watcher</td><td className="v">{intent?.watcherTokenId ? `#${intent.watcherTokenId} · quorum 1` : "none"}</td></tr>
          <tr><td className="k">amountCapPerTx</td><td className="v">{pkg ? usdc(BigInt(pkg.constraints.amountCapPerTx)) : (state?.guard ? usdc(state.guard.amountCapPerTx) : "—")}</td></tr>
          <tr><td className="k">cumulativeCap</td><td className="v">{pkg ? usdc(BigInt(pkg.constraints.cumulativeCap)) : (state?.guard ? usdc(state.guard.cumulativeCap) : "—")}</td></tr>
          <tr><td className="k">Executor gas vault</td><td className="v">{state ? eth(state.execVault) : "—"}</td></tr>
          <tr><td className="k">Loop / TTL</td><td className="v">{loop}s · {ttl} min</td></tr>
          <tr><td className="k">Executor pkg</td><td className="v">{pkg?.packageHash ? `${pkg.packageHash.slice(0, 12)}…` : "— (fix)"}</td></tr>
        </tbody></table>
        {started && runtimeActive ? (
          <div className="pill ok" style={{ marginTop: 12 }}>
            <span className="dot" />runtime schedule saved · ≤{started.plannedTicks} planned ticks · autostop {new Date(started.autoStopAt).toLocaleTimeString()}
          </div>
        ) : (
          <ActionButton
            label="Start OpenClaw runtime session"
            className="btn primary block"
            disabled={!hasExecutor}
            run={async () => {
              await applyIntentGuard();
              const r = await api.runtimeStart(intent?.intentId);
              setStarted(r.runtime);
              setRuntimeRecord(r.runtimeRecord ?? null);
              // Fire the bounded resident session as a separate request so the UI can immediately show
              // status/stop controls. The server enforces TTL/tick/budget bounds.
              api.runtimeRun(intent?.intentId)
                .then((out) => setRuntimeRecord(out.runtimeRecord))
                .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
              return { ok: true } as const;
            }}
          />
        )}
        {runtimeRecord && (
          <table className="kv" style={{ marginTop: 12 }}><tbody>
            <tr><td className="k">Runtime status</td><td className="v">{runtimeRecord.status}</td></tr>
            <tr><td className="k">Runtime id</td><td className="v">{runtimeRecord.runtimeId}</td></tr>
            <tr><td className="k">Executor package</td><td className="v">{shortHash(runtimeRecord.packageHash)}</td></tr>
            {runtimeRecord.watcherPackageHash && <tr><td className="k">Watcher package</td><td className="v">{shortHash(runtimeRecord.watcherPackageHash)}</td></tr>}
            <tr><td className="k">Executed ticks</td><td className="v">{runtimeRecord.executedTicks} / {runtimeRecord.plannedTicks}</td></tr>
            <tr><td className="k">Last action</td><td className="v">{runtimeRecord.lastTickAction ?? "—"}</td></tr>
            {runtimeRecord.lastOpenClawResponse && <tr><td className="k">OpenClaw</td><td className="v">{runtimeRecord.lastOpenClawResponse}</td></tr>}
            <tr><td className="k">Watcher</td><td className="v">{runtimeRecord.lastWatcherAction ?? "—"}</td></tr>
            <tr><td className="k">LLM budget</td><td className="v">${runtimeRecord.estimatedVertexCostUsd.toFixed(4)} / ${runtimeRecord.maxVertexCostUsd.toFixed(2)} · {runtimeRecord.llmCallsUsed} calls</td></tr>
          </tbody></table>
        )}
        {runtimeActive && (
          <ActionButton
            label="Stop runtime schedule"
            className="btn danger block"
            run={async () => {
              const r = await api.runtimeStop(intent?.intentId);
              setRuntimeRecord(r.runtimeRecord);
              return { ok: true } as const;
            }}
          />
        )}
        {!hasExecutor && <p className="spec-ref" style={{ marginTop: 8 }}>Create the Executor Agent first (step ②).</p>}
        <a className="btn block" style={{ marginTop: 10 }} href="#/console">Go to Live Console →</a>
      </div>
    </div>
  );
}

function toGuard(g: GuardWire) {
  return {
    router: g.router,
    selector: g.selector,
    tokenA: g.tokenA,
    tokenB: g.tokenB,
    poolFee: Number(g.poolFee),
    amountCapPerTx: BigInt(String(g.amountCapPerTx)),
    cumulativeCap: BigInt(String(g.cumulativeCap)),
    slippageCapBps: Number(g.slippageCapBps),
    expiry: BigInt(String(g.expiry)),
    frozen: Boolean(g.frozen),
    bindingNonce: BigInt(String(g.bindingNonce)),
  };
}
