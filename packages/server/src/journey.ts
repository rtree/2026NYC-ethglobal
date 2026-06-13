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
  voteFreeze,
  voteTighten,
} from "@intentos/runtime";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;
const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const AMOUNT_IN = 1_000n; // 0.001 USDC per trade
const DEMO_CUM_CAP = 100_000n; // 0.1 USDC cumulative — enough for a long demo session

interface Deployments {
  contracts: { executionDelegate7702Impl: Address; agentNFT: Address };
}

function deployments(): Deployments {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/journey.js -> ../../../deployments ; src in dev -> ../../../deployments
  const path = resolve(here, "../../../deployments/base-mainnet.json");
  return JSON.parse(readFileSync(path, "utf8")) as Deployments;
}

// ---- cached singletons ----
let _ctx: Awaited<ReturnType<typeof buildCtx>> | null = null;

async function buildCtx() {
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
  return {
    pub,
    wallet,
    owner: owner as Account,
    platform: platform as Account,
    sessionKey,
    watcherKey,
    delegate: owner.address as Address,
    delegateImpl: d.contracts.executionDelegate7702Impl,
    agentNft: d.contracts.agentNFT,
  };
}

export async function ctx() {
  if (!_ctx) _ctx = await buildCtx();
  return _ctx;
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

// ---- state ----
export async function getState() {
  const c = await ctx();
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
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: Record<string, unknown> };
      if (ev.eventName === "EvidenceCommitted")
        timeline.push({ kind: "evidence", title: "EvidenceCommitted", reason: String(ev.args.reason ?? ""), txHash: log.transactionHash as Hex, blockNumber: String(log.blockNumber) });
      else if (ev.eventName === "GuardTightened")
        timeline.push({ kind: "tighten", title: "Watcher · VOTE_TIGHTEN", reason: "Future capability narrowed", txHash: log.transactionHash as Hex, blockNumber: String(log.blockNumber) });
      else if (ev.eventName === "GuardFrozen")
        timeline.push({ kind: "freeze", title: "Watcher · VOTE_FREEZE", reason: "Execution frozen", txHash: log.transactionHash as Hex, blockNumber: String(log.blockNumber) });
    } catch {
      /* not ours */
    }
  }
  timeline.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));

  const ser = (g: HardGuardState | null) =>
    g && {
      tokenA: g.tokenA,
      tokenB: g.tokenB,
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

async function ensureSetup() {
  const c = await ctx();
  const code = await c.pub.getCode({ address: c.delegate });
  const delegated = !!code && code.toLowerCase().startsWith("0xef0100");
  if (!delegated) {
    const tx = await delegateAndInitialize(c.wallet, c.pub, c.owner, c.delegateImpl, {
      guard: DEMO_GUARD(1n),
      sessionKey: c.sessionKey,
      watcherKey: c.watcherKey,
      relayer: c.platform.address,
      gasPerTxCap: parseEther("0.0002"),
      initialExecVault: parseEther("0.002"),
      initialWatcherVault: parseEther("0.001"),
      packageHash: pkgHash,
      semanticGuardHash: semHash,
    });
    logAction({ at: Date.now(), action: "delegate+initialize (EIP-7702)", txHash: tx, ok: true });
    return;
  }
  // Already delegated: make sure caps are demo-friendly and not frozen.
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  if (guard.frozen || guard.cumulativeCap < DEMO_CUM_CAP) {
    const tx = await ownerUpdateGuard(c.wallet, c.pub, c.owner, DEMO_GUARD(guard.bindingNonce, false));
    logAction({ at: Date.now(), action: "owner reset guard (demo-ready)", txHash: tx, ok: true });
  }
}

export async function createExecutor() {
  const c = await ctx();
  await ensureSetup();
  const r = await mintExecutorNft(c.wallet, c.pub, c.platform, c.agentNft, c.delegate, {
    agentManifestHash: pkgHash,
    runtimeManifestHash: runtimeHash,
    intentId,
    executionContract: c.delegate,
    hardGuardrailsHash: keccak256(toHex("hardguard")),
  });
  session.executorTokenId = r.tokenId.toString();
  logAction({ at: Date.now(), action: `mint Executor Agent NFT #${r.tokenId}`, txHash: r.txHash, ok: true });
  return { tokenId: r.tokenId.toString(), txHash: r.txHash };
}

const WATCHER_VAULT_MIN = parseEther("0.0003");

/** Ensure the watcher gas-vault lane has funds (votes reimburse the relayer from it). Owner self-call. */
async function ensureWatcherVault() {
  const c = await ctx();
  const gv = (await c.pub.readContract({ address: c.delegate, abi, functionName: "gasVaults" })) as readonly bigint[];
  if (gv[1] >= WATCHER_VAULT_MIN) return;
  const tx = await fundGasVault(c.wallet, c.pub, c.owner, true, parseEther("0.0008"));
  logAction({ at: Date.now(), action: "fund Watcher gas vault lane", txHash: tx, ok: true });
}

export async function createWatcher() {
  const c = await ctx();
  if (!session.executorTokenId) throw new Error("create the Executor Agent first");
  const r = await mintWatcherNft(c.wallet, c.pub, c.platform, c.agentNft, c.delegate, {
    agentManifestHash: keccak256(toHex("watcher/pkg")),
    runtimeManifestHash: keccak256(toHex("watcher/runtime")),
    watchedExecutorTokenId: BigInt(session.executorTokenId),
    watchedIntentId: intentId,
    executorPackageHash: pkgHash,
    hardGuardrailsHash: keccak256(toHex("hardguard")),
    semanticGuardrailsHash: semHash,
    watcherPackageHash: keccak256(toHex("watcher/pkg")),
  });
  session.watcherTokenId = r.tokenId.toString();
  logAction({ at: Date.now(), action: `mint Watcher Agent NFT #${r.tokenId} (quorum 1)`, txHash: r.txHash, ok: true });
  await ensureWatcherVault();
  return { tokenId: r.tokenId.toString(), txHash: r.txHash };
}

export async function trade() {
  const c = await ctx();
  await ensureSetup();
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  const quoted = await quoteExactInputSingle(c.pub, TOKENS.USDC, TOKENS.WETH, AMOUNT_IN);
  const reason = `BUY 0.001 USDC->WETH (Executor #${session.executorTokenId ?? "?"})`.slice(0, 200);
  const req = buildExecutionRequest({
    intentId,
    executorTokenId: BigInt(session.executorTokenId ?? "1"),
    action: Action.BUY,
    tokenIn: TOKENS.USDC,
    tokenOut: TOKENS.WETH,
    recipient: c.delegate,
    amountIn: AMOUNT_IN,
    quotedAmountOut: quoted,
    slippageBps: 250,
    nonce: BigInt(Date.now()),
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
  const txHash = await relaySubmitExecution(c.wallet, c.pub, c.delegate, req, reason, sig, c.platform);
  logAction({ at: Date.now(), action: "guarded trade executed (USDC->WETH)", txHash, ok: true });
  return { ok: true, txHash };
}

export async function watcherFreeze() {
  const c = await ctx();
  await ensureWatcherVault();
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  const txHash = await voteFreeze(c.wallet, c.pub, c.delegate, guard.bindingNonce, c.platform);
  logAction({ at: Date.now(), action: "Watcher VOTE_FREEZE (quorum 1)", txHash, ok: true });
  return { txHash };
}

export async function watcherTighten() {
  const c = await ctx();
  await ensureWatcherVault();
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  const patch: GuardPatch = {
    amountCapPerTx: guard.amountCapPerTx > 1n ? guard.amountCapPerTx / 2n : 1n,
    cumulativeCap: guard.cumulativeCap,
    slippageCapBps: guard.slippageCapBps,
    expiry: guard.expiry,
  };
  const txHash = await voteTighten(c.wallet, c.pub, c.delegate, patch, c.platform);
  logAction({ at: Date.now(), action: `Watcher VOTE_TIGHTEN (cap -> ${patch.amountCapPerTx})`, txHash, ok: true });
  return { txHash, newAmountCap: patch.amountCapPerTx.toString() };
}

export async function ownerResume() {
  const c = await ctx();
  const guard = (await c.pub.readContract({ address: c.delegate, abi, functionName: "guard" })) as HardGuardState;
  const txHash = await ownerUpdateGuard(c.wallet, c.pub, c.owner, DEMO_GUARD(guard.bindingNonce, false));
  logAction({ at: Date.now(), action: "Owner resume (unfreeze + restore caps)", txHash, ok: true });
  return { txHash };
}

export async function reset() {
  session.executorTokenId = null;
  session.watcherTokenId = null;
  const r = await ownerResume();
  logAction({ at: Date.now(), action: "demo reset", txHash: r.txHash, ok: true });
  return r;
}
