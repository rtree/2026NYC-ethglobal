# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journey.spec.ts >> 050 Agent Identity shows ENS name + ERC-8004 registration JSON
- Location: e2e/journey.spec.ts:70:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /Enter — go to Intent List/ })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - link "I IntentOS Base mainnet" [ref=e5] [cursor=pointer]:
      - /url: "#/"
      - generic [ref=e6]: I
      - text: IntentOS
      - generic [ref=e7]: Base mainnet
    - generic [ref=e8]: running
    - link "0x0783…a6C9" [ref=e10] [cursor=pointer]:
      - /url: https://basescan.org/address/0x078383c4c20b4e9732Ac0c30A68b8123D53ea6C9
      - text: 0x0783…a6C9
    - button "Disconnect" [ref=e12]
  - main [ref=e13]:
    - generic [ref=e14]:
      - link "Intents" [ref=e15] [cursor=pointer]:
        - /url: "#/intents"
      - link "Launch" [ref=e16] [cursor=pointer]:
        - /url: "#/launch"
      - link "Owner" [ref=e17] [cursor=pointer]:
        - /url: "#/dashboard"
      - link "Watcher" [ref=e18] [cursor=pointer]:
        - /url: "#/watcher"
      - link "Result" [ref=e19] [cursor=pointer]:
        - /url: "#/result"
    - generic [ref=e20]:
      - generic [ref=e21]: 020 · Intent List
      - heading "Your Intents" [level=1] [ref=e22]
      - paragraph [ref=e23]: One active Intent per Owner. The active Intent is live on Base mainnet; review it on the dashboard or open the launch flow for a new one.
    - generic [ref=e24]:
      - 'link "intent-abc running DCA USDC → WETH Cumulative spent 0.011 USDC · per-tx cap 0.002 USDC Executor #1 Watcher" [ref=e25] [cursor=pointer]':
        - /url: "#/dashboard"
        - generic [ref=e26]:
          - generic [ref=e27]: intent-abc
          - generic [ref=e28]: running
        - heading "DCA USDC → WETH" [level=3] [ref=e29]
        - paragraph [ref=e30]: Cumulative spent 0.011 USDC · per-tx cap 0.002 USDC
        - generic [ref=e31]: "Executor #1"
        - generic [ref=e32]: Watcher
      - link "new → Run a new Intent Speak an intent, generate the Agent Package, mint the Executor, delegate via EIP-7702, fund the gas vault, and start. IntentBuilder → mint → 7702 → start" [ref=e33] [cursor=pointer]:
        - /url: "#/launch"
        - generic [ref=e34]:
          - generic [ref=e35]: new
          - generic [ref=e36]: →
        - heading "Run a new Intent" [level=3] [ref=e37]
        - paragraph [ref=e38]: Speak an intent, generate the Agent Package, mint the Executor, delegate via EIP-7702, fund the gas vault, and start.
        - generic [ref=e39]: IntentBuilder → mint → 7702 → start
    - paragraph [ref=e40]: IntentOS · ETHGlobal NYC 2026
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { injectMockWallet } from "./mockWallet";
  3   | 
  4   | // Full-journey UI e2e. Injects a mock wallet, walks every route, and asserts render + transitions +
  5   | // gate behavior. Read/nav fully automated. Money write-paths (trade/freeze) are covered by the API
  6   | // test (server) and exercised live separately; here we assert the buttons exist and are wired.
  7   | 
  8   | test.beforeEach(async ({ page }) => {
  9   |   await page.addInitScript(injectMockWallet);
  10  | });
  11  | 
  12  | test("010 onboarding gate blocks entry until wallet + World ID", async ({ page }) => {
  13  |   await page.goto("/#/");
  14  |   await expect(page.getByRole("heading", { name: "Enter IntentOS" })).toBeVisible();
  15  |   // The enter button is disabled before both gates.
  16  |   const enter = page.getByRole("button", { name: /Complete both gates/ });
  17  |   await expect(enter).toBeDisabled();
  18  | 
  19  |   // Gate 1: connect wallet (mock injected).
  20  |   await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  21  |   await expect(page.getByText("wallet connected")).toBeVisible();
  22  | 
  23  |   // Gate 2: simulate World ID (dev).
  24  |   await page.getByRole("button", { name: /Simulate World ID/ }).click();
  25  |   await expect(page.getByText("human verified")).toBeVisible();
  26  | 
  27  |   // Now enter is enabled and forwards to the Intent List.
  28  |   await page.getByRole("button", { name: /Enter — go to Intent List/ }).click();
  29  |   await expect(page.getByRole("heading", { name: "Your Intents" })).toBeVisible();
  30  | });
  31  | 
  32  | async function passGate(page: import("@playwright/test").Page) {
  33  |   await page.goto("/#/");
  34  |   await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  35  |   await page.getByRole("button", { name: /Simulate World ID/ }).click();
> 36  |   await page.getByRole("button", { name: /Enter — go to Intent List/ }).click();
      |                                                                         ^ Error: locator.click: Test timeout of 60000ms exceeded.
  37  |   await expect(page.getByRole("heading", { name: "Your Intents" })).toBeVisible();
  38  | }
  39  | 
  40  | test("020 Intent List shows live active intent and links to launch + dashboard", async ({ page }) => {
  41  |   await passGate(page);
  42  |   await expect(page.getByText("020 · Intent List")).toBeVisible();
  43  |   await expect(page.getByRole("heading", { name: "DCA USDC → WETH" })).toBeVisible();
  44  |   await expect(page.getByRole("heading", { name: "Run a new Intent" })).toBeVisible();
  45  | });
  46  | 
  47  | test("030 Launch Dashboard renders the card hub with live completion", async ({ page }) => {
  48  |   await passGate(page);
  49  |   await page.goto("/#/launch");
  50  |   await expect(page.getByText("030 · Intent Launch Dashboard")).toBeVisible();
  51  |   // 8 cards present.
  52  |   for (const t of ["Intent creation", "Agent Identity", "Human Proof", "Gas Funding", "Runtime Preview", "Watcher Guard", "Start Conditions"]) {
  53  |     await expect(page.getByRole("heading", { name: t })).toBeVisible();
  54  |   }
  55  | });
  56  | 
  57  | test("040 Intent creation: conversation + agent package preview + create button", async ({ page }) => {
  58  |   await passGate(page);
  59  |   await page.goto("/#/launch/intent");
  60  |   await expect(page.getByText("040 · Intent creation · IntentBuilder")).toBeVisible();
  61  |   await expect(page.getByRole("heading", { name: "Agent Package preview" })).toBeVisible();
  62  |   // advance the scripted conversation to reveal the action buttons
  63  |   for (let i = 0; i < 5; i++) {
  64  |     const cont = page.getByRole("button", { name: "Continue conversation" });
  65  |     if (await cont.isVisible().catch(() => false)) await cont.click();
  66  |   }
  67  |   await expect(page.getByRole("button", { name: /Create Executor Agent/ })).toBeVisible();
  68  | });
  69  | 
  70  | test("050 Agent Identity shows ENS name + ERC-8004 registration JSON", async ({ page }) => {
  71  |   await passGate(page);
  72  |   await page.goto("/#/launch/identity");
  73  |   await expect(page.getByText("050 · Agent Identity")).toBeVisible();
  74  |   await expect(page.getByText("erc8004-agent-registration")).toBeVisible();
  75  |   await expect(page.getByText(/\.intentos\.base\.eth/)).toBeVisible();
  76  | });
  77  | 
  78  | test("060 Runtime & funding shows binding + gas vault lanes", async ({ page }) => {
  79  |   await passGate(page);
  80  |   await page.goto("/#/launch/runtime");
  81  |   await expect(page.getByText("060 · Runtime & Funding")).toBeVisible();
  82  |   await expect(page.getByText("Executor lane")).toBeVisible();
  83  |   await expect(page.getByText("Watcher lane")).toBeVisible();
  84  | });
  85  | 
  86  | test("070 Watcher creation shows immutable context + create button", async ({ page }) => {
  87  |   await passGate(page);
  88  |   await page.goto("/#/launch/watcher");
  89  |   await expect(page.getByText("070 · Watcher Agent (optional)")).toBeVisible();
  90  |   await expect(page.getByText("watchedExecutorTokenId")).toBeVisible();
  91  |   await expect(page.getByRole("button", { name: /Create Watcher Agent/ })).toBeVisible();
  92  | });
  93  | 
  94  | test("080 Start shows preconditions checklist", async ({ page }) => {
  95  |   await passGate(page);
  96  |   await page.goto("/#/launch/start");
  97  |   await expect(page.getByText("080 · Start")).toBeVisible();
  98  |   await expect(page.getByText("Wallet connected")).toBeVisible();
  99  |   await expect(page.getByText("World ID human-proof")).toBeVisible();
  100 |   await expect(page.getByText("Executor gas vault funded")).toBeVisible();
  101 | });
  102 | 
  103 | test("090 Owner dashboard shows live guard + timeline + controls", async ({ page }) => {
  104 |   await passGate(page);
  105 |   await page.goto("/#/dashboard");
  106 |   await expect(page.getByText("090 · Owner Runtime Dashboard · LIVE")).toBeVisible();
  107 |   await expect(page.getByRole("heading", { name: "Current Hard Guardrails" })).toBeVisible();
  108 |   await expect(page.getByRole("heading", { name: "Shared execution timeline" })).toBeVisible();
  109 |   await expect(page.getByRole("button", { name: /Execute guarded trade/ })).toBeVisible();
  110 |   // live data: cumulative spent value present
  111 |   await expect(page.getByText(/USDC/).first()).toBeVisible();
  112 | });
  113 | 
  114 | test("100 Watcher dashboard shows evidence + vote buttons", async ({ page }) => {
  115 |   await passGate(page);
  116 |   await page.goto("/#/watcher");
  117 |   await expect(page.getByText("100 · Watcher Runtime Dashboard · LIVE")).toBeVisible();
  118 |   await expect(page.getByRole("button", { name: /VOTE_TIGHTEN/ })).toBeVisible();
  119 |   await expect(page.getByRole("button", { name: /VOTE_FREEZE/ })).toBeVisible();
  120 | });
  121 | 
  122 | test("110 Result shows terminal state + performance", async ({ page }) => {
  123 |   await passGate(page);
  124 |   await page.goto("/#/result");
  125 |   await expect(page.getByText("110 · Result / Performance · LIVE")).toBeVisible();
  126 |   await expect(page.getByRole("heading", { name: "Outcome" })).toBeVisible();
  127 |   await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  128 | });
  129 | 
  130 | test("no console errors while walking the whole journey", async ({ page }) => {
  131 |   const errors: string[] = [];
  132 |   page.on("console", (m) => {
  133 |     if (m.type() === "error") errors.push(m.text());
  134 |   });
  135 |   await passGate(page);
  136 |   for (const r of ["#/intents", "#/launch", "#/launch/intent", "#/launch/identity", "#/launch/runtime", "#/launch/watcher", "#/launch/start", "#/dashboard", "#/watcher", "#/result"]) {
```