// Server-side journey orchestration: the write-path (mint / 7702 / fund / KMS-signed execute / votes)
// that must stay off the browser. Reuses @intentos/runtime. Tiny amounts only; bounded actions.
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  fallback,
  http,
  keccak256,
  parseEther,
  toHex,
  type Account,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  Action,
  ExecutionDelegate7702Abi,
  KMS,
  TOKENS,
  UNISWAP,
  getKmsEthAddress,
  keyVersion,
  type GuardPatch,
  type HardGuardState,
} from "@intentos/shared";
import {
  buildExecutionRequest,
  delegateAndInitialize,
  fundGasVault,
  getBaseRpcUrls,
  getOwnerAccount,
  getPlatformAccount,
  mintExecutorNft,
  mintWatcherNft,
  ownerUpdateGuard,
  previewGuard,
  quoteExactInputSingle,
  relaySubmitExecution,
  signExecutionRequest,
  TxRevertedError,
  voteFreeze,
  voteTighten,
} from "@intentos/runtime";
import { store } from "./store.js";
import { openClawComplete } from "./openclaw.js";
import { isProductionRuntime } from "./authGate.js";
import type { AgentPackageDraft, PackageSnapshot, RuntimeRecord } from "./intentTypes.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;
const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const AMOUNT_IN = 1_000n; // 0.001 USDC per trade
const DEMO_CUM_CAP = 100_000n; // 0.1 USDC cumulative — enough for a long demo session

// Watcher VOTE_TIGHTEN softness: narrow amountCapPerTx by this many bps each vote (default 1500 = -15%)
// instead of halving (-50%). It CAN go below one trade size: after ~5 votes the per-tx cap drops under
// 0.001 USDC, so the next guarded trade is rejected with AmountTooLarge and the runtime self-stops — a
// visible, on-chain "Watcher tightened it shut" circuit breaker. Override with
// INTENTOS_WATCHER_TIGHTEN_BPS (e.g. 1000 = gentler/more votes, 3000 = harsher/fewer votes).
const WATCHER_TIGHTEN_BPS = BigInt(process.env.INTENTOS_WATCHER_TIGHTEN_BPS ?? "1500");

interface Deployments {
  contracts: { executionDelegate7702Impl: Address; agentNFT: Address };
}

function deployments(): Deployments {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/journey.js -> ../../../deployment ; src in dev -> ../../../deployment
  const path = resolve(here, "../../../deployment/base-mainnet.json");
  return JSON.parse(readFileSync(path, "utf8")) as Deployments;
}

// On-chain Owner identity (plan/080 ARCH-001). "demo" = the shared platform demo Owner signs
// server-side (judges need no funds). "connected" = the visitor's OWN EOA is the Owner; they sign the
// EIP-7702 delegation locally (Activation Kit) and the server only relays SessionKey-signed executions.
// DEFAULT: "connected" on production runtimes (the real product is the single live URL — plan/080), but
// "demo" locally (so dev/e2e don't hit the Activate gate). Set INTENTOS_OWNER explicitly to override.
// Defaulting in code (not just env) keeps the deployed URL on the real per-user path even if a deploy
// forgets the env var.
export type OwnerMode = "demo" | "connected";
export function ownerMode(): OwnerMode {
  const v = (process.env.INTENTOS_OWNER ?? "").toLowerCase();
  if (v === "connected") return "connected";
  if (v === "demo") return "demo";
  return isProductionRuntime() ? "connected" : "demo";
}

/** Connected EOA from the CAIP-10 uid `eip155:<chainId>:<address>` (web3auth.ts). */
export function addressFromUid(uid: string): Address | null {
  const a = uid.split(":")[2] ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Address) : null;
}

// ---- cached contexts: demo singleton + a per-delegate cache for connected (per-user) accounts ----
let _ctx: Awaited<ReturnType<typeof buildCtx>> | null = null;
const _ctxByDelegate = new Map<string, Awaited<ReturnType<typeof buildCtx>>>();

async function buildCtx(delegateOverride?: Address) {
  // Multiple Base RPCs behind a viem fallback() transport: a single endpoint failing (rate-limit,
  // 5xx, the Infura "no access" blip) auto-fails over to the next, and viem ranks healthier ones first.
  const rpcs = await getBaseRpcUrls();
  const transport = fallback(
    rpcs.map((u) => http(u, { retryCount: 3, retryDelay: 600, batch: false })),
    { rank: { interval: 60_000, sampleCount: 3 }, retryCount: 2 },
  );
  // Typed as any: viem resolves to multiple peer-variants across workspace packages, which TS treats
  // as distinct nominal types. Runtime is fine (fork e2e passes); this avoids the type-identity clash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pub: any = createPublicClient({ chain: base, transport });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wallet: any = createWalletClient({ chain: base, transport });
  const [owner, platform, sessionKey, watcherKey] = await Promise.all([
    getOwnerAccount(),
    getPlatformAccount(),
    getKmsEthAddress(keyVersion(KMS.executorSessionKey)),
    getKmsEthAddress(keyVersion(KMS.watcherSessionKey)),
  ]);
  const d = deployments();
  const delegate = (delegateOverride ?? (owner.address as Address)) as Address;
  return {
    pub,
    wallet,
    owner: owner as Account,
    platform: platform as Account,
    sessionKey,
    watcherKey,
    delegate,
    // true when the Owner is the connected user's OWN EOA (not the shared demo Owner): the server must
    // NOT sign owner-authority calls (delegate/initialize/fund/updateGuard) — the browser does (080).
    connected: delegate.toLowerCase() !== (owner.address as string).toLowerCase(),
    delegateImpl: d.contracts.executionDelegate7702Impl,
    agentNft: d.contracts.agentNFT,
  };
}

export type Ctx = Awaited<ReturnType<typeof buildCtx>>;

/** Context for the active Owner account. With no override → the demo singleton; with a delegate address
 *  (connected mode) → a per-user context whose reads/relays target THAT EOA. */
export async function ctx(delegateOverride?: Address): Promise<Ctx> {
  if (!delegateOverride) {
    if (!_ctx) _ctx = await buildCtx();
    return _ctx;
  }
  const key = delegateOverride.toLowerCase();
  let c = _ctxByDelegate.get(key);
  if (!c) {
    c = await buildCtx(delegateOverride);
    _ctxByDelegate.set(key, c);
  }
  return c;
}

/** Resolve the Owner context for a write call: in connected mode use the caller's EOA (from uid) as the
 *  delegate; in demo mode (or when no uid) use the shared demo Owner. */
async function ownerCtx(opts?: CreateOpts): Promise<Ctx> {
  const addr = opts?.uid && ownerMode() === "connected" ? addressFromUid(opts.uid) : null;
  return ctx(addr ?? undefined);
}

// ---- in-memory session (which agents exist this demo run) ----
export const session: { executorTokenId: string | null; watcherTokenId: string | null; log: ActionLog[] } = {
  executorTokenId: null,
  watcherTokenId: null,
  log: [],
};

export interface ActionLog {
  at: number;
  action: string;
  txHash?: Hex;
  ok: boolean;
  detail?: string;
}

function logAction(a: ActionLog) {
  session.log.unshift(a);
  if (session.log.length > 50) session.log.pop();
}

const DEMO_GUARD = (bindingNonce: bigint, frozen = false): HardGuardState => ({
  router: UNISWAP.swapRouter02,
  selector: "0x04e45aaf",
  tokenA: TOKENS.USDC,
  tokenB: TOKENS.WETH,
  poolFee: UNISWAP.usdcWethPoolFee,
  amountCapPerTx: 2_000n,
  cumulativeCap: DEMO_CUM_CAP,
  slippageCapBps: 300,
  expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
  frozen,
  bindingNonce,
});

const intentId = keccak256(toHex("intent-abc"));
const pkgHash = keccak256(toHex("intent-abc/pkg"));
const runtimeHash = keccak256(toHex("intent-abc/runtime"));
const semHash = keccak256(toHex("intent-abc/sem"));

// ---- bridge from a FIXed Agent Package draft (plan/010 §16) to the on-chain guard/hashes ----
export interface CreateOpts {
  uid?: string;
  intentId?: string;
}

/** keccak of an arbitrary id string (the on-chain intentId is a hash of the slug). */
function intentIdHash(slug: string): Hex {
  return keccak256(toHex(slug));
}

/** Build a HardGuardState from a FIXed Executor draft's CONSTRAINTS (clamped to demo rails for safety
 *  on mainnet). Falls back to the demo guard when no draft is provided (dev / back-compat). */
function guardFromDraft(draft: AgentPackageDraft | null, bindingNonce: bigint): HardGuardState {
  if (!draft) return DEMO_GUARD(bindingNonce);
  const clampBig = (v: string, max: bigint) => {
    let n: bigint;
    try {
      n = BigInt(v);
    } catch {
      n = max;
    }
    return n < 1n ? 1n : n > max ? max : n;
  };
  const clampBps = (v: number) => Math.max(1, Math.min(300, Math.round(v || 300)));
  return {
    router: UNISWAP.swapRouter02,
    selector: "0x04e45aaf",
    tokenA: TOKENS.USDC,
    tokenB: TOKENS.WETH,
    poolFee: UNISWAP.usdcWethPoolFee,
    // Safety: never exceed the demo ceilings even if a draft asks for more (tiny-amounts policy).
    amountCapPerTx: clampBig(draft.constraints.amountCapPerTx, 2_000n),
    cumulativeCap: clampBig(draft.constraints.cumulativeCap, DEMO_CUM_CAP),
    slippageCapBps: clampBps(draft.constraints.slippageCapBps),
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    frozen: false,
    bindingNonce,
  };
}

/** Load the intent doc + its FIXed Executor/Watcher drafts for this caller, if intentId given. */
async function loadDrafts(opts?: CreateOpts): Promise<{
  slug: string;
  executor: AgentPackageDraft | null;
  watcher: AgentPackageDraft | null;
}> {
  if (!opts?.uid || !opts?.intentId) return { slug: "intent-abc", executor: null, watcher: null };
  const doc = await store().getIntent(opts.uid, opts.intentId);
  if (!doc) return { slug: opts.intentId, executor: null, watcher: null };
  return {
    slug: doc.intentId,
    executor: doc.packages.executor.fixed ? doc.packages.executor : null,
    watcher: doc.packages.watcher.fixed ? doc.packages.watcher : null,
  };
}

/** Persist mint results back onto the intent doc so the off-chain history links to the chain. */
async function linkIntent(
  opts: CreateOpts | undefined,
  patch: {
    executorTokenId?: string;
    watcherTokenId?: string;
    executorTxHash?: Hex;
    watcherTxHash?: Hex;
    status?: "draft" | "live" | "stopped";
  },
) {
  if (!opts?.uid || !opts?.intentId) return;
  const doc = await store().getIntent(opts.uid, opts.intentId);
  if (!doc) return;
  await store().putIntent(opts.uid, { ...doc, ...patch });
}

// Hard ceiling on planned AgentLoop ticks regardless of TTL/period. The on-chain cumulativeCap
// (0.1 USDC / 0.001 per trade = 100 trades) is the REAL stop; these bound the browser-driven loop so
// "tick until the cap" works while staying bounded (tiny-amounts policy). All env-overridable.
const MAX_PLANNED_TICKS = Number(process.env.INTENTOS_RUNTIME_MAX_TICKS ?? "120");
const RUNTIME_MAX_TRADES = Number(process.env.INTENTOS_RUNTIME_MAX_TRADES ?? "100");
const RUNTIME_MAX_WATCHER_ACTIONS = Number(process.env.INTENTOS_RUNTIME_MAX_WATCHER_ACTIONS ?? "100");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_VERTEX_COST_USD = Number(process.env.INTENTOS_RUNTIME_MAX_VERTEX_USD ?? "5.00");
const RUNTIME_FIRST_TICK_BUY = (process.env.INTENTOS_RUNTIME_FIRST_TICK_BUY ?? "1") === "1";

/**
 * Start the (bounded) runtime: consume the intent's StartConfig, mark it live, and record the schedule
 * (startedAt / autoStopAt / plannedTicks). It does NOT auto-move money — periodic execution is the
 * manual guarded-trade path (and a future Cloud Scheduler tick), so this stays within the no-infinite-
 * loop / tiny-amounts safety policy. Requires an Executor to exist for this session.
 */
export async function runtimeStart(opts?: CreateOpts) {
  if (!opts?.uid || !opts?.intentId) throw new Error("intentId required");
  const c = await ownerCtx(opts);
  const doc = await store().getIntent(opts.uid, opts.intentId);
  if (!doc) throw new Error("intent not found");
  const executorTokenId = doc.executorTokenId ?? session.executorTokenId;
  const watcherTokenId = doc.watcherTokenId ?? session.watcherTokenId;
  if (!executorTokenId) throw new Error("create the Executor Agent first");
  const existing = await store().getRuntime(opts.uid, opts.intentId);
  if (existing && ["scheduled", "running"].includes(existing.status)) {
    await store().putIntent(opts.uid, { ...doc, status: "live", runtime: runtimeState(existing), runtimeId: existing.runtimeId });
    return { intentId: doc.intentId, runtime: runtimeState(existing), runtimeRecord: existing };
  }
  const cfg = doc.startConfig;
  const startedAt = Date.now();
  const autoStopAt = startedAt + cfg.ttlMinutes * 60_000;
  const plannedTicks = Math.max(1, Math.min(MAX_PLANNED_TICKS, Math.floor((cfg.ttlMinutes * 60) / Math.max(1, cfg.loopPeriodSec))));
  const executor = doc.packages.executor.fixed ? doc.packages.executor : null;
  const watcher = doc.packages.watcher.fixed ? doc.packages.watcher : null;
  const runtimeId = `rt-${doc.intentId}-${executorTokenId}-${startedAt}`;
  const record: RuntimeRecord = {
    runtimeId,
    ownerUid: opts.uid,
    intentId: doc.intentId,
    executorTokenId,
    watcherTokenId,
    delegate: c.delegate,
    role: "EXECUTOR",
    packageHash: executor?.packageHash ?? pkgHash,
    watcherPackageHash: watcher?.packageHash ?? null,
    executorSemanticSnapshot: executor?.semantic ?? null,
    watcherSemanticSnapshot: watcher?.semantic ?? null,
    runtimeOwner: c.delegate,
    bindingNonce: "1",
    cloudRunService: "manual-control-panel",
    status: "scheduled",
    leaseOwner: null,
    leaseExpiresAt: null,
    startedAt,
    lastHeartbeatAt: null,
    autoStopAt,
    loopPeriodSec: cfg.loopPeriodSec,
    plannedTicks,
    executedTicks: 0,
    runtimeTradesUsed: 0,
    maxRuntimeTrades: RUNTIME_MAX_TRADES,
    watcherActionsUsed: 0,
    maxWatcherActions: RUNTIME_MAX_WATCHER_ACTIONS,
    llmCallsUsed: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedVertexCostUsd: 0,
    maxVertexCostUsd: MAX_VERTEX_COST_USD,
    failureReason: null,
    lastTickAction: null,
    lastOpenClawResponse: null,
    lastTickTxHash: null,
    lastWatcherAction: null,
    lastWatcherResponse: null,
    lastWatcherReason: null,
    lastWatcherTxHash: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  await store().putRuntime(opts.uid, record);
  await store().putIntent(opts.uid, { ...doc, status: "live", runtime: runtimeState(record), runtimeId });
  logAction({ at: Date.now(), action: `runtime scheduled (loop ${cfg.loopPeriodSec}s, autostop ${cfg.ttlMinutes}m, <=${plannedTicks} ticks)`, ok: true });
  return { intentId: doc.intentId, runtime: runtimeState(record), runtimeRecord: record };
}

function runtimeState(r: RuntimeRecord) {
  return {
    startedAt: r.startedAt,
    autoStopAt: r.autoStopAt,
    loopPeriodSec: r.loopPeriodSec,
    plannedTicks: r.plannedTicks,
  };
}

export async function runtimeStatus(opts?: CreateOpts) {
  if (!opts?.uid || !opts.intentId) throw new Error("intentId required");
  const record = await store().getRuntime(opts.uid, opts.intentId);
  if (!record) return { intentId: opts.intentId, runtimeRecord: null };
  const now = Date.now();
  if (record.status === "scheduled" || record.status === "running") {
    if (record.autoStopAt <= now) {
      const expired: RuntimeRecord = { ...record, status: "expired", updatedAt: now };
      await store().putRuntime(opts.uid, expired);
      return { intentId: opts.intentId, runtimeRecord: expired };
    }
  }
  return { intentId: opts.intentId, runtimeRecord: record };
}

export async function runtimeStop(opts?: CreateOpts, reason = "owner requested stop") {
  if (!opts?.uid || !opts.intentId) throw new Error("intentId required");
  const record = await store().getRuntime(opts.uid, opts.intentId);
  if (!record) return { intentId: opts.intentId, runtimeRecord: null };
  const now = Date.now();
  const stopped: RuntimeRecord = {
    ...record,
    status: "stopped",
    leaseOwner: null,
    leaseExpiresAt: null,
    failureReason: reason,
    updatedAt: now,
  };
  await store().putRuntime(opts.uid, stopped);
  const doc = await store().getIntent(opts.uid, opts.intentId);
  if (doc) await store().putIntent(opts.uid, { ...doc, runtime: runtimeState(stopped), runtimeId: stopped.runtimeId });
  logAction({ at: now, action: `runtime stopped (${reason})`, ok: true });
  return { intentId: opts.intentId, runtimeRecord: stopped };
}

export async function ownerGuardPlan(opts?: CreateOpts) {
  if (!opts?.uid || !opts.intentId) throw new Error("intentId required");
  const c = await ownerCtx(opts);
  const { executor } = await loadDrafts(opts);
  if (!executor) throw new Error("FIX the Executor package first");
  const current = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  return { intentId: opts.intentId, guard: guardFromDraft(executor, current.bindingNonce) };
}

export async function runtimeRun(opts?: CreateOpts) {
  if (!opts?.uid || !opts.intentId) throw new Error("intentId required");
  let record = await store().getRuntime(opts.uid, opts.intentId);
  if (!record) throw new Error("runtime not started");
  const now = Date.now();
  if (!["scheduled", "running"].includes(record.status)) {
    return { intentId: opts.intentId, runtimeRecord: record, ticks: [] };
  }
  if (record.status === "running" && record.leaseExpiresAt && record.leaseExpiresAt > now) {
    return { intentId: opts.intentId, runtimeRecord: record, ticks: [], alreadyRunning: true };
  }
  const leaseOwner = `run-${randomUUID()}`;
  record = {
    ...record,
    status: "running",
    leaseOwner,
    leaseExpiresAt: Math.min(record.autoStopAt + 30_000, now + 11 * 60_000),
    updatedAt: now,
    lastHeartbeatAt: now,
  };
  await store().putRuntime(opts.uid, record);

  const ticks: unknown[] = [];
  while (Date.now() < record.autoStopAt && record.executedTicks < record.plannedTicks) {
    const latest = await store().getRuntime(opts.uid, opts.intentId);
    if (!latest || latest.status === "stopped" || latest.status === "stopping" || latest.status === "unbound") {
      record = latest ?? record;
      break;
    }
    if (latest.leaseOwner !== leaseOwner) {
      record = latest;
      break;
    }
    try {
      const out = await runtimeTick(opts);
      ticks.push(out.tick);
      record = out.runtimeRecord;
    } catch (e) {
      const failed: RuntimeRecord = {
        ...latest,
        status: "stopped",
        leaseOwner: null,
        leaseExpiresAt: null,
        failureReason: e instanceof Error ? e.message : String(e),
        updatedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
      };
      await store().putRuntime(opts.uid, failed);
      const doc = await store().getIntent(opts.uid, opts.intentId);
      if (doc) await store().putIntent(opts.uid, { ...doc, runtime: runtimeState(failed), runtimeId: failed.runtimeId });
      logAction({ at: Date.now(), action: "runtime stopped (tick error)", ok: false, detail: failed.failureReason ?? undefined });
      return { intentId: opts.intentId, runtimeRecord: failed, ticks };
    }
    if (!["scheduled", "running"].includes(record.status)) break;
    const remaining = record.autoStopAt - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(record.loopPeriodSec * 1000, remaining));
  }

  const finalRecord = await store().getRuntime(opts.uid, opts.intentId) ?? record;
  if (["scheduled", "running"].includes(finalRecord.status)) {
    const expired: RuntimeRecord = { ...finalRecord, status: "expired", leaseOwner: null, leaseExpiresAt: null, updatedAt: Date.now() };
    await store().putRuntime(opts.uid, expired);
    const doc = await store().getIntent(opts.uid, opts.intentId);
    if (doc) await store().putIntent(opts.uid, { ...doc, runtime: runtimeState(expired), runtimeId: expired.runtimeId });
    return { intentId: opts.intentId, runtimeRecord: expired, ticks };
  }
  return { intentId: opts.intentId, runtimeRecord: finalRecord, ticks };
}

export async function runtimeTick(opts?: CreateOpts) {
  if (!opts?.uid || !opts.intentId) throw new Error("intentId required");
  const record = await store().getRuntime(opts.uid, opts.intentId);
  if (!record) throw new Error("runtime not started");
  const now = Date.now();
  if (!["scheduled", "running"].includes(record.status)) {
    return { intentId: opts.intentId, runtimeRecord: record, tick: null };
  }
  if (record.estimatedVertexCostUsd >= record.maxVertexCostUsd) {
    const stopped = selfStopRuntime(record, "vertex budget exhausted before tick");
    await store().putRuntime(opts.uid, stopped);
    logRuntimeSelfStop(stopped, "vertex_budget_exhausted");
    return { intentId: opts.intentId, runtimeRecord: stopped, tick: null };
  }
  if (record.autoStopAt <= now || record.executedTicks >= record.plannedTicks) {
    const expired: RuntimeRecord = { ...record, status: "expired", leaseOwner: null, leaseExpiresAt: null, updatedAt: now };
    await store().putRuntime(opts.uid, expired);
    return { intentId: opts.intentId, runtimeRecord: expired, tick: null };
  }
  const tick = record.executedTicks + 1;
  const tradesUsed = record.runtimeTradesUsed ?? 0;
  const maxRuntimeTrades = record.maxRuntimeTrades ?? 1;
  const [executorSnapshot, watcherSnapshot] = await Promise.all([
    store().getPackageSnapshot(record.packageHash),
    record.watcherPackageHash ? store().getPackageSnapshot(record.watcherPackageHash) : Promise.resolve(null),
  ]);
  const prompt = [
    "You are an IntentOS bounded runtime agent.",
    "Reply with exactly one action word: BUY or HOLD.",
    "BUY means request one guarded 0.001 USDC -> WETH trade through IntentOS typed tools.",
    "HOLD means do nothing this tick.",
    `runtimeTradesUsed=${tradesUsed}`,
    `maxRuntimeTrades=${maxRuntimeTrades}`,
    packagePromptSection("Executor package snapshot", executorSnapshot),
    tradesUsed >= maxRuntimeTrades ? "Trade budget already used. Reply HOLD." : "This is a recurring DCA strategy: reply BUY to make one more small scheduled buy while trade budget and guardrails allow; the contract enforces the real caps.",
    `intentId=${record.intentId}`,
    `tick=${tick}`,
  ].join("\n");
  const completion = await openClawComplete(prompt);
  const decision = normalizeRuntimeAction(completion.text);
  const openClawResponse = summarizeOpenClawResponse(completion.text);
  const nextExecuted = record.executedTicks + 1;
  let llmCallsUsed = record.llmCallsUsed + 1;
  let estimatedInputTokens = record.estimatedInputTokens + completion.estimatedInputTokens;
  let estimatedOutputTokens = record.estimatedOutputTokens + completion.estimatedOutputTokens;
  let estimatedVertexCostUsd = Number((record.estimatedVertexCostUsd + completion.estimatedCostUsd).toFixed(8));
  let overBudget = estimatedVertexCostUsd >= record.maxVertexCostUsd;
  let txHash: Hex | null = null;
  let failureReason = overBudget ? "vertex budget exhausted" : record.failureReason;
  let runtimeTradesUsed = tradesUsed;
  let tickStatus = "held";
  let watcherActionsUsed = record.watcherActionsUsed ?? 0;
  const maxWatcherActions = record.maxWatcherActions ?? 1;
  let lastWatcherAction = record.lastWatcherAction;
  let lastWatcherResponse = record.lastWatcherResponse;
  let lastWatcherReason = record.lastWatcherReason;
  let lastWatcherTxHash = record.lastWatcherTxHash;
  const shouldBuy = decision === "BUY" || (RUNTIME_FIRST_TICK_BUY && tick === 1 && tradesUsed < maxRuntimeTrades);
  let tradeBlockedPermanently = false;
  if (!overBudget && shouldBuy && tradesUsed < maxRuntimeTrades) {
    const tradeResult = await trade(opts);
    if (tradeResult.ok === false) {
      failureReason = tradeResult.reason ?? "runtime trade rejected";
      txHash = (tradeResult.txHash as Hex | undefined) ?? null;
      tickStatus = "rejected";
      // A guard-permanent rejection (Watcher tightened the cap below the trade size, the cumulative cap
      // is reached, expiry passed, or a freeze) will never recover by retrying — self-stop the loop.
      // Slippage reverts are transient and keep looping.
      if (isPermanentGuardStop(tradeResult.reason)) {
        tradeBlockedPermanently = true;
        if (/amounttoolarge/i.test(tradeResult.reason ?? "")) {
          failureReason = "Watcher tightened the per-tx cap below the trade size — execution self-stopped (semantic circuit breaker).";
        }
      }
    } else {
      txHash = tradeResult.txHash as Hex;
      runtimeTradesUsed += 1;
      tickStatus = "submitted";
    }
  }
  if (!overBudget && txHash && record.watcherTokenId && watcherActionsUsed < maxWatcherActions) {
    const watcherPrompt = [
      "You are an IntentOS Watcher Agent.",
      "A bounded Executor just submitted one guarded USDC->WETH trade.",
      "Judge semantic safety. Reply with exactly one action: REPORT_OK, REPORT_SUSPICIOUS, or VOTE_TIGHTEN.",
      "Never loosen. Do not reply VOTE_FREEZE in this MVP autonomous path.",
      "Default to REPORT_OK when the trade looks on-intent (small, within caps, on the DCA pair).",
      "Choose VOTE_TIGHTEN only to gently narrow future capability when you see drift or want a more conservative posture; tightening is applied softly and never starves the strategy.",
      `intentId=${record.intentId}`,
      `executorTokenId=${record.executorTokenId}`,
      `watcherTokenId=${record.watcherTokenId}`,
      `txHash=${txHash}`,
      packagePromptSection("Watcher package snapshot", watcherSnapshot),
      packagePromptSection("Watched Executor package snapshot", executorSnapshot),
    ].join("\n");
    const watcherCompletion = await openClawComplete(watcherPrompt);
    lastWatcherResponse = summarizeOpenClawResponse(watcherCompletion.text);
    llmCallsUsed += 1;
    estimatedInputTokens += watcherCompletion.estimatedInputTokens;
    estimatedOutputTokens += watcherCompletion.estimatedOutputTokens;
    estimatedVertexCostUsd = Number((estimatedVertexCostUsd + watcherCompletion.estimatedCostUsd).toFixed(8));
    overBudget = estimatedVertexCostUsd >= record.maxVertexCostUsd;
    const watcherDecision = normalizeWatcherAction(watcherCompletion.text);
    lastWatcherAction = watcherDecision;
    lastWatcherReason =
      watcherDecision === "VOTE_TIGHTEN"
        ? "Watcher saw a successful BUY and narrowed future per-tx capability conservatively."
        : watcherDecision === "REPORT_SUSPICIOUS"
          ? "Watcher marked the post-trade execution suspicious and requested tighter guardrails."
          : "Watcher judged the post-trade execution within semantic guardrails.";
    if (!overBudget && (watcherDecision === "VOTE_TIGHTEN" || watcherDecision === "REPORT_SUSPICIOUS")) {
      try {
        const vote = await watcherTighten(opts);
        if ("txHash" in vote && vote.txHash) {
          lastWatcherAction = "VOTE_TIGHTEN";
          lastWatcherReason = "Watcher gently narrowed future per-tx capability after observing the Executor's BUY evidence.";
          lastWatcherTxHash = vote.txHash as Hex;
          watcherActionsUsed += 1;
        } else {
          // Soft tighten reached its floor (one trade size): nothing left to narrow, so the Watcher
          // holds and keeps monitoring instead of spamming a redundant on-chain vote.
          lastWatcherAction = "REPORT_OK";
          lastWatcherReason = "Watcher reviewed the BUY and held — per-tx capability already at its conservative floor.";
        }
      } catch (e) {
        lastWatcherAction = "VOTE_TIGHTEN_FAILED";
        failureReason = e instanceof Error ? e.message : String(e);
      }
    }
  }
  const status = overBudget || tradeBlockedPermanently ? "self-stopped" : nextExecuted >= record.plannedTicks ? "expired" : "running";
  const updated: RuntimeRecord = {
    ...record,
    status,
    leaseOwner: status === "running" ? record.leaseOwner : null,
    leaseExpiresAt: status === "running" ? record.leaseExpiresAt : null,
    executedTicks: nextExecuted,
    runtimeTradesUsed,
    maxRuntimeTrades,
    watcherActionsUsed,
    maxWatcherActions,
    llmCallsUsed,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedVertexCostUsd,
    failureReason,
    lastTickAction: decision,
    lastOpenClawResponse: openClawResponse,
    lastTickTxHash: txHash,
    lastWatcherAction,
    lastWatcherResponse,
    lastWatcherReason,
    lastWatcherTxHash,
    lastHeartbeatAt: now,
    updatedAt: now,
  };
  await store().putRuntime(opts.uid, updated);
  if (overBudget) logRuntimeSelfStop(updated, "vertex_budget_exhausted");
  logAction({ at: now, action: `OpenClaw tick ${tick}: ${decision.slice(0, 40)}`, ok: true });
  return {
    intentId: opts.intentId,
    runtimeRecord: updated,
    tick: { tick, status: tickStatus, action: decision, txHash, reason: failureReason },
  };
}

function normalizeRuntimeAction(text: string): "BUY" | "HOLD" {
  const t = text.trim().toUpperCase();
  if (/\bBUY\b/.test(t)) return "BUY";
  return "HOLD";
}

function normalizeWatcherAction(text: string): "REPORT_OK" | "REPORT_SUSPICIOUS" | "VOTE_TIGHTEN" {
  const t = text.trim().toUpperCase();
  if (/\bVOTE_TIGHTEN\b/.test(t)) return "VOTE_TIGHTEN";
  if (/\bREPORT_SUSPICIOUS\b/.test(t)) return "REPORT_SUSPICIOUS";
  return "REPORT_OK";
}

// A trade rejection that won't recover by retrying: the Watcher tightened the per-tx cap below the
// trade size (AmountTooLarge), the cumulative cap is reached, the guard expired, the binding rotated,
// or it's frozen. These should self-stop the browser-driven loop. Slippage reverts are NOT permanent.
function isPermanentGuardStop(reason?: string): boolean {
  if (!reason) return false;
  return /amounttoolarge|cumulativecapexceeded|expired|frozen|badbindingnonce/i.test(reason);
}

function selfStopRuntime(record: RuntimeRecord, reason: string): RuntimeRecord {
  return { ...record, status: "self-stopped", leaseOwner: null, leaseExpiresAt: null, failureReason: reason, updatedAt: Date.now() };
}

function summarizeOpenClawResponse(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function packagePromptSection(title: string, snapshot: PackageSnapshot | null): string {
  if (!snapshot) return `${title}: unavailable`;
  return [
    `${title}:`,
    `role=${snapshot.role}`,
    `packageHash=${snapshot.packageHash}`,
    `summary=${snapshot.summary}`,
    `semantic=${snapshot.semantic.join(" | ")}`,
    `constraints=${JSON.stringify(snapshot.constraints)}`,
    `agents=${snapshot.agents.slice(0, 1200)}`,
    `soul=${snapshot.soul.slice(0, 600)}`,
  ].join("\n");
}

function logRuntimeSelfStop(record: RuntimeRecord, reason: string) {
  console.log(JSON.stringify({
    severity: "NOTICE",
    event: "runtime_self_stop",
    reason,
    runtimeId: record.runtimeId,
    ownerUid: record.ownerUid,
    intentId: record.intentId,
    executorTokenId: record.executorTokenId,
    executedTicks: record.executedTicks,
    llmCallsUsed: record.llmCallsUsed,
    estimatedVertexCostUsd: record.estimatedVertexCostUsd,
    maxVertexCostUsd: record.maxVertexCostUsd,
  }));
}

/**
 * PRODUCT-mode "Activate" (plan/080 §4): return the UNSIGNED initialize() params the browser needs to
 * delegate its OWN EOA to ExecutionDelegate7702 and initialize the guard in one EIP-7702 self-tx. The
 * server signs nothing here — it only supplies the default conservative guard, the platform relayer, and
 * the SessionKeys so the user's account trusts the same execution authority the demo uses. bigints are
 * JSON-serialized to strings; the browser converts them back when encoding calldata.
 */
export async function activatePlan(delegateAddr?: Address) {
  const c = await ctx(delegateAddr);
  const code = delegateAddr ? await c.pub.getCode({ address: delegateAddr }) : undefined;
  const isDelegated = !!code && code.toLowerCase().startsWith("0xef0100");
  // 7702 code is `0xef0100‖<impl>` — extract the impl to tell OUR delegate from e.g. a MetaMask SA.
  const currentImpl = isDelegated ? (("0x" + code!.slice(8, 48)) as Address) : null;
  const alreadyOurs = !!currentImpl && currentImpl.toLowerCase() === c.delegateImpl.toLowerCase();
  return {
    delegateImpl: c.delegateImpl,
    alreadyDelegated: alreadyOurs,
    delegatedElsewhere: isDelegated && !alreadyOurs,
    currentImpl,
    initialize: {
      guard: DEMO_GUARD(1n),
      sessionKey: c.sessionKey,
      watcherKey: c.watcherKey,
      relayer: c.platform.address,
      gasPerTxCap: parseEther("0.0002"),
      // Connected mode: keep the initial vault SMALL so a fresh per-user EOA only needs a tiny ETH
      // balance to activate (initialize requires exec+watcher <= address(this).balance). Each lane
      // still covers several Base-gas reimbursements; the user can top up later from their wallet.
      initialExecVault: parseEther("0.0004"),
      initialWatcherVault: parseEther("0.0002"),
      packageHash: pkgHash,
      semanticGuardHash: semHash,
    },
  };
}

// ---- state ----
export async function getState(delegateAddr?: Address, activeIntentSlug?: string) {
  const c = await ctx(delegateAddr);
  const code = await c.pub.getCode({ address: c.delegate });
  const delegated = !!code && code.toLowerCase().startsWith("0xef0100");

  let guard: HardGuardState | null = null;
  let cumulativeSpent = 0n;
  let execVault = 0n;
  let watcherVault = 0n;
  if (delegated) {
    guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
    cumulativeSpent = (await c.pub.readContract({ address: c.delegate, abi, functionName: "cumulativeSpent" })) as bigint;
    const gv = (await c.pub.readContract({ address: c.delegate, abi, functionName: "gasVaults" })) as readonly bigint[];
    execVault = gv[0];
    watcherVault = gv[1];
  }
  const usdc = (await c.pub.readContract({ address: TOKENS.USDC, abi: erc20, functionName: "balanceOf", args: [c.delegate] })) as bigint;
  const weth = (await c.pub.readContract({ address: TOKENS.WETH, abi: erc20, functionName: "balanceOf", args: [c.delegate] })) as bigint;

  const latest = await c.pub.getBlockNumber();
  const fromBlock = latest > 9_000n ? latest - 9_000n : 0n;
  const logs = await c.pub.getLogs({ address: c.delegate, fromBlock, toBlock: "latest" });
  const timeline: { kind: string; title: string; reason: string; txHash: Hex; blockNumber: string }[] = [];
  const activeIntentHash = activeIntentSlug ? intentIdHash(activeIntentSlug) : null;
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: Record<string, unknown> };
      if (ev.eventName === "EvidenceCommitted") {
        if (activeIntentHash && String(ev.args.intentId).toLowerCase() !== activeIntentHash.toLowerCase()) continue;
        timeline.push({ kind: "evidence", title: "EvidenceCommitted", reason: String(ev.args.reason ?? ""), txHash: log.transactionHash as Hex, blockNumber: String(log.blockNumber) });
      } else if (!activeIntentHash && ev.eventName === "GuardTightened")
        timeline.push({ kind: "tighten", title: "Watcher · VOTE_TIGHTEN", reason: "Watcher narrowed future per-tx capability after recent execution evidence", txHash: log.transactionHash as Hex, blockNumber: String(log.blockNumber) });
      else if (!activeIntentHash && ev.eventName === "GuardFrozen")
        timeline.push({ kind: "freeze", title: "Watcher · VOTE_FREEZE", reason: "Execution frozen; only the Owner can resume/unfreeze", txHash: log.transactionHash as Hex, blockNumber: String(log.blockNumber) });
    } catch {
      /* not ours */
    }
  }
  timeline.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));

  const ser = (g: HardGuardState | null) =>
    g && {
      router: g.router,
      selector: g.selector,
      tokenA: g.tokenA,
      tokenB: g.tokenB,
      poolFee: g.poolFee,
      amountCapPerTx: g.amountCapPerTx.toString(),
      cumulativeCap: g.cumulativeCap.toString(),
      slippageCapBps: g.slippageCapBps,
      expiry: g.expiry.toString(),
      frozen: g.frozen,
      bindingNonce: g.bindingNonce.toString(),
    };

  return {
    chainId: 8453,
    delegate: c.delegate,
    agentNft: c.agentNft,
    sessionKey: c.sessionKey,
    watcherKey: c.watcherKey,
    delegated,
    guard: ser(guard),
    cumulativeSpent: cumulativeSpent.toString(),
    execVault: execVault.toString(),
    watcherVault: watcherVault.toString(),
    usdc: usdc.toString(),
    weth: weth.toString(),
    timeline,
    session: { executorTokenId: session.executorTokenId, watcherTokenId: session.watcherTokenId },
    actions: session.log,
  };
}

async function ensureSetup(c: Ctx, execDraft?: AgentPackageDraft | null, pkgHashOverride?: Hex) {
  const code = await c.pub.getCode({ address: c.delegate });
  const delegated = !!code && code.toLowerCase().startsWith("0xef0100");
  if (c.connected) {
    // PRODUCT mode: the user's browser already delegated + initialized their OWN EOA (the "Activate"
    // step). The server never signs owner-authority calls, so just require the account to be active.
    if (!delegated) throw new Error("activate your account first (sign the EIP-7702 delegation in your wallet)");
    return;
  }
  const desiredGuard = guardFromDraft(execDraft ?? null, 1n);
  if (!delegated) {
    const tx = await delegateAndInitialize(c.wallet, c.pub, c.owner, c.delegateImpl, {
      guard: desiredGuard,
      sessionKey: c.sessionKey,
      watcherKey: c.watcherKey,
      relayer: c.platform.address,
      gasPerTxCap: parseEther("0.0002"),
      initialExecVault: parseEther("0.002"),
      initialWatcherVault: parseEther("0.001"),
      packageHash: pkgHashOverride ?? pkgHash,
      semanticGuardHash: semHash,
    });
    logAction({ at: Date.now(), action: "delegate+initialize (EIP-7702)", txHash: tx, ok: true });
    return;
  }
  // Already delegated (shared demo Owner): apply this caller's FIXed guard (or reset to demo-ready).
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  const target = guardFromDraft(execDraft ?? null, guard.bindingNonce);
  if (guard.frozen || guard.cumulativeCap < target.cumulativeCap || guard.amountCapPerTx !== target.amountCapPerTx) {
    const tx = await ownerUpdateGuard(c.wallet, c.pub, c.owner, target);
    logAction({ at: Date.now(), action: "owner set guard from FIXed package", txHash: tx, ok: true });
  }
}

export async function createExecutor(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  const existingDoc = opts?.uid && opts.intentId ? await store().getIntent(opts.uid, opts.intentId) : null;
  if (existingDoc?.executorTokenId) {
    return { tokenId: existingDoc.executorTokenId, txHash: existingDoc.executorTxHash ?? undefined };
  }
  const { slug, executor } = await loadDrafts(opts);
  // Production correctness: the on-chain guard + hashes come from the user's FIXed Executor package,
  // not a hardcoded "intent-abc". Falls back to demo values only when no FIXed draft is available.
  const pkgHashReal = executor?.packageHash ?? pkgHash;
  await ensureSetup(c, executor, pkgHashReal);
  const r = await mintExecutorNft(c.wallet, c.pub, c.platform, c.agentNft, c.delegate, {
    agentManifestHash: pkgHashReal,
    runtimeManifestHash: runtimeHash,
    intentId: intentIdHash(slug),
    executionContract: c.delegate,
    hardGuardrailsHash: keccak256(toHex(`${slug}/hardguard`)),
  });
  session.executorTokenId = r.tokenId.toString();
  await linkIntent(opts, { executorTokenId: r.tokenId.toString(), executorTxHash: r.txHash, status: "live" });
  logAction({ at: Date.now(), action: `mint Executor Agent NFT #${r.tokenId}`, txHash: r.txHash, ok: true });
  return { tokenId: r.tokenId.toString(), txHash: r.txHash };
}

const WATCHER_VAULT_MIN = parseEther("0.0003");

/** Ensure the watcher gas-vault lane has funds (votes reimburse the relayer from it). Owner self-call. */
async function ensureWatcherVault(c: Ctx) {
  // Connected mode: the watcher lane was seeded at Activate; the user tops up from their own wallet.
  if (c.connected) return;
  const gv = (await c.pub.readContract({ address: c.delegate, abi, functionName: "gasVaults" })) as readonly bigint[];
  if (gv[1] >= WATCHER_VAULT_MIN) return;
  const tx = await fundGasVault(c.wallet, c.pub, c.owner, true, parseEther("0.0008"));
  logAction({ at: Date.now(), action: "fund Watcher gas vault lane", txHash: tx, ok: true });
}

export async function createWatcher(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  const existingDoc = opts?.uid && opts.intentId ? await store().getIntent(opts.uid, opts.intentId) : null;
  if (existingDoc?.watcherTokenId) {
    return { tokenId: existingDoc.watcherTokenId, txHash: existingDoc.watcherTxHash ?? undefined };
  }
  const doc = opts?.uid && opts.intentId ? await store().getIntent(opts.uid, opts.intentId) : null;
  const watchedExecutorTokenId = doc?.executorTokenId ?? session.executorTokenId;
  if (!watchedExecutorTokenId) throw new Error("create the Executor Agent first");
  const { slug, executor, watcher } = await loadDrafts(opts);
  const execPkgHash = executor?.packageHash ?? pkgHash;
  const watcherPkgHash = watcher?.packageHash ?? keccak256(toHex(`${slug}/watcher/pkg`));
  const r = await mintWatcherNft(c.wallet, c.pub, c.platform, c.agentNft, c.delegate, {
    agentManifestHash: watcherPkgHash,
    runtimeManifestHash: keccak256(toHex(`${slug}/watcher/runtime`)),
    watchedExecutorTokenId: BigInt(watchedExecutorTokenId),
    watchedIntentId: intentIdHash(slug),
    executorPackageHash: execPkgHash,
    hardGuardrailsHash: keccak256(toHex(`${slug}/hardguard`)),
    semanticGuardrailsHash: keccak256(toHex(`${slug}/sem`)),
    watcherPackageHash: watcherPkgHash,
  });
  session.watcherTokenId = r.tokenId.toString();
  await linkIntent(opts, { watcherTokenId: r.tokenId.toString(), watcherTxHash: r.txHash });
  logAction({ at: Date.now(), action: `mint Watcher Agent NFT #${r.tokenId} (quorum 1)`, txHash: r.txHash, ok: true });
  await ensureWatcherVault(c);
  return { tokenId: r.tokenId.toString(), txHash: r.txHash };
}

export async function trade(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  const { slug, executor } = await loadDrafts(opts);
  const doc = opts?.uid && opts.intentId ? await store().getIntent(opts.uid, opts.intentId) : null;
  const executorTokenId = doc?.executorTokenId ?? session.executorTokenId ?? "1";
  // Use the caller's FIXed Executor guard (not a demo fallback) when available, and bind the request
  // to this intent's id so the on-chain evidence references the real intent (not a hardcoded one).
  await ensureSetup(c, executor, executor?.packageHash);

  // A tiny 0.001 USDC->WETH swap is slippage-fragile: the QuoterV2 quote can drift before the tx mines
  // (same-block price movement), so a 2.5% bound reverts intermittently. Re-quote fresh each attempt and
  // use the guard's MAX allowed slippage; retry once on a revert. On final failure, return an honest
  // {ok:false} with the reverted tx hash (do NOT report false success).
  let lastTx: Hex | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
    if (guard.frozen) return { ok: false, reason: "guard is frozen — resume first" };
    const quoted = await quoteExactInputSingle(c.pub, TOKENS.USDC, TOKENS.WETH, AMOUNT_IN);
    const reason = `BUY 0.001 USDC->WETH (Executor #${executorTokenId})`.slice(0, 200);
    const req = buildExecutionRequest({
      intentId: intentIdHash(slug),
      executorTokenId: BigInt(executorTokenId),
      action: Action.BUY,
      tokenIn: TOKENS.USDC,
      tokenOut: TOKENS.WETH,
      recipient: c.delegate,
      amountIn: AMOUNT_IN,
      quotedAmountOut: quoted,
      slippageBps: guard.slippageCapBps, // use the full allowed band for the tiny swap
      nonce: BigInt(Date.now()) + BigInt(attempt),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      bindingNonce: guard.bindingNonce,
      reason,
    });
    const pre = await previewGuard(c.pub, c.delegate, req);
    if (!pre.ok) {
      logAction({ at: Date.now(), action: "trade rejected by Hard Guardrails", ok: false, detail: pre.reason });
      return { ok: false, reason: pre.reason };
    }
    const sig = await signExecutionRequest(c.delegate, req);
    try {
      const txHash = await relaySubmitExecution(c.wallet, c.pub, c.delegate, req, reason, sig, c.platform);
      logAction({ at: Date.now(), action: "guarded trade executed (USDC->WETH)", txHash, ok: true });
      return { ok: true, txHash };
    } catch (e) {
      if (e instanceof TxRevertedError) {
        lastTx = e.txHash;
        if (attempt === 0) continue; // re-quote and retry once
        logAction({ at: Date.now(), action: "guarded trade reverted (likely slippage)", txHash: e.txHash, ok: false });
        return { ok: false, reason: "trade reverted on-chain (likely slippage on the tiny swap) — try again", txHash: e.txHash };
      }
      throw e;
    }
  }
  return { ok: false, reason: "trade failed", txHash: lastTx };
}

export async function watcherFreeze(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  await ensureWatcherVault(c);
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  const txHash = await voteFreeze(c.wallet, c.pub, c.delegate, guard.bindingNonce, c.platform);
  logAction({ at: Date.now(), action: "Watcher VOTE_FREEZE (quorum 1)", txHash, ok: true });
  return { txHash };
}

export async function watcherTighten(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  await ensureWatcherVault(c);
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  // Soft tighten: narrow the per-tx cap GENTLY (default -15%) each vote. It is allowed to go BELOW one
  // trade size (no floor) so that after ~5 votes the cap drops under 0.001 USDC and the next trade is
  // rejected (AmountTooLarge) — that's the visible Watcher circuit breaker that self-stops the loop.
  // The contract still enforces monotonic narrowing; the on-chain cumulativeCap is the other stop.
  const reduced = (guard.amountCapPerTx * (10_000n - WATCHER_TIGHTEN_BPS)) / 10_000n;
  const target = reduced < 1n ? 1n : reduced; // never 0 (the contract minimum is 1 base unit)
  if (target >= guard.amountCapPerTx) {
    logAction({ at: Date.now(), action: `Watcher held cap (already at minimum ${guard.amountCapPerTx})`, ok: true });
    return { ok: false as const, reason: "amountCapPerTx already at the contract minimum", newAmountCap: guard.amountCapPerTx.toString() };
  }
  const patch: GuardPatch = {
    amountCapPerTx: target,
    cumulativeCap: guard.cumulativeCap,
    slippageCapBps: guard.slippageCapBps,
    expiry: guard.expiry,
  };
  const txHash = await voteTighten(c.wallet, c.pub, c.delegate, patch, c.platform);
  logAction({ at: Date.now(), action: `Watcher VOTE_TIGHTEN (cap ${guard.amountCapPerTx} -> ${patch.amountCapPerTx})`, txHash, ok: true });
  return { txHash, newAmountCap: patch.amountCapPerTx.toString() };
}

export async function ownerResume(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  if (c.connected) throw new Error("connected mode: resume (ownerUpdateGuard) is signed in your wallet");
  const { executor } = await loadDrafts(opts);
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  // Resume restores the caller's FIXed guard (unfrozen) when available, else the demo guard.
  const target = guardFromDraft(executor, guard.bindingNonce);
  const txHash = await ownerUpdateGuard(c.wallet, c.pub, c.owner, target);
  logAction({ at: Date.now(), action: "Owner resume (unfreeze + restore caps)", txHash, ok: true });
  return { txHash };
}

/** Fund a gas-vault lane explicitly (Gas Funding step). lane: "executor" | "watcher". */
export async function fundGas(lane: "executor" | "watcher", opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  if (c.connected) throw new Error("connected mode: fund your gas vault from your wallet");
  const isWatcher = lane === "watcher";
  const amount = isWatcher ? parseEther("0.0008") : parseEther("0.001");
  const tx = await fundGasVault(c.wallet, c.pub, c.owner, isWatcher, amount);
  logAction({ at: Date.now(), action: `fund ${lane} gas vault lane`, txHash: tx, ok: true });
  return { txHash: tx, lane };
}

export async function reset(opts?: CreateOpts) {
  const c = await ownerCtx(opts);
  // Mark the off-chain intent stopped + unlink agents (so history is honest), then clear the session.
  if (opts?.uid && opts?.intentId) {
    await linkIntent(opts, { status: "stopped" });
  }
  session.executorTokenId = null;
  session.watcherTokenId = null;
  if (c.connected) {
    // Connected mode: guard reset/unfreeze is an owner action signed in the user's wallet.
    logAction({ at: Date.now(), action: "reset (off-chain; resume guard from your wallet)", ok: true });
    return { ok: true };
  }
  const r = await ownerResume(opts);
  logAction({ at: Date.now(), action: "demo reset", txHash: r.txHash, ok: true });
  return r;
}
