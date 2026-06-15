# 150 — Issue: Registry-First OpenClaw Agent and Intent Concierge

Status: Proposed
Priority: P0
Created: 2026-06-15

Related: [130-issue-pivot-x402-funded-executor.md](130-issue-pivot-x402-funded-executor.md), [140-research-x402-receipt-agentfund.md](140-research-x402-receipt-agentfund.md)

## Problem

The x402-funded Executor pivot still had a screen-shaped entry path in several places. That pulls the
work back toward the hackathon panel and makes it too easy to prove progress with UI state instead of a
live funded Agent.

The product should be discoverable as an Agent/service resource. A buyer or another Agent should find
it through ERC-8004 registry metadata, pay through x402, optionally use a prepaid Intent Concierge to
FIX a usable OpenClaw package, receive an on-chain Receipt NFT, and let Cloud Run run real OpenClaw
ticks from the AgentFund.

## Product decision

Make the first product path registry-first and API-first.

```text
ERC-8004 registry discovery
  -> x402 prepaid Intent Concierge or direct funded Intent
  -> Concierge returns executable OpenClaw AGENT.md / manifest / guardrails
  -> x402 funding settles into AgentFund
  -> AgentReceiptNFT mints with IPFS-free on-chain image
  -> Cloud Run starts real OpenClaw runtime
  -> OpenClaw ticks bounded AgentLoop internally
  -> AgentFund executes/rejects guarded actions on-chain
  -> Receipt holder can redeem and refund remaining assets
```

The React panel is optional. It may be kept for debugging or operator visibility, but it is not the
acceptance surface for this Issue.

## Current code facts

- [app/web/src/LaunchFlow.tsx](../../app/web/src/LaunchFlow.tsx) is screen-first and useful mostly as a
  debug/status reference after this pivot.
- [packages/server/src/intent.ts](../../packages/server/src/intent.ts) already has chat/package FIXing
  concepts, but the product needs an x402-prepaid HTTPS Concierge instead of panel-gated chat.
- [packages/server/src/openclaw.ts](../../packages/server/src/openclaw.ts) and
  [app/agent/openclaw](../../app/agent/openclaw) are the current OpenClaw integration surfaces, but the
  acceptance path must tick real OpenClaw AgentLoop on Cloud Run.
- [contracts/src/AgentNFT.sol](../../contracts/src/AgentNFT.sol) has ERC721 identity foundations, but
  its metadata is not yet an IPFS-free on-chain avatar and its Fund semantics are not Receipt-grade.
- [packages/server/src/journey.ts](../../packages/server/src/journey.ts) has runtime records and tick
  concepts, but they are still too tied to control-panel request flow for the product target.

## Scope

- Define an ERC-8004 / EIP-8004-compatible registry artifact for the funded TradingAgent.
- Expose x402 resource metadata for Concierge and direct funding.
- Build an x402-prepaid Intent Concierge HTTPS API.
- Generate fixed-form OpenClaw package outputs: `AGENT.md`, tool manifest, guardrail summary, risk
  constraints, package hash.
- Bound Concierge usage by prepaid balance, conservative character-based token estimates, and maximum
  output sizes.
- Add an IPFS-free on-chain Receipt NFT metadata/image direction.
- Make Cloud Run start/tick real OpenClaw AgentLoop with bounded runtime costs.
- Keep all acceptance tied to AgentFund / Receipt / runtime state, not screen state.

## Non-goals

- Rebuilding the React panel as the primary product path.
- Watcher runtime, Watcher quorum, or semantic freeze/tighten.
- Free-form long-content generation as a Concierge product.
- IPFS, centralized image hosting, or mutable off-chain NFT metadata for the Receipt.
- Infinite Cloud Run loops, always-on unbounded containers, or unmanaged model spend.

## Design notes

### 1. Registry resource shape

The registry artifact should let a buyer or another Agent discover everything needed without opening a
panel:

```text
agentId / registrationId
role: Executor TradingAgent
network: eip155:8453
paymentAssets: Base USDC first
x402Resources:
  - intentConcierge
  - directFunding
contracts:
  receiptNft
  agentFund
endpoints:
  concierge
  status
  evidence
  redeemInstructions
package:
  currentPackageHash
  agentMdHash
  toolManifestHash
guardrails:
  supportedPairs
  caps
  maxRuntimeTicks
```

Until an external ERC-8004 registry integration is stable, this can be a signed JSON artifact and a
contract/event draft. It must still match the final fields closely enough that code does not drift.

### 2. Intent Concierge

Concierge is a paid API, not a free chat screen. It uses x402 before returning useful work.

The first pricing model can be simple:

```text
prepaidBalanceUsd
estimatedInputTokens = ceil(inputChars / 4)
estimatedOutputTokens = min(maxOutputChars / 4, configuredOutputTokenCap)
estimatedCost = inputTokens * inputRate + outputTokens * outputRate
price = estimatedCost * smallMarkup
```

Use conservative constants based on Gemini 3.1 flash-lite global or the closest available production
model price. The exact constants should live in server config, not inside prompt text.

Concierge must cap:

- max request chars;
- max response chars;
- max `AGENT.md` section chars;
- max tool manifest entries;
- max iterations per paid session;
- max total estimated tokens per prepaid balance;
- max package size.

The output must be fixed-form and executable by OpenClaw. If the user asks for huge prose, the
Concierge should compress it into intent constraints or reject it as outside package scope.

### 3. On-chain avatar

Receipt NFT metadata must be self-contained:

```text
tokenURI(tokenId)
  -> data:application/json;base64,{ name, description, attributes, image }

image
  -> data:image/svg+xml;base64,<svg ... pixel art ...>
```

The visual system should be NounsDAO-inspired in mechanism, not a copy of its art: compose a small set
of original pixel parts from seed/traits. The first style is a cute pixel-art girl Agent. Traits can
include hair, eyes, accessory, outfit, palette, status glow, and agent class.

### 4. Real OpenClaw runtime

Cloud Run completion means OpenClaw itself runs the AgentLoop:

```text
load runtime binding(tokenId)
load AGENT.md + manifest
start OpenClaw runtime
run one bounded tick or small tick batch
collect tool/action proposal
adapter builds typed guarded request
AgentFund executes or rejects
persist heartbeat/evidence/spend
```

Every tick must check current Receipt ownership / binding nonce / fund status before spending. A
transfer or redeem must structurally stop old runtime authority.

## SDD touchpoints

- [000-northStar.md](000-northStar.md): registry-first, Concierge, on-chain image, real OpenClaw.
- [010-interfaces.md](010-interfaces.md): registry artifact, x402 resources, Concierge session,
  package output, Receipt metadata, runtime tick state.
- [020-sdd-overview.md](020-sdd-overview.md): replace screen-first sequence with registry/API-first
  sequence.
- [030-sdd-contracts.md](030-sdd-contracts.md): AgentReceiptNFT metadata renderer and AgentFund binding.
- [040-sdd-runtime.md](040-sdd-runtime.md): real OpenClaw Cloud Run AgentLoop driver and cost bounds.
- [050-sdd-frontend.md](050-sdd-frontend.md): mark frontend as optional debug/status UI.
- [070-qa-register.md](070-qa-register.md): add registry discovery, Concierge accounting, on-chain
  image, and real OpenClaw tick checks.

## Acceptance criteria

- A registry artifact exposes the funded TradingAgent, x402 resources, Concierge endpoint, status /
  evidence endpoints, Receipt NFT contract, and AgentFund contract.
- x402-prepaid Concierge sessions can produce a deterministic OpenClaw package with `AGENT.md`, tool
  manifest, guardrail summary, risk constraints, and package hash.
- Concierge usage is bounded by prepaid balance, character-based token estimates, configured markup,
  max output chars, max package size, and max iterations.
- A local Anvil slice can mint an AgentReceiptNFT whose `tokenURI` and image resolve without IPFS.
- The generated avatar is original NounsDAO-style compositional pixel art, with the first direction set
  to a cute pixel-art girl Agent.
- Cloud Run can run a bounded real OpenClaw AgentLoop tick from the generated package.
- The tick can produce a guarded action that AgentFund executes or rejects on-chain.
- Runtime authority is checked against Receipt owner, binding nonce, and fund status before each spend.
- Transfer or redeem invalidates old runtime authority.
- No acceptance criterion depends on panel-local state or mock screens.

## Work slices

1. Define registry artifact JSON and x402 resource metadata.
2. Add Concierge payment/session interfaces to [010-interfaces.md](010-interfaces.md).
3. Implement local x402-prepaid Concierge endpoint with character-based accounting and output caps.
4. Generate fixed-form `AGENT.md` / manifest / guardrail package from Concierge.
5. Add AgentReceiptNFT on-chain metadata/image renderer contract slice.
6. Add local Anvil mint/tokenURI test for the Receipt avatar.
7. Wire Cloud Run/OpenClaw service to load the generated package and tick one bounded AgentLoop.
8. Connect tick output to AgentFund guarded execution/rejection.
9. Add registry/status/evidence endpoint backed by real contract/runtime state.
10. Update SDD and QA rows after the real slice proves the shape.

## Open questions

- Which ERC-8004 registry implementation or draft interface should be the first external target?
- Should Concierge and direct funding be separate x402 resources or one `upto` resource with usage
  lanes?
- Which exact Gemini 3.1 flash-lite global price table should seed the default constants, and how often
  should it be reviewed?
- Should the on-chain image be pure SVG rectangles, compressed pixel data, or a small renderer library?
- Should Receipt redeem return all assets as-is, or attempt a bounded swap back to the payment asset?
- Should Cloud Run ticks be driven by Scheduler, Tasks, Jobs, or a dedicated runtime service lease?