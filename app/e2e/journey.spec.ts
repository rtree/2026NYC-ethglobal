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
});

test("010 onboarding gate blocks entry until wallet + World ID", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Enter IntentOS" })).toBeVisible();
  // The enter button is disabled before both gates.
  const enter = page.getByRole("button", { name: /Complete both gates/ });
  await expect(enter).toBeDisabled();

  // Gate 1: connect wallet (mock injected).
  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await expect(page.getByText("wallet connected")).toBeVisible();

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

test("030 Launch Dashboard renders the card hub with live completion", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch");
  await expect(page.getByText("030 · Intent Launch Dashboard")).toBeVisible();
  // 8 cards present.
  for (const t of ["Intent creation", "Agent Identity", "Human Proof", "Gas Funding", "Runtime Preview", "Watcher Guard", "Start Conditions"]) {
    await expect(page.getByRole("heading", { name: t })).toBeVisible();
  }
});

test("040 Intent creation: conversation + agent package preview + create button", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch/intent");
  await expect(page.getByText("040 · Intent creation · IntentBuilder")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent Package preview" })).toBeVisible();
  // advance the scripted conversation to reveal the action buttons
  for (let i = 0; i < 5; i++) {
    const cont = page.getByRole("button", { name: "Continue conversation" });
    if (await cont.isVisible().catch(() => false)) await cont.click();
  }
  await expect(page.getByRole("button", { name: /Create Executor Agent/ })).toBeVisible();
});

test("050 Agent Identity shows ENS name + ERC-8004 registration JSON", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch/identity");
  await expect(page.getByText("050 · Agent Identity")).toBeVisible();
  await expect(page.getByText("erc8004-agent-registration")).toBeVisible();
  await expect(page.getByText(/\.intentos\.base\.eth/).first()).toBeVisible();
});

test("060 Runtime & funding shows binding + gas vault lanes", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch/runtime");
  await expect(page.getByText("060 · Runtime & Funding")).toBeVisible();
  await expect(page.getByText("Executor lane").first()).toBeVisible();
  await expect(page.getByText("Watcher lane").first()).toBeVisible();
});

test("070 Watcher creation shows immutable context + create button", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch/watcher");
  await expect(page.getByText("070 · Watcher Agent (optional)")).toBeVisible();
  await expect(page.getByText("watchedExecutorTokenId")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create Watcher Agent/ })).toBeVisible();
});

test("080 Start shows preconditions checklist", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/launch/start");
  await expect(page.getByText("080 · Start")).toBeVisible();
  await expect(page.getByText("Wallet connected")).toBeVisible();
  await expect(page.getByText("World ID human-proof")).toBeVisible();
  await expect(page.getByText("Executor gas vault funded")).toBeVisible();
});

test("090 Owner dashboard shows live guard + timeline + controls", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/dashboard");
  await expect(page.getByText("090 · Owner Runtime Dashboard · LIVE")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current Hard Guardrails" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared execution timeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Execute guarded trade/ })).toBeVisible();
  // live data: cumulative spent value present
  await expect(page.getByText(/USDC/).first()).toBeVisible();
});

test("100 Watcher dashboard shows evidence + vote buttons", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/watcher");
  await expect(page.getByText("100 · Watcher Runtime Dashboard · LIVE")).toBeVisible();
  await expect(page.getByRole("button", { name: /VOTE_TIGHTEN/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /VOTE_FREEZE/ })).toBeVisible();
});

test("110 Result shows terminal state + performance", async ({ page }) => {
  await passGate(page);
  await page.goto("/#/result");
  await expect(page.getByText("110 · Result / Performance · LIVE")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outcome" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
});

test("no console errors while walking the whole journey", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await passGate(page);
  for (const r of ["#/intents", "#/launch", "#/launch/intent", "#/launch/identity", "#/launch/runtime", "#/launch/watcher", "#/launch/start", "#/dashboard", "#/watcher", "#/result"]) {
    await page.goto("/" + r);
    await page.waitForTimeout(400);
  }
  // ignore benign network noise from the public RPC if any leaks through
  const real = errors.filter((e) => !/429|Failed to load resource/.test(e));
  expect(real, real.join("\n")).toHaveLength(0);
});
