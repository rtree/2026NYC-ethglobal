# 100 — Sponsor Integration Research: ENS & Uniswap API

Research notes for two candidate sponsor integrations, grounded in the current codebase. Goal: capture
**how to add each**, **what the sponsor/judges will likely expect** (i.e. "what they'd ask for"), and
**how it interacts with IntentOS's hard guardrails** so we don't accidentally break the security model.

Status: research only — nothing implemented yet. Source links current as of 2026-06-14.

---

## 1. ENS — agent & owner identity

### 1.1 What ENS actually offers (the menu)

ENS is a sponsor at ETHGlobal NYC 2026 (the docs site shows an "ENSv2 docs preview" banner for NY).
There are three ways to **issue** names and two ways to **consume** them:

**Issuing subnames** (`docs.ens.domains/web/subdomains`):

| Type | Where it lives | Cost / UX | Tooling |
| --- | --- | --- | --- |
| **L1 subnames** | Ethereum mainnet, subname = NFT | Highest gas, shows in wallets as NFT | "Onchain subname registrar" guide |
| **L2 subnames** | Your L2 contract + CCIP-Read gateway, L1 resolver | Cheap, trustless-ish | **[Durin](https://durin.dev/)** (handles L1 resolver + offchain gateway; you write the L2 business logic) |
| **Offchain subnames** | Centralized DB behind CCIP-Read | Cheapest, fastest to ship, REST API | **NameStone**, **Namespace**, **JustaName**, OSS `gskril/ens-offchain-registrar` |

**Consuming names** (read side, what every ENS-enabled app should do):
- **Forward resolution**: `name → address` (resolve `agent.intentos.eth` to the delegated EOA).
- **Reverse / Primary Names**: `address → name` (show `alice.eth` instead of `0x5E90…` in the UI).
- **Text records**: arbitrary key/value on a name (`avatar`, `url`, `com.twitter`, **custom keys**).

### 1.2 How this maps to IntentOS

We have two identity surfaces that are currently raw addresses:
- the **Owner EOA** (signs in via SIWE; shown as `0x…` in `WalletButton`/`Chrome`),
- the **Agent NFT** (Executor / Watcher; identified by tokenId + package hash).

Natural ENS fits, smallest → largest effort:

1. **Reverse-resolve the connected Owner** (read-only, ~1 hour). In the app, after connect, look up the
   primary name of `address` and render it instead of `shortAddr(address)`. Pure UX, no issuance.
   - viem: `publicClient.getEnsName({ address })` (mainnet resolver) + `getEnsAvatar`.
  - Touch points: [app/web/src/WalletButton.tsx](../../app/web/src/WalletButton.tsx), [app/web/src/format.ts](../../app/web/src/format.ts), [app/web/src/Chrome.tsx](../../app/web/src/Chrome.tsx).

2. **Give every Agent a name** = the headline integration. Mint `executor-<id>.intentos.eth` /
   `watcher-<id>.intentos.eth` when the Agent NFT is minted, and store agent metadata in **text records**:
   - `manifestHash` / `packageHash` (binds the human name to the exact Agent Package it must obey),
   - `delegate` (the EIP-7702 impl the owner delegates to),
   - `avatar`, `description` for display.
   - Then the LiveConsole / IntentList show `executor-7.intentos.eth` instead of a tokenId.

3. **Owner-scoped subnames** (optional): `myname.intentos.eth` per Owner EOA, tied to the SIWE login, so
   the per-wallet data scoping we already do is presented as a name.

### 1.3 "What they'd likely ask" (judge expectations)

ENS judges consistently reward **issuance + records**, not just lookup. Expect:

- **"Are you an issuer or just a consumer?"** Resolving an existing `.eth` is table stakes. The strong
  submission **issues subnames** to its own users/agents. → do #2 above (issue `*.intentos.eth`).
- **"Do the names carry data?"** Use **text records** as the agent's identity pointer (manifest hash,
  delegate address), so the name *is* the binding, not decoration.
- **"Primary names everywhere."** They like seeing names replace addresses across the whole UI
  (reverse resolution), including the connected owner and any counterparty.
- **ETHGlobal NY specific**: **ENSv2 / Namechain (L2)** is the new hotness. The "wow" path is issuing
  **L2 subnames via Durin**; the **fast hackathon path** is **offchain subnames** via NameStone/JustaName
  (a REST call to mint `agent-7.intentos.eth`, resolvable through CCIP-Read with zero L1 gas).

### 1.4 Recommended plan (effort vs. impact)

- **MVP (half day):** reverse-resolve the Owner (#1) + issue **offchain** subnames for Agents via
  JustaName/NameStone (#2) with `manifestHash` + `delegate` text records. Show names in LiveConsole.
- **Stretch:** move issuance to **L2 subnames via Durin** for a "real protocol" story.

### 1.5 Guardrail / security notes

- ENS is **identity/labeling only** — it must **never** be in the execution authority path. The contract
  still authorizes on **addresses** (sessionKey, relayer, `address(this)`), never on a resolved name.
  Treat a name as a *display + discovery* convenience that resolves to an address we already trust.
- Text records are public — keep the **same rule as the on-chain `reason` field**: no secrets, no raw
  API responses, no personal data. `manifestHash` (a hash) is fine; a raw manifest is not.

### 1.6 Source links
- Protocol overview: https://docs.ens.domains/learn/protocol
- Issuing subdomains: https://docs.ens.domains/web/subdomains
- Primary names (reverse): https://docs.ens.domains/web/reverse
- Text records: https://docs.ens.domains/web/records
- Naming contracts: https://docs.ens.domains/web/naming-contracts
- Durin (L2 subnames): https://durin.dev/
- Offchain registrar OSS: https://github.com/gskril/ens-offchain-registrar

---

## 2. Uniswap API — better quoting/routing without breaking the guard

### 2.1 What we use today

IntentOS executes swaps via the **on-chain v3 "Smart Contracts (Native)" path**:
- **Quote**: Uniswap **QuoterV2** (v3), single-hop, fixed fee 500, via `eth_call`
  — [packages/runtime/src/quote.ts](../../packages/runtime/src/quote.ts) (`quoteExactInputSingle`).
- **Execute**: **SwapRouter02** `exactInputSingle` — and crucially the **hard guard allow-lists exactly
  this target + selector** (`router` + `selector = 0x04e45aaf`) in `HardGuardState`. The contract reverts
  anything else.

So our security model is: *the agent can only ever call SwapRouter02.exactInputSingle, USDC↔WETH, within
caps.* Any Uniswap upgrade must respect that allow-list (or deliberately, boundedly, extend it).

### 2.2 The four Uniswap integration methods (developers.uniswap.org)

| Method | What it is | Fit for IntentOS |
| --- | --- | --- |
| **Custom Linking** | Deep-link to app.uniswap.org with prefilled params | ❌ not programmatic execution |
| **Trading API** (hosted) | REST: `/check_approval` → `/quote` → `/swap` (or `/order` for UniswapX). Routes across v2/v3/v4/UniswapX, returns calldata | ✅ great for **quoting/routing**; ⚠️ execution calldata targets Universal Router (see guard tension) |
| **TypeScript SDK** (v4) | Local routing + quoting; `PoolKey`, Quoter via `callStatic` | ✅ alt to QuoterV2 for v4 pools, no hosted dep |
| **Smart Contracts** (Universal Router / PoolManager) | Onchain command-encoded swaps | = our current path, but v4/Universal Router |

Trading API flow (`/docs/trading/swapping-api/getting-started`):
1. `/check_approval` — is Permit2 / router approved for the input token? If not, returns a tx to sign.
2. `/quote` — best route + quote; you pass a `protocols` array (v2/v3/v4/UniswapX).
3. `/swap` — returns **fully-formed transaction calldata** (gasful, classic pools), **or** `/order` for
   UniswapX RFQ (gasless, market-maker filled).
4. You sign + submit. API keys: https://developers.uniswap.org/dashboard.

### 2.3 How to add it — two options, very different guardrail impact

**Option A — Trading API as the QUOTE/ROUTER brain only (recommended, low risk).**
Use `/quote` to replace/augment QuoterV2 in the **off-chain reasoning + price-discovery layer**
([quote.ts](../../packages/runtime/src/quote.ts)), getting multi-hop / multi-version best price and a
trustworthy `quotedAmountOut` for `minAmountOut` / slippage. **Keep execution exactly as today**:
the SessionKey still signs an `ExecutionRequest` and the relayer still calls the guard-allow-listed
`SwapRouter02.exactInputSingle`. The guard is untouched; we just quote smarter.
- Pro: zero guardrail change, immediately demoable, honors the "tiny amounts" test policy.
- Con: we only *price* via the API; execution stays single-pool v3 (the route the API picked may differ
  from the pool we actually trade — acceptable for MVP since the pair/fee is fixed).

**Option B — Trading API for EXECUTION (`/swap` calldata).**
Use `/swap` calldata to actually execute. **This breaks the current guard**, because `/swap` returns
**Universal Router** calldata, while the guard only allows `SwapRouter02.exactInputSingle`. To do this
safely we would have to **extend `HardGuardState`'s target+selector allow-list** to the Universal Router
and constrain the allowed command set + token path — a real guardrail change that must stay bounded
(still USDC↔WETH, still caps, still slippage, still expiry). This is a v2 design item, not a quick add.
- Pro: real best-execution across v2/v3/v4/UniswapX.
- Con: significant guard redesign; larger audit surface; do **not** rush for the hackathon.

### 2.4 "What they'd likely ask" (judge expectations)

- **"Are you routing or just hardcoding a pool?"** Today we hardcode v3 fee-500. Using the **Trading API
  `/quote`** (Option A) directly answers this — real routing across versions — without risking the guard.
- **"v4?"** The SDK/Trading API reaching v4 pools is a plus; mention Universal Router as the execution
  evolution path (Option B) even if we ship Option A.
- **Agent angle**: Uniswap now ships **"Agent skills"** (`npx skills add uniswap/uniswap-ai --skill
  swap-integration`) — framing our Executor Agent as consuming Uniswap's agent tooling is on-narrative.

### 2.5 Caveats (important)

- **UniswapX minimums**: quotes via UniswapX require **≥ ~1,000 USDC equivalent on L2 (Base)**. Our test
  policy is **tiny amounts (~0.001 USDC)**, which will return **"No quotes available"** from UniswapX.
  → restrict the `protocols` array to **classic AMM (v2/v3/v4)**, not UniswapX, for our amounts.
- **Slippage**: never pass `amountOutMinimum = 0`. We already derive `minAmountOut` from the guard's
  `slippageCapBps`; keep that as the source of truth even if the API suggests a number.
- **API key handling**: the Uniswap API key is a **server-side secret** — route it through the existing
  keyless proxy pattern (Secret Manager + server fetch), never ship it in the browser or the activation
  kit (same rule that produced `POST /api/rpc`).

### 2.6 Recommended plan
- **Ship Option A**: add a `quoteViaUniswapApi()` alongside `quoteExactInputSingle()`, server-side, keyed
  from Secret Manager, `protocols` = AMM only; feed its output into `quotedAmountOut`. Guard unchanged.
- **Document Option B** as the "best-execution v2" path requiring a bounded Universal-Router allow-list
  extension in `HardGuardState`.

### 2.7 Source links
- Trading overview (4 methods): https://developers.uniswap.org/docs/trading/overview
- Swapping API getting started: https://developers.uniswap.org/docs/trading/swapping-api/getting-started
- API reference (`/quote`, `/swap`, `/check_approval`): https://developers.uniswap.org/docs/api-reference
- Supported chains (UniswapX minimums): https://developers.uniswap.org/docs/trading/swapping-api/supported-chains
- API keys: https://developers.uniswap.org/dashboard
- Agent skills: https://developers.uniswap.org/docs/uniswap-ai/skills

---

## 3. TL;DR

- **ENS**: don't just resolve — **issue `*.intentos.eth` subnames** (offchain via JustaName/NameStone for
  speed, or L2 via Durin for the "real" story) and put `manifestHash` + `delegate` in **text records**;
  reverse-resolve the Owner so the UI shows names. ENS stays **identity-only**, never in the auth path.
- **Uniswap API**: adopt the **Trading API `/quote`** as the routing brain (Option A) — smarter pricing,
  **zero guardrail change**, server-side key. Full `/swap` execution (Option B) needs a bounded
  Universal-Router allow-list extension and is a v2 item. Exclude UniswapX for tiny test amounts.
