# 130 — Issue: Pivot to x402-Funded Executor TradingAgent

Status: Proposed
Priority: P0
Created: 2026-06-15

Research note: [140-research-x402-receipt-agentfund.md](140-research-x402-receipt-agentfund.md)

## Problem

The hackathon MVP proved the guarded execution stack, but the product now needs a clearer paid
maintenance path. The original story mixed three hard problems at once:

- per-user EIP-7702 activation and wallet UX;
- long-running Cloud Run runtime orchestration;
- Executor + Watcher dual-agent semantics.

For the next phase, the product should focus on one paid, understandable loop: a TradingAgent receives
payment through x402, turns that payment into the Agent Fund, spawns an Executor Agent NFT after the
Intent is fixed, and runs the Executor on Cloud Run using the paid Fund for gas and trading.

Watcher work is parked. The first product should be Executor-only.

## Product decision

Build an x402-funded Executor TradingAgent.

```text
x402 payment accepted
  -> Agent Fund credited
  -> Intent screen opens
  -> Owner/buyer fixes the Intent and guardrails
  -> Executor Agent NFT is spawned
  -> Cloud Run Executor runtime starts
  -> gas + trading capital are paid from the Agent Fund
  -> if the NFT transfers, the remaining Fund / claim / runtime authority moves with it
  -> once stable, publish the agent registration publicly to the ERC-8004 / EIP-8004 ecosystem
```

The product should feel like buying and funding a live TradingAgent, not configuring a research demo.
The NFT is the transferable handle for the agent's identity, runtime right, and remaining funded
position.

## Current code facts

Reusable assets:

- [contracts/src/AgentNFT.sol](../../contracts/src/AgentNFT.sol) already mints Executor and Watcher NFTs,
  stores `fundOwner`, `intentId`, `executionContract`, package hashes, and tokenURI.
- [contracts/src/ExecutionDelegate7702.sol](../../contracts/src/ExecutionDelegate7702.sol) already
  enforces typed USDC/WETH execution requests, gas-vault accounting, KMS SessionKey signatures, relayer
  submission, and evidence events.
- [packages/runtime/src/buildRequest.ts](../../packages/runtime/src/buildRequest.ts) builds and signs
  typed `ExecutionRequest`s with KMS.
- [packages/runtime/src/relay.ts](../../packages/runtime/src/relay.ts) submits relayed requests and checks
  reverted receipts honestly.
- [packages/server/src/intent.ts](../../packages/server/src/intent.ts) already supports IntentBuilder
  chat, package FIXing, package hashes, and StartConfig.
- [packages/server/src/journey.ts](../../packages/server/src/journey.ts) already has runtime records,
  OpenClaw ticks, guarded trades, and connected-owner logic.
- [packages/server/src/openclaw.ts](../../packages/server/src/openclaw.ts) already calls the private
  OpenClaw gateway through Cloud Run service-to-service auth and an OpenClaw token.
- [packages/server/src/store.ts](../../packages/server/src/store.ts) already persists intents, package
  snapshots, runtime records, and World ID state in Firestore.
- [app/web/src/LaunchFlow.tsx](../../app/web/src/LaunchFlow.tsx) already has a single-screen launch wizard and
  an activation gate.

Facts that conflict with the pivot and must be redesigned:

- Current `AgentNFT` transfer moves identity and runtime usage right only; it does not move funds.
- Current `ExecutionDelegate7702` assumes funds sit in the Owner EOA / delegated account. That model
  does not automatically support "NFT transfer moves Fund with it".
- Current Watcher lane, Watcher package, Watcher votes, and watcher gas vault are MVP/hackathon scope,
  not first-path product scope.
- Current runtime loop is still largely driven through the control panel request path. Product runtime
  needs a real bounded Cloud Run driver (Scheduler, Tasks, Jobs, or a dedicated session service).
- Browser-wallet arbitrary EIP-7702 activation is blocked by injected-wallet limitations; the product
  should not require that path for the x402 paid flow unless we keep the Local Activation Kit or move to
  a smart-account/module design later.

## Scope

This Issue creates the product pivot and the first implementation track. It covers:

- x402 payment acceptance and proof verification;
- an Agent Fund model credited by x402 payment;
- Receipt NFT / Agent NFT semantics for stop-and-refund;
- Intent screen start after successful payment/funding;
- Executor-only Agent Package flow;
- Executor Agent NFT spawn after Intent FIX;
- Cloud Run runtime execution funded from the Agent Fund;
- NFT transfer semantics that move the remaining Fund / claim / runtime authority;
- ERC-8004 / EIP-8004 registration publication after the model is stable.

## Non-goals

- Watcher Agent creation, Watcher runtime, Watcher votes, quorum, or semantic freeze/tighten.
- Multiple Watcher marketplace / reputation / slashing.
- Arbitrary contract calls or arbitrary tokens beyond the first guarded trading pair.
- Unbounded runtime loops or unmanaged Cloud Run spend.
- Browser-only custody of server runtime keys.

## Design notes

### 1. x402 payment and Agent Fund

The x402 payment is not just an access fee. It is the funding event that creates or tops up an
`AgentFund` for a specific pending Intent or spawned NFT.

Minimum fields:

```text
paymentId
payer
asset
amount
network
x402 receipt / proof
fundId
status: pending_intent | active | exhausted | refunded | transferred
createdAt
```

Research must decide whether the Fund initially lives as:

- an on-chain escrow/vault keyed by `tokenId`;
- an off-chain ledger with on-chain settlement boundaries;
- an EIP-7702 account path for advanced users only;
- or a hybrid: x402 payment lands in platform custody, then a bounded on-chain AgentFund contract owns
  the trading capital and exposes only guarded execution.

The transfer requirement strongly points toward an on-chain or contract-account Fund keyed by the NFT,
because EOA-held funds cannot automatically move when an ERC721 transfers.

### 2. NFT transfer must move Fund authority

The current AgentNFT model says transfer does not move custody. The pivot changes this for paid
AgentFunds: transfer must move the remaining Fund claim and runtime authority together.

Likely contract direction:

```text
AgentNFT.ownerOf(tokenId) = current controller
AgentFund.balanceOf(tokenId, asset) = remaining paid Fund
RuntimeBinding(tokenId) valid only while runtimeOwner == ownerOf(tokenId)
transfer tokenId -> old runtime binding invalidated -> new owner can spawn/rebind runtime
withdraw/refund/top-up authority follows ownerOf(tokenId)
```

Implementation options:

- Add transfer hooks in `AgentNFT` that notify an `AgentFund` / `RuntimeRegistry` contract.
- Make `AgentFund` check `ownerOf(tokenId)` at call time, so transfer naturally changes authority.
- Rotate or invalidate runtime binding on transfer to prevent the old owner/runtime from spending the
  transferred Fund.

### 3. Executor-only package

The IntentBuilder should generate and FIX only the Executor package for the first path. Semantic guard
text may remain in the package as human-readable policy, but no Watcher NFT or Watcher runtime is
spawned.

UI implication:

```text
Pay with x402
  -> Intent builder
  -> Executor package preview / edit / FIX
  -> Spawn Executor NFT
  -> Runtime + funding summary
  -> Live Executor console
```

### 4. Runtime on Cloud Run

The product runtime must be bounded and durable:

- no infinite in-process loops;
- no reliance on the user's browser staying open;
- one tick or small tick batch per invocation;
- hard caps on ticks, trades, gas, Vertex calls, and total Fund spend;
- a runtime status source independent of UI state;
- runtime authority checked against current NFT ownership before each spend.

The existing OpenClaw gateway can stay private. The control plane can invoke it or a dedicated runtime
service with Cloud Run IAM plus application-level token auth.

### 5. EIP-8004 / ERC-8004 publication

Once the Fund/NFT/runtime model is stable, publish the agent registration publicly. The registration
should describe:

- agent role: Executor TradingAgent;
- funded-by-x402 status and supported assets;
- current tokenId and owner-controlled runtime authority;
- package hash and current intent summary;
- evidence endpoint / on-chain evidence references;
- Fund transfer semantics;
- supported tool surface and hard guardrails.

This should be prepared as a clean public artifact suitable for the EIP8004 repository after the
implementation stops changing daily.

## SDD touchpoints

Update these after the Issue is accepted:

- [000-northStar.md](000-northStar.md): product direction and Watcher parking.
- [010-interfaces.md](010-interfaces.md): AgentFund, x402 receipt, Executor-only lifecycle, transfer
  invalidation, runtime states.
- [020-sdd-overview.md](020-sdd-overview.md): new paid product sequence and component boundaries.
- [030-sdd-contracts.md](030-sdd-contracts.md): AgentFund / AgentNFT transfer semantics / optional
  ExecutionDelegate reuse.
- [040-sdd-runtime.md](040-sdd-runtime.md): bounded Cloud Run runtime driver and x402-funded spend
  accounting.
- [050-sdd-frontend.md](050-sdd-frontend.md): x402 payment entry, Intent screen, Executor-only launch,
  Fund/NFT transfer UX.
- [070-qa-register.md](070-qa-register.md): close or park Watcher rows; add payment, fund, transfer,
  and runtime-driver QA rows.

## Acceptance criteria

- A user can complete x402 payment and receive a durable `fundId`.
- Payment/fund status gates access to the Intent screen.
- The user can FIX an Executor package without creating a Watcher package.
- The system can spawn an Executor Agent NFT bound to the FIXed package and Fund.
- The Cloud Run runtime can execute bounded BUY/HOLD ticks using the Fund for gas/trading.
- All Fund-spending paths verify current NFT ownership and runtime binding before spending.
- Transferring the NFT makes the old runtime unable to spend and gives the new owner control over the
  remaining Fund/claim.
- The Live Console shows payment, Fund, runtime, trade, evidence, and remaining balance state.
- Watcher UI and write paths are hidden or clearly marked as parked/future on the first path.
- A draft ERC-8004 / EIP-8004 registration artifact exists for the spawned Executor agent.

## Work slices

1. Research x402 integration and choose receipt/payment verification flow. See
  [140-research-x402-receipt-agentfund.md](140-research-x402-receipt-agentfund.md).
2. Define `AgentFund` data model and decide escrow vs ledger vs hybrid custody.
3. Update [010-interfaces.md](010-interfaces.md) with x402 receipt, Fund, transfer, and Executor-only
   lifecycle types.
4. Add frontend payment gate and post-payment Intent entry.
5. Simplify IntentBuilder to Executor-only for the first product path.
6. Add Fund-aware Executor NFT spawn path.
7. Add runtime ownership/Fund checks before each tick/spend.
8. Implement transfer invalidation and new-owner rebind semantics.
9. Update SDD files and QA rows.
10. Prepare public ERC-8004 / EIP-8004 registration draft.

## Open questions

- Which exact x402 provider/API should be used for the first integration?
- What asset should the first x402 payment use, and on which network?
- Is the x402 payment a service fee, trading capital, gas reserve, or all three split into lanes?
- What is the acceptable custody posture for the Agent Fund before a dedicated on-chain Fund contract
  exists?
- Should the initial TradingAgent still trade USDC/WETH on Base, or should the payment asset determine
  the first supported asset path?
- How much of the old EIP-7702 Owner account model remains in the paid flow?
- Should transfer immediately pause the runtime until the new NFT owner explicitly restarts it?
- What should be published to the EIP8004 repository first: spec proposal, reference JSON, or working
  code sample?
