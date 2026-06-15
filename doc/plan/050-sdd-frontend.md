# IntentOS — SDD 3: Frontend (dApp)

The UX layer (010 §3): how the human experiences the system. Anchors: [010 §15](010-interfaces.md)
(screen list) and the realized screens in [/mock](../mock). This SDD turns the static mocks into a
live app **without changing their vocabulary** (terminal states, guard fields, tool names are
contract/UI-shared — 010 §13/§14).

Stack: **React + Vite + TS**, `wagmi`/`viem`, World ID **IDKit**. The app **reuses
[mock/styles.css](../mock/styles.css) as-is** — the mocks are the visual target, so styling carries
straight over.

## 1. Routes -> mocks (010 §15)

| Route | Mock | Purpose |
| --- | --- | --- |
| `/` (onboarding) | [010-onboarding.html](../mock/010-onboarding.html) | wallet connect + World ID gate |
| `/intents` | [020-intent-list.html](../mock/020-intent-list.html) | 1 active Intent + history |
| `/launch` | [030-launch-dashboard.html](../mock/030-launch-dashboard.html) | card hub; required vs optional |
| `/launch/intent` | [040-intent-creation.html](../mock/040-intent-creation.html) | IntentBuilder -> package -> mint |
| `/launch/identity` | [050-agent-identity.html](../mock/050-agent-identity.html) | ENS + ERC-8004 registration |
| `/launch/runtime` | [060-runtime-funding.html](../mock/060-runtime-funding.html) | spawn + fund gas vault |
| `/launch/watcher` | [070-watcher-creation.html](../mock/070-watcher-creation.html) | optional Watcher, quorum=1 |
| `/launch/start` | [080-start.html](../mock/080-start.html) | preconditions + launch |
| `/dashboard` | [090-owner-dashboard.html](../mock/090-owner-dashboard.html) | shared execution timeline |
| `/watcher` | [100-watcher-dashboard.html](../mock/100-watcher-dashboard.html) | evidence review + vote |
| `/result` | [110-result.html](../mock/110-result.html) | terminal state + performance |

---

## 2. Wallet & EIP-7702 flows (browser-only, 010 §6.1 of North Star)

The only local secrets are the Owner's wallet. The app prompts the Owner to sign three distinct
things; everything else runs server/chain-side.

```text
A. EIP-7702 authorization  : viem signAuthorization(delegateImpl) -> Owner EOA runs ExecutionDelegate7702
B. initialize              : tx initialize(CONSTRAINTS.json -> HardGuardState, sessionKey, relayer, hashes)
C. mint / fund             : mintExecutor/mintWatcher (AgentNFT) ; fundGasVault{value}(lane)
```

`viem` handles 7702 (`signAuthorization` + type-4 tx). The SessionKey is **not** the wallet — it is a
KMS key (SDD 040 §4); the app only passes its derived address into `initialize`.

---

## 3. Screen specifics

- **010 Onboarding**: `wagmi` connect -> World ID IDKit widget -> on success call
  `registry /runtime/...` gate token. Block progress until proof verified (010 §2 abuse gate).
- **040 IntentBuilder**: chat UI -> backend compiles to an Agent Package; render SUMMARY, **Hard
  Guardrails (010 §9 fields)** and **Semantic Guardrails** read-only previews + `packageHash`. "Mint
  Executor Agent NFT" triggers flow §2.C then §2.A/B. Hard fields shown exactly as burned 1:1 into
  `HardGuardState`.
- **050 Identity**: after mint, show `tokenId`, create `agent-<tokenId>.intentos.base.eth` (010 §2),
  set ENSIP text records + ERC-8004 registration JSON; put ENS name in `tokenURI`.
- **060 Runtime/Funding**: `POST /runtime/spawn`; render `RuntimeRecord` (status/heartbeat/lane refs);
  `fundGasVault` for the executor lane; show estimated cost / refund policy.
- **070 Watcher (optional)**: mint Watcher NFT bound to the Executor `tokenId`/`intentId`/hashes
  (010 §6), set quorum=1, spawn WatcherRuntime, fund the **watcher lane** (separate).
- **080 Start**: precondition checklist (package bound, HardGuardState initialized, identity set,
  World ID, executor lane funded, watcher quorum+gas if attached). Enable "Start" -> RUNNING (010 §13).
  Offer "Start Executor-only" branch.
- **090 Owner Dashboard**: the shared timeline (§4). Owner controls: top-up gas, review watcher, stop.
- **100 Watcher Dashboard**: list `EvidenceCommitted` + `reason` + hashes; judge vs Semantic
  Guardrails; buttons map to `vote_tighten` / `vote_freeze` (executed by the WatcherRuntime, not the
  browser — the dashboard reflects state and can trigger the runtime).
- **110 Result**: terminal state (010 §13) + performance (USDC value before/after, net delta, token
  delta, gas/runtime cost) + final guard + vault refund.

---

## 4. Data sources & the shared timeline

No subgraph in MVP (SDD 020 §3). The dashboards compose from RPC + Registry:

```text
contract reads (viem)     : guard(), cumulativeSpent(), gasVaults()         -> guardrail panel, balances
getLogs(EvidenceCommitted): decode action/hashes/reason (010 §11)            -> timeline rows
registry REST             : RuntimeRecord, AgentLoop log, package summary    -> log panel, status
```

The shared execution timeline (mock 090) is the merge of EvidenceCommitted events + Watcher vote
events (`GuardTightened`/`GuardFrozen`) ordered by block/time — Executor decision, quote/sim, request,
EvidenceCommitted, watcher review, contract state update (010 §11 / North Star §2).

---

## 5. Shared types & vocabulary (010 §13/§14)

```text
import { TerminalState, HardGuardState, ExecutionRequest, EvidenceCommitted } from "@intentos/shared"
```

`@intentos/shared` (SDD 020 §2) is the single TS mirror of the frozen structs, derived from the
contract ABI. The UI uses the **exact** terminal-state strings (`running / tightened / frozen /
self-stopped / owner-stopped / fund-exhausted / transferred`) as CSS status classes — already present
in `mock/styles.css` as `.pill.<state>`. No synonyms downstream (010 §13).

---

## 6. Backend API the app calls

```text
registry/  : /runtime/spawn|resume|rebind|stop|heartbeat, GET /runtime/:tokenId, intent CRUD (1 active)
adapter/   : IntentBuilder compile (chat -> Agent Package + packageHash), package preview
(chain)    : direct reads/writes via viem; reads of EvidenceCommitted via getLogs
```

Writes that move funds or change authority always go to the **contract** (signed by Owner wallet or,
for execution, the SessionKey via adapter/relayer) — never a privileged backend mutation (010 §5).

---

## 7. Build notes

- Reuse `mock/styles.css` verbatim as the app stylesheet; port each `mock/NNN-*.html` into a React
  route component, replacing static data with the §4 data sources. The mock is the acceptance target.
- World ID IDKit on the onboarding gate only.
- Keep the app a thin view over chain state: the dashboards should be reconstructable purely from
  on-chain events + RuntimeRecord, matching "evidence is canonical onchain" (010 §14).

---

## 8. M5 — IA v2, auth, IntentBuilder (supersedes §1 routing for the live app)

The 11 mocks remain the **component source**, but the live app collapses to **3 destinations**
(010 §15.1). Routing v2:

| Route | Destination | Replaces |
| --- | --- | --- |
| `#/` | Onboarding | `/` |
| `#/intents` | Intents hub + history | `/intents` |
| `#/launch` | **single-screen master/detail wizard** | `/launch*` (030–080) |
| `#/console` | Live Console (Owner+Watcher+Result) | `/dashboard` + `/watcher` + `/result` |

- **Active Intent is session/agent-scoped** (`state.session.executorTokenId`), never the permanent
  on-chain 7702 `delegated` flag (the demo Owner stays delegated forever). Helpers
  `hasActiveIntent()` / `activeStatus()` in `useChainState.ts` are the single source for the pill.
- **Launch wizard** (`#/launch`): left step-nav (`useState` selected step, no route hops), right pane
  swaps controls harvested from mocks 040/050/060/070/080. Steps ①–⑤ per 010 §15.1. Footer gates
  "Start" on required steps. Identity (ENS + ERC-8004) is rendered **inline** in steps ②/③.
- **IntentBuilder** (step ①): chat posts to `/api/intent/chat`; the right pane shows the dual
  AgentPackage preview (Executor + Watcher) re-rendered each turn from the returned drafts; each card
  has a **FIX** button (`/api/intent/fix`). Falls back to the scripted conversation when the backend
  returns `llm:"mock"`. The browser never calls Vertex directly (010 §18 security).
- **Auth (Web3 → Firebase, 010 §17):** after wallet connect, `gate.ts` runs the SIWE handshake
  (`/api/auth/nonce` → wallet sign → `/api/auth/web3` → `signInWithCustomToken` REST) and stores the
  Firebase ID token in memory; `api.ts` attaches it as `Authorization: Bearer` and refreshes via the
  securetoken REST endpoint. No `firebase` SDK; `VITE_FIREBASE_API_KEY` + `VITE_FIREBASE_PROJECT_ID`
  are public build-time vars (key restricted to identitytoolkit+securetoken). `INTENTOS_AUTH=off`
  short-circuits the handshake for dev/e2e.
- **Live Console** (`#/console`): one screen = guard + vaults + balances + shared timeline (090) +
  Owner controls trade/resume (090) + Watcher controls freeze/tighten (100); when stopped it renders
  the Result/performance summary (110) in place. History list links each past Intent here.
