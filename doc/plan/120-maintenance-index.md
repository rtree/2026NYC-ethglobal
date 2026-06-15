# 120 — Maintenance Plan Index

This file organizes the post-hackathon planning surface under `doc/`. The old numbering remains
stable; new work should be filed as SDD updates or Issue documents.

## 0. Current repository shape

```text
app/
  web/                 React + Vite control panel
  agent/
    openclaw/          Cloud Run OpenClaw gateway wrapper
packages/
  shared/              Shared TS types, config, ABIs, KMS signer
  runtime/             Quote, request build/sign, relayer, executor helpers
  server/              Control-plane API + static web serving
contracts/             Foundry contracts and tests
deployment/            Public deployment addresses (no secrets)
doc/                   North Star, SDD, issues, mocks, deck
scripts/               Build/deploy/operator scripts
```

## 1. Source of truth layers

| Layer | Files | Purpose |
|---|---|---|
| North Star | [000-northStar.md](000-northStar.md), [000-northStar-en.md](000-northStar-en.md) | Product direction. JP file is source of truth; EN file mirrors it. |
| Seam Freeze | [010-interfaces.md](010-interfaces.md) | Shared vocabulary, data contracts, state machines, API surfaces. |
| SDD | [020-sdd-overview.md](020-sdd-overview.md), [030-sdd-contracts.md](030-sdd-contracts.md), [040-sdd-runtime.md](040-sdd-runtime.md), [050-sdd-frontend.md](050-sdd-frontend.md) | Current system design by component. Update these when an Issue changes contracts/runtime/frontend behavior. |
| QA / evidence | [060-journey-coverage.md](060-journey-coverage.md), [070-qa-register.md](070-qa-register.md) | Regression matrix, live readiness, known gaps, operational traps. |
| Research / change plans | [080-refactor-per-user-7702.md](080-refactor-per-user-7702.md), [090-openclaw-runtime-design.md](090-openclaw-runtime-design.md), [100-sponsor-integrations.md](100-sponsor-integrations.md), [110-worldid-integration.md](110-worldid-integration.md) | Deep dives and implementation plans that informed the MVP. |
| Issues | `130-issue-*.md` onward | Product/engineering tasks with clear status, scope, acceptance criteria, and SDD touchpoints. |

## 2. Maintenance rules

- Do not erase hackathon history. Mark superseded assumptions as historical and link the Issue that
  changes them.
- Each product change starts as an Issue. The Issue decides which SDD files must be updated.
- SDD files describe the design that code should converge to. Issues describe the work to get there.
- If an Issue changes a shared type, state, API, or authority boundary, update [010-interfaces.md](010-interfaces.md)
  in the same slice.
- If an Issue changes live operations, update [070-qa-register.md](070-qa-register.md) with a check or a
  closure note.
- Keep [000-northStar.md](000-northStar.md) Japanese. All other new planning documents stay English.

## 3. Current code assets to preserve

These are implementation facts observed from the codebase at the start of maintenance:

- `app/web`: React/Vite control panel with Web3 login, Firebase custom token auth, IntentBuilder, Launch wizard,
  Live Console, and World ID gate hooks.
- Control-plane server with `/api/config`, Web3 auth, World ID verification, Firestore-backed intent
  store, Intent package FIXing, runtime records, OpenClaw calls, and guarded trade APIs.
- Runtime package with Base clients, Uniswap quote path, ExecutionRequest builder, KMS signing,
  relayer submission, receipt-status checks, and bounded executor helpers.
- Solidity contracts for `ExecutionDelegate7702`, `AgentNFT`, and shared IntentOS types.
- Cloud Run deployment scripts and `app/agent/openclaw` OpenClaw gateway wrapper.

## 4. Current product pivot

Maintenance begins with [130-issue-pivot-x402-funded-executor.md](130-issue-pivot-x402-funded-executor.md).
The new product direction is an x402-funded Executor-only TradingAgent:

```text
x402 payment received
  -> Agent Fund is credited
  -> Intent screen opens
  -> Intent is FIXed
  -> Executor Agent NFT is spawned
  -> Cloud Run Executor runtime trades from the paid Fund
  -> NFT transfer moves the remaining Fund / claim / runtime authority
  -> public ERC-8004 / EIP-8004 registration is published when stable
```

Watcher work is explicitly parked. Existing Watcher code and docs remain useful research, but they are
not on the first maintenance critical path.

## 5. Issue document template

Use this structure for new `NNN-issue-<slug>.md` files:

```md
# NNN — Issue: <title>

Status: Proposed | In progress | Blocked | Done
Priority: P0 | P1 | P2
Created: YYYY-MM-DD

## Problem

## Product decision

## Current code facts

## Scope

## Non-goals

## Design notes

## SDD touchpoints

## Acceptance criteria

## Work slices

## Open questions
```

## 6. Team operating model

- Manager: keeps Issues small, ordered, and tied to the North Star.
- Tech lead: owns authority boundaries, code reuse decisions, and SDD consistency.
- Researcher: resolves external protocol questions such as x402 and ERC-8004/EIP-8004 publication.
- Planner: turns decisions into work slices and acceptance criteria.
- Worker: implements one slice at a time and verifies it against QA rows.
