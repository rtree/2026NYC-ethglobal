# IntentOS — Task & Workflow

This file records **how we build**, so the plan survives across sessions and context resets.
The product target is defined in [plan/000-northStar.md](plan/000-northStar.md) (Japanese, source of truth)
and mirrored in [plan/000-northStar-en.md](plan/000-northStar-en.md) (English).

MVP scope is **B: Executor + single Watcher** (see North Star section 6):
Owner Natural Intent -> Executor Agent guarded-executes USDC<->WETH on Base mainnet inside
Hard Guardrails -> a single Watcher Agent reads the evidence and can only tighten / freeze.
Everything runs on Base mainnet + Cloud Run / GCP; the only thing on the Owner's local PC is the browser.

---

## Build Order: Seam Freeze -> Mock -> SDD

We do **not** write one big SDD up front. We freeze the shared interfaces first, then mock the
screens, then write the SDD per component. This keeps each task small enough to fit in one working
context and prevents the failure modes below.

```text
1. Seam Freeze (small, first)
     One file that fixes the shared vocabulary every later task depends on:
       - Result state machine (running / tightened / frozen / self-stopped /
         owner-stopped / fund-exhausted / transferred)
       - EvidenceCommitted event fields
       - Agent Package manifest.json shape
       - intentos.* typed tool list (Executor + Watcher)
       - RuntimeRecord / RuntimeBinding shape
       - Screen list (from North Star section 2)
     Almost nothing is newly invented; it is gathered from the North Star.

2. Mock (per screen)
     The screens are already enumerated in North Star section 2, so we draw them without
     inventing structure. Each screen pins down which state / which hash / which balance it
     shows. That becomes the data contract for the SDD. For a hackathon, the mock doubles as
     the implementation target.

3. SDD (per component)
     Written against the frozen interfaces (1) and the real screens (2), so it does not drift
     in types and does not over-design. One vertical slice only (B scope):
     contract -> runtime / relayer -> frontend.
```

### Why this order (LLM failure modes we are avoiding)

- **Writing the whole SDD at once** forces holding contracts + EIP-7702 + KMS + relayer + runtime +
  frontend in one context. Late in the context we forget early type definitions, so field names and
  state names **drift between sections**, and we **over-design** interfaces nobody uses yet.
- **Mocking before the data contract exists** lets each screen **invent its own fields**, which all
  has to be redone later.
- Freezing the **narrow waist (shared seam) first** means every later task reads only "the seam +
  its own component", so each unit of work stays small and consistent. The mock is also a
  *forcing function* that makes the data contract concrete before the SDD is written.

**Direct answer to "mock or SDD first": mock first, with a small Seam Freeze in front of it.**

---

## Conventions

- **Languages**: `plan/000-northStar.md` stays Japanese (team is mostly Japanese-only).
  Every other doc, mock, and file from now on is written in **English** (global hackathon).
  `plan/000-northStar-en.md` is the English mirror of the North Star.
- **File numbering**: plan files increment by **10** (`000-`, `010-`, `020-`, ...).
- **Git cadence**: pull, then commit and push to remote (origin) at every natural breakpoint —
  roughly every ~500 lines written or ~5 new files. Keep history small and frequent.

---

## Task Board

### Done
- North Star sections 0-6 + Agent NFT Model written (Japanese), cleanup pass applied.
- MVP scope fixed to B (Executor + single Watcher, quorum=1, USDC<->WETH, Base mainnet + Cloud Run).
- English mirror `plan/000-northStar-en.md` created.
- **Seam Freeze** -> `plan/010-interfaces.md` (English): types, EvidenceCommitted, manifest, intentos.*
  tools, RuntimeRecord/Binding, guardrail enforce order, terminal states, screen list.
- **Mocks** -> `mock/` (English): design system (`styles.css`), `index.html` hub, `README.md`, and
  11 screens `010-110`. Validated in browser: 0 console errors, all internal links resolve,
  responsive grid OK. Fonts scaled up + container made fluid to fill wide screens at 100% zoom.
- **SDD** (per component, English), anchored to `010-interfaces.md` sections + `mock/` screens:
  - `020-sdd-overview.md` — scope, repo layout, stack, end-to-end sequences, build order M0-M3.
  - `030-sdd-contracts.md` — ExecutionDelegate7702 + AgentNFT (Solidity/Foundry).
  - `040-sdd-runtime.md` — registry, OpenClaw runtime, adapter (intentos.*), relayer, KMS.
  - `050-sdd-frontend.md` — React/Vite dApp, routes -> mocks, data sources.

### Next
1. **Implementation** following SDD build order M0-M3 (contracts -> runtime slice -> frontend ->
   watcher). Scaffold the monorepo (pnpm workspace + Foundry) per `020-sdd-overview.md` §2.

---

## Implementation log

Safety configured: `.npmrc` (ignore-scripts, audit, min-release-age=7d), `pnpm-workspace.yaml`
(`minimumReleaseAge: 10080` = 7d, `trustPolicy: no-downgrade`, `onlyBuiltDependencies: []`),
`.gitignore` (secrets/keys/env/ADC blocked), `.github/copilot-instructions.md` (policy + project
facts). GCP project switched to `ethglobal-nyc2026-rtree`.

- **M0 — contracts (DONE, Foundry, 27 tests passing)**
  - `contracts/src/IntentOSTypes.sol` — frozen structs/errors/event (mirrors 010 §9/§11).
  - `contracts/src/ExecutionDelegate7702.sol` — EIP-7702 delegate: initialize, submitExecutionRequest
    (full §9 check order), previewGuard (eth_call feedback loop §12), gas-lane reimbursement,
    watcherTighten/watcherFreeze (monotonic), ownerStop/ownerUpdateGuard/rotateBinding.
  - `contracts/src/AgentNFT.sol` — ERC721 + ERC-8004 (Executor/Watcher roles).
  - Tests cover every custom error + monotonic watcher + replay + reimbursement + cumulative invariant.
  - NOTE: minor extension to 010 §9 — `ExecutionRequest.reasonHash` binds the evidence `reason` string
    to the signature; submit takes `(r, reason, sig)`. (Strengthens evidence integrity.)
  - TODO(M0): Base fork test for a real Uniswap USDC/WETH swap — needs a Base RPC (see open question).
  - DONE: Base fork smoke test passing (`ExecutionDelegate7702.fork.t.sol`).

- **M1 — runtime slice (core proven, IN PROGRESS)**
  - `packages/shared` — TS mirror of frozen structs, request-digest builder, **GCP KMS Ethereum signer**
    (derives addresses + signs; validated vs HSM keys), config, contract ABIs. Typechecks clean.
  - GCP infra: project `ethglobal-nyc2026-rtree`; APIs enabled; KMS keyring `intentos` with HSM
    secp256k1 keys (executor/watcher SessionKeys); platform wallet key in Secret Manager. Addresses in
    `deployments/base-mainnet.json` (no keys).
  - `packages/runtime` — clients, quote (Uniswap QuoterV2), buildRequest+KMS sign, relayer submit,
    Secret Manager platform-account loader. Typechecks clean.
  - **M1 fork e2e PASSING** (`packages/runtime/test/m1-fork-e2e.ts`): on an anvil Base fork, a
    KMS-signed ExecutionRequest is accepted by ExecutionDelegate7702, swaps 0.001 USDC->WETH via real
    Uniswap, emits EvidenceCommitted, reimburses the relayer. Whole slice with the real signer + real
    Uniswap, no real money.
  - TODO(M1): bounded executor loop (decideSignal + guard->LLM feedback §12) + registry-lite; then the
    single REAL Base mainnet execution (needs funding — see below).
- **M2 — frontend**, **M3 — watcher**: pending.

### Funding needed for the real Base mainnet execution
- Platform wallet `0x078383c4c20b4e9732Ac0c30A68b8123D53ea6C9` — send ~0.005 Base ETH (deploy + relay gas).
- A fresh Owner test wallet (to be generated) — 0.001 USDC + ~0.003 Base ETH (setup gas + gas-vault backing).
- Optional: Alchemy Base URL via `BASE_RPC_URL` (store in Secret Manager / gitignored .env, never in chat).
