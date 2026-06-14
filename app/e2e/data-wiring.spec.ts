import { test, expect, type Page, type Route } from "@playwright/test";
import { injectMockWallet } from "./mockWallet";

const API_STATE = {
  chainId: 8453,
  delegate: "0x1111111111111111111111111111111111111111",
  agentNft: "0x2222222222222222222222222222222222222222",
  sessionKey: "0x3333333333333333333333333333333333333333",
  watcherKey: "0x4444444444444444444444444444444444444444",
  delegated: true,
  guard: {
    tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenB: "0x4200000000000000000000000000000000000006",
    amountCapPerTx: "1234",
    cumulativeCap: "56789",
    slippageCapBps: 123,
    expiry: "9999999999",
    frozen: false,
    bindingNonce: "42",
  },
  cumulativeSpent: "3456",
  execVault: "1230000000000000",
  watcherVault: "456000000000000",
  usdc: "987654",
  weth: "123450000000000",
  timeline: [
    {
      kind: "evidence",
      title: "EvidenceCommitted",
      reason: "API fixture trade",
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      blockNumber: "12345678",
    },
  ],
  session: { executorTokenId: "77", watcherTokenId: "88" },
  actions: [],
};

const ACTIVE_INTENT = {
  intentId: "intent-live-api",
  title: "Treasury Hedge From API",
  status: "live",
  createdAt: 1_765_000_000_000,
  executorTokenId: "77",
  watcherTokenId: "88",
  packages: {
    executor: {
      role: "EXECUTOR",
      summary: "Executor summary from API",
      agents: "# Executor from API",
      soul: "api soul",
      constraints: {
        tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        tokenB: "0x4200000000000000000000000000000000000006",
        poolFee: 500,
        amountCapPerTx: "1234",
        cumulativeCap: "56789",
        slippageCapBps: 123,
        expiry: "9999999999",
      },
      semantic: ["api semantic"],
      fixed: true,
      packageHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    watcher: {
      role: "WATCHER",
      summary: "Watcher summary from API",
      agents: "# Watcher from API",
      soul: "api watcher soul",
      constraints: {
        tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        tokenB: "0x4200000000000000000000000000000000000006",
        poolFee: 500,
        amountCapPerTx: "1234",
        cumulativeCap: "56789",
        slippageCapBps: 123,
        expiry: "9999999999",
      },
      semantic: ["api watcher semantic"],
      fixed: true,
      packageHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    },
  },
  startConfig: { loopPeriodSec: 17, ttlMinutes: 5, watcherEnabled: true },
  transcript: [{ role: "owner", text: "API transcript", at: 1_765_000_000_000 }],
};

const EMPTY_STATE = {
  ...API_STATE,
  delegated: false,
  guard: null,
  execVault: "0",
  watcherVault: "0",
  cumulativeSpent: "0",
  session: { executorTokenId: null, watcherTokenId: null },
};

// Executor exists (so the Start-runtime button is enabled) but vaults still reflect API values.
const EMPTY_STATE_WITH_EXECUTOR = {
  ...API_STATE,
  session: { executorTokenId: "77", watcherTokenId: null },
};

const RUNTIME_RECORD = {
  runtimeId: "rt-intent-live-api-77-test",
  ownerUid: "eip155:8453:0xtest",
  intentId: ACTIVE_INTENT.intentId,
  executorTokenId: "77",
  watcherTokenId: "88",
  delegate: API_STATE.delegate,
  role: "EXECUTOR",
  packageHash: ACTIVE_INTENT.packages.executor.packageHash,
  runtimeOwner: API_STATE.delegate,
  bindingNonce: "42",
  cloudRunService: "manual-control-panel",
  status: "scheduled",
  startedAt: Date.now(),
  lastHeartbeatAt: null,
  autoStopAt: Date.now() + 600_000,
  loopPeriodSec: 5,
  plannedTicks: 3,
  executedTicks: 0,
  llmCallsUsed: 0,
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0,
  estimatedVertexCostUsd: 0,
  maxVertexCostUsd: 5,
  failureReason: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

async function setupApi(page: Page, state = API_STATE) {
  await page.addInitScript(injectMockWallet);
  await page.route("**/api/state", (route) => route.fulfill({ json: state }));
  await page.route("**/api/config", (route) => route.fulfill({ json: { authRequired: true } }));
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
  await page.route("**/api/intents", (route) => route.fulfill({ json: { intents: [ACTIVE_INTENT] } }));
  await page.route("**/api/intents/*", (route) => route.fulfill({ json: ACTIVE_INTENT }));
  await page.route("**/api/intent/start-config", (route) =>
    route.fulfill({ json: { intentId: ACTIVE_INTENT.intentId, startConfig: ACTIVE_INTENT.startConfig } }),
  );
  await page.route("**/api/runtime/status**", (route) =>
    route.fulfill({ json: { intentId: ACTIVE_INTENT.intentId, runtimeRecord: null } }),
  );
}

async function passGate(page: Page) {
  await page.goto("/#/");
  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await page.getByRole("button", { name: /Mock Wallet|Injected|MetaMask/ }).first().click();
  await expect(page.getByText(/signed in|wallet connected/)).toBeVisible();
  await page.getByRole("button", { name: /Simulate World ID/ }).click();
  await page.getByRole("button", { name: /Enter/ }).click();
}

async function captureJson(route: Route): Promise<unknown> {
  const body = route.request().postData();
  await route.fulfill({ json: { ok: true, txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" } });
  return body ? JSON.parse(body) : {};
}

test("write buttons send the current intentId to backend APIs", async ({ page }) => {
  await setupApi(page);
  await passGate(page);

  let fundBody: unknown = null;
  await page.route("**/api/gas/fund", async (route) => {
    fundBody = await captureJson(route);
  });
  await page.goto("/#/launch");
  await page.getByText("Gas Funding", { exact: true }).first().click();
  await page.getByRole("button", { name: /Top up Executor lane/ }).click();
  await expect.poll(() => fundBody).toEqual({ lane: "executor", intentId: ACTIVE_INTENT.intentId });

  let tradeBody: unknown = null;
  await page.route("**/api/trade", async (route) => {
    tradeBody = await captureJson(route);
  });
  await page.goto("/#/console");
  await page.getByRole("button", { name: /Execute guarded trade/ }).click();
  await expect.poll(() => tradeBody).toEqual({ intentId: ACTIVE_INTENT.intentId });
});

test("Start runtime button posts intentId to /api/runtime/start", async ({ page }) => {
  await setupApi(page, EMPTY_STATE_WITH_EXECUTOR);
  await passGate(page);

  let startBody: unknown = null;
  await page.route("**/api/runtime/start", async (route) => {
    startBody = route.request().postData() ? JSON.parse(route.request().postData()!) : {};
    await route.fulfill({ json: { intentId: ACTIVE_INTENT.intentId, runtime: { startedAt: RUNTIME_RECORD.startedAt, autoStopAt: RUNTIME_RECORD.autoStopAt, loopPeriodSec: 5, plannedTicks: 3 }, runtimeRecord: RUNTIME_RECORD } });
  });
  await page.goto("/#/launch");
  await page.getByText("Start Conditions", { exact: true }).first().click();
  await page.getByRole("button", { name: /Start OpenClaw runtime session/ }).click();
  await expect.poll(() => startBody).toEqual({ intentId: ACTIVE_INTENT.intentId });
  await expect(page.getByText(/runtime schedule saved/)).toBeVisible();
  await expect(page.getByText(RUNTIME_RECORD.runtimeId)).toBeVisible();
});

test("Intent List active card should render current intent API values", async ({ page }) => {
  await setupApi(page);
  await passGate(page);

  await expect(page.getByText(ACTIVE_INTENT.intentId)).toBeVisible();
  await expect(page.getByRole("heading", { name: ACTIVE_INTENT.title })).toBeVisible();
  await expect(page.getByText("intent-abc")).toHaveCount(0);
});

test("Live Console should render current intent title and state delegate", async ({ page }) => {
  await setupApi(page);
  await passGate(page);
  await page.goto("/#/console");

  await expect(page.getByRole("heading", { name: new RegExp(ACTIVE_INTENT.title) })).toBeVisible();
  await expect(page.getByText("0x1111…1111")).toBeVisible();
  await expect(page.getByText("0xeEa9…0f01")).toHaveCount(0);
});

test("runtime/funding/live badges should not claim live or funded without API support", async ({ page }) => {
  await setupApi(page, EMPTY_STATE);
  await passGate(page);
  await page.goto("/#/launch");

  await page.getByText("Gas Funding", { exact: true }).first().click();
  await expect(page.getByText("Owner-funded")).toHaveCount(0);

  await page.getByText("Start Conditions", { exact: true }).first().click();
  await expect(page.getByText("live on Base")).toHaveCount(0);
});

test("direct deep links should enforce onboarding before showing protected screens", async ({ page }) => {
  await setupApi(page);
  await page.goto("/#/console");
  await expect(page.getByRole("heading", { name: "Enter IntentOS" })).toBeVisible();
});

test("Intent List reset should send the current intentId", async ({ page }) => {
  await setupApi(page);
  await passGate(page);

  let resetBody: unknown = null;
  await page.route("**/api/reset", async (route) => {
    resetBody = await captureJson(route);
  });
  await page.getByRole("button", { name: /Reset demo session/ }).click();
  await expect.poll(() => resetBody).toEqual({ intentId: ACTIVE_INTENT.intentId });
});

test("protected IntentBuilder calls should include a Firebase Bearer token", async ({ page }) => {
  await setupApi(page);
  await passGate(page);

  let authHeader: string | null = null;
  await page.route("**/api/intent/chat", async (route) => {
    authHeader = route.request().headers().authorization ?? null;
    await route.fulfill({ json: { intentId: ACTIVE_INTENT.intentId, reply: "ok", packages: ACTIVE_INTENT.packages, llm: "mock" } });
  });

  await page.goto("/#/launch");
  await page.getByPlaceholder("Describe purpose & limits…").fill("DCA");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => authHeader).toMatch(/^Bearer .+/);
});
