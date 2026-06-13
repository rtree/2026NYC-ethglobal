# MVP QA register

This file tracks MVP readiness gaps that are easy to miss in build-only checks. Add one row per
issue, then add or update an automated check so similar UI/API wiring regressions are caught.

## Review rule

When one issue is found, search for the same pattern across the app:

1. UI controls: every button that mutates state must map to an `api.*` client method, a server route,
   and a backend implementation that performs the advertised action.
2. UI data: every non-label value shown to the user must come from `/api/state`, `/api/intents*`, the
   wallet/auth provider, or clearly marked local/dev state. Avoid hardcoded demo strings in live views.
3. Intent context: write APIs that act on a launched intent must carry the current `intentId` unless
   the action is intentionally global and documented.
4. Runtime claims: labels such as "live", "funded", "registered", or "running" must reflect a real
   API/chain/runtime source, not a static phrase.

## Current register

| ID | Area | Status | Finding | Coverage |
|---|---|---:|---|---|
| AUTH-001 | API gate | Fixed | Auth now defaults fail-closed on production runtimes; `INTENTOS_AUTH=off` is ignored in production. | `app/e2e/journey.spec.ts` gate coverage |
| STORE-001 | Persistence | Mitigated | Store now defaults to Firestore in production; explicit `INTENTOS_STORE=memory` still only warns. | Manual review |
| LLM-001 | IntentBuilder | Open | Vertex failures still fall back to scripted mock, but now log and return `llm:"mock"`. Decide whether production should hard-fail instead. | Manual review |
| API-001 | Executor create | Fixed | Create Executor button posts `intentId`; server loads FIXed draft and uses package hash/guard. | `app/e2e/data-wiring.spec.ts` |
| API-002 | Watcher create | Fixed | Create Watcher button posts `intentId`; server binds watcher to the active executor. | `app/e2e/data-wiring.spec.ts` |
| API-003 | Gas funding | Fixed | Gas Funding now has explicit top-up buttons wired to `POST /api/gas/fund`. | `app/e2e/data-wiring.spec.ts` |
| API-004 | Trade/resume intent context | Fixed | Trade and owner resume now accept `intentId` and load the FIXed guard when available. | `app/e2e/data-wiring.spec.ts` |
| API-005 | Reset intent context | Open | Intent List reset still calls `api.reset()` without the current `intentId`; off-chain history may not be stopped. | expected-fail e2e |
| API-006 | Start conditions | Open | Start Conditions are persisted, but no runtime/Cloud Run AgentLoop start API consumes them yet. | Manual review |
| UI-001 | Active Intent card | Open | Intent List active card still shows static `intent-abc` / `DCA USDC -> WETH` instead of current intent API values. | expected-fail e2e |
| UI-002 | Live Console title | Open | Live Console heading still shows static `intent · DCA USDC -> WETH` instead of current intent API values. | expected-fail e2e |
| UI-003 | Owner address display | Open | Live Console Owner EOA display uses `ADDR.owner` instead of `/api/state.delegate`. | expected-fail e2e |
| UI-004 | Runtime/funding claims | Open | `Cloud Run (OpenClaw)`, `Owner-funded`, and `live on Base` are static claims, not runtime/funding status. | expected-fail e2e |
| UI-005 | ENS/ERC-8004 registration | Open | ENS/Basename and ERC-8004 registration text are derived strings/assertions; no API verifies registration. | Manual review |
| UI-006 | Token pair display | Open | Live guard token pair is rendered as fixed `USDC / WETH` instead of deriving from guard token addresses. MVP-fixed pair may be acceptable, but it is not data-driven. | Manual review |
| ROUTE-001 | Direct routes | Open | `#/launch` and `#/console` can be opened directly without enforcing the onboarding gate. | expected-fail e2e |
| TEST-001 | Mocked e2e | Mitigated | Existing e2e mocks APIs; data-wiring tests now use non-demo fixture values to catch hardcoded displays. | `app/e2e/data-wiring.spec.ts` |

## Test policy

- Expected-fail tests are intentional for open QA rows. When a row is fixed, remove `test.fail()` from
  the matching test so the fix becomes a normal regression guard.
- New buttons must include a test that captures the request body and verifies the endpoint and
  `intentId`/payload.
- New live displays must be tested with API fixture values that differ from demo constants.
