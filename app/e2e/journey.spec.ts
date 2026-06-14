import { test, expect } from "@playwright/test";
import { injectMockWallet } from "./mockWallet";

// Full-journey UI e2e. Injects a mock wallet, walks every route, and asserts render + transitions +
// gate behavior. /api/state is mocked with a deterministic fixture so screens render instantly and
// independently of the live RPC (the real chain path is covered by the contract + server API tests).

const STATE_FIXTURE = {
  chainId: 8453,
  delegate: "0xeEa9c291544d02397FD8078e3162a3549ADa0f01",
  agentNft: "0x3da4947a9b5e255219fa39c52a68219da8f9a7ec",
  sessionKey: "0x86bA13f74C5f2AC469eeb6e0010A6AFfd49298eE",
  watcherKey: "0xEe1Dc2f082612D6d510D7E3b3EEd26cE385E9D38",
  delegated: true,
  guard: {
    tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenB: "0x4200000000000000000000000000000000000006",
    amountCapPerTx: "2000",
    cumulativeCap: "100000",
    slippageCapBps: 300,
    expiry: "9999999999",
    frozen: false,
    bindingNonce: "1",
  },
  cumulativeSpent: "8000",
  execVault: "1991000000000000",
  watcherVault: "800000000000000",
  usdc: "970996",
  weth: "4770000000000",
  timeline: [
    { kind: "evidence", title: "EvidenceCommitted", reason: "BUY 0.001 USDC->WETH (Executor #1)", txHash: "0x6f5323999cef2563ae641f05be1bd100597bb1a92486145bf5347db390a6fecc", blockNumber: "47281172" },
    { kind: "freeze", title: "Watcher · VOTE_FREEZE", reason: "Execution frozen", txHash: "0xd80139c4de5f9da7bca3c9725799fa26d1d832e9e25ffad43760555d4bfc5836", blockNumber: "47281100" },
  ],
  session: { executorTokenId: "1", watcherTokenId: "2" },
  actions: [
    { at: Date.now(), action: "guarded trade executed (USDC->WETH)", txHash: "0x6f5323999cef2563ae641f05be1bd100597bb1a92486145bf5347db390a6fecc", ok: true },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(injectMockWallet);
  // Deterministic, instant state for the dashboards (no live RPC in UI tests).
  await page.route("**/api/state", (route) => route.fulfill({ json: STATE_FIXTURE }));
  // Server reports auth is required, so the client demands sign-in (single source of truth, AUTH-002).
  await page.route("**/api/config", (route) => route.fulfill({ json: { authRequired: true } }));
  // Auth handshake: nonce + web3 are stubbed, and the Firebase REST exchange (signInWithCustomToken /
  // securetoken refresh) is mocked too, so the Web3->Firebase sign-in completes headlessly and the
  // onboarding gate (which now requires sign-in when VITE_FIREBASE_API_KEY is set) passes.
  await page.route("**/api/auth/nonce**", (route) =>
    route.fulfill({ json: { nonce: "testnonce", message: "localhost wants you to sign in\nNonce: testnonce" } }),
  );
  await page.route("**/api/auth/web3", (route) =>
    route.fulfill({ json: { customToken: "test-custom-token", uid: "eip155:8453:0xtest", address: "0xtest" } }),
  );
  await page.route("**/identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({ json: { idToken: "test-id-token", refreshToken: "test-refresh", expiresIn: "3600" } }),
  );
  await page.route("**/securetoken.googleapis.com/**", (route) =>
    route.fulfill({ json: { id_token: "test-id-token", refresh_token: "test-refresh", expires_in: "3600" } }),
  );
  // IntentBuilder + store (memory) — return a deterministic draft so the wizard renders packages.
  const draftPkg = (role: "EXECUTOR" | "WATCHER") => ({
    role,
    summary: role === "EXECUTOR" ? "DCA USDC->WETH in small guarded buys." : "Tighten/freeze on violations.",
    agents: `# ${role}\nObjective: demo.`,
    soul: "conservative",
    constraints: { tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", tokenB: "0x4200000000000000000000000000000000000006", poolFee: 500, amountCapPerTx: "2000", cumulativeCap: "100000", slippageCapBps: 300, expiry: "9999999999" },
    semantic: ["route naturalness", "quote freshness"],
    fixed: false,
  });
  const INTENT_FIXTURE = {
    intentId: "intent-test",
    title: "DCA USDC -> WETH",
    status: "draft",
    createdAt: Date.now(),
    executorTokenId: null,
    watcherTokenId: null,
    packages: { executor: draftPkg("EXECUTOR"), watcher: draftPkg("WATCHER") },
    startConfig: { loopPeriodSec: 10, ttlMinutes: 1, watcherEnabled: true },
    transcript: [],
  };
  await page.route("**/api/intents", (route) => route.fulfill({ json: { intents: [] } }));
  await page.route("**/api/intents/*", (route) => route.fulfill({ json: INTENT_FIXTURE }));
  await page.route("**/api/intent/chat", (route) =>
    route.fulfill({ json: { intentId: "intent-test", reply: "Got it — small guarded buys.", packages: INTENT_FIXTURE.packages, llm: "mock" } }),
  );
  await page.route("**/api/intent/fix", (route) =>
    route.fulfill({ json: { intentId: "intent-test", role: "EXECUTOR", packageHash: "0xabc123", packages: INTENT_FIXTURE.packages } }),
  );
  await page.route("**/api/intent/start-config", (route) =>
    route.fulfill({ json: { intentId: "intent-test", startConfig: { loopPeriodSec: 10, ttlMinutes: 1, watcherEnabled: true } } }),
  );
  await page.route("**/api/runtime/status**", (route) =>
    route.fulfill({ json: { intentId: "intent-test", runtimeRecord: null } }),
  );
});

test("010 onboarding gate blocks entry until wallet + World ID", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Enter intentOS" })).toBeVisible();
  // The enter button is disabled before the gates.
  const enter = page.getByRole("button", { name: /Complete the gates/ });
  await expect(enter).toBeDisabled();

  // Gate 1: connect wallet via the picker (mock injected announces over EIP-6963), then auto sign-in.
  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await page.getByRole("button", { name: /Mock Wallet|Injected|MetaMask/ }).first().click();
  await expect(page.getByText(/signed in|wallet connected/)).toBeVisible();

  // Gate 2: simulate World ID (dev).
  await page.getByRole("button", { name: /Simulate World ID/ }).click();
  await expect(page.getByText("human verified")).toBeVisible();

  // Now enter is enabled and forwards to the Intent List.
  await page.getByRole("button", { name: /Enter — go to Intent List/ }).click();
  await expect(page.getByRole("heading", { name: "Your Intents" })).toBeVisible();
});

async function passGate(page: import("@playwright/test").Page) {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await page.getByRole("button", { name: /Mock Wallet|Injected|MetaMask/ }).first().click();
  await expect(page.getByText(/signed in|wallet connected/)).toBeVisible();
  await page.getByRole("button", { name: /Simulate World ID/ }).click();
  await page.getByRole("button", { name: /Enter — go to Intent List/ }).click();
  await expect(page.getByRole("heading", { name: "Your Intents" })).toBeVisible();
}

test("020 Intent List shows live active intent and links to launch + dashboard", async ({ page }) => {
  await passGate(page);
  await expect(page.getByText("020 · Intent List")).toBeVisible();
  await expect(page.getByRole("heading", { name: "DCA USDC → WETH" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run a new Intent" })).toBeVisible();
});

test("020 empty: no active intent until an Executor is created this session", async ({ page }) => {
  // Session-scoped: the Owner EOA is permanently 7702-delegated on mainnet, but with no Executor
  // created this session the Intent List must NOT show a running intent.
  await page.route("**/api/state", (route) =>
    route.fulfill({ json: { ...STATE_FIXTURE, session: { executorTokenId: null, watcherTokenId: null } } }),
  );
  await passGate(page);
  await expect(page.getByRole("heading", { name: "No active Intent yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DCA USDC → WETH" })).toHaveCount(0);
  // and no "running" status pill in the header
  await expect(page.getByText("running")).toHaveCount(0);
});

test("launch wizard: single screen, 5 steps, IntentBuilder + dual package + FIX", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch");
  await expect(page.getByRole("heading", { name: "Launch an Intent" })).toBeVisible();
  // 5 step-nav entries
  for (const t of ["Intent & Agent Packages", "Executor Agent", "Watcher Agent", "Gas Funding", "Start Conditions"]) {
    await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  }
  // IntentBuilder sends a message -> dual package preview appears
  await page.getByPlaceholder("Describe purpose & limits…").fill("DCA USDC into ETH, small and careful");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Executor Agent Package" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watcher Agent Package" })).toBeVisible();
  await expect(page.getByRole("button", { name: "FIX this package" }).first()).toBeVisible();
});

test("launch wizard: Executor step shows mint button + inline identity", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch");
  await page.getByText("Executor Agent", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Create Executor Agent" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent identity" })).toBeVisible();
  await expect(page.getByText(/\.intentos\.base\.eth/).first()).toBeVisible();
});

test("launch wizard: Watcher step shows mint button + inline identity", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch");
  await page.getByText("Watcher Agent", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Create Watcher Agent" })).toBeVisible();
  await expect(page.getByText("watchedExecutor")).toBeVisible();
});

test("launch wizard: Gas Funding has lanes and NO skip-to-start", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch");
  await page.getByText("Gas Funding", { exact: true }).first().click();
  await expect(page.getByText("Executor lane").first()).toBeVisible();
  await expect(page.getByText("Watcher lane").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Skip to Start/ })).toHaveCount(0);
});

test("launch wizard: Start Conditions has real loop period + TTL + summary", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch");
  await page.getByText("Start Conditions", { exact: true }).first().click();
  await expect(page.getByText("AgentLoop period (seconds)")).toBeVisible();
  await expect(page.getByText(/Auto-stop after \(minutes\)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch summary" })).toBeVisible();
});

test("live console: merged Owner + Watcher controls + timeline + history", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/console");
  await expect(page.getByText("Live Console · Owner + Watcher · Control Panel")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Owner controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watcher controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared execution timeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Execute guarded trade/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /VOTE_TIGHTEN/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /VOTE_FREEZE/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your past Intents" })).toBeVisible();
});

test("live console empty: no shared history shown until session has an Intent", async ({ page }) => {
  // Session-scoped: with no Executor created this session, the console must NOT show the shared demo
  // Owner's timeline/controls — only an empty state + the user's own (per-wallet) history.
  await page.route("**/api/state", (route) =>
    route.fulfill({ json: { ...STATE_FIXTURE, session: { executorTokenId: null, watcherTokenId: null } } }),
  );
  await passGate(page);
  await page.goto("/#/console");
  await expect(page.getByRole("heading", { name: "No running Intent yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared execution timeline" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Owner controls" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your past Intents" })).toBeVisible();
});

test("no console errors while walking the whole journey", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await passGate(page);
  for (const r of ["#/intents", "#/launch", "#/console"]) {
    await page.goto("/" + r);
    await page.waitForTimeout(400);
  }
  // ignore benign network noise from the public RPC if any leaks through
  const real = errors.filter((e) => !/429|Failed to load resource/.test(e));
  expect(real, real.join("\n")).toHaveLength(0);
});
