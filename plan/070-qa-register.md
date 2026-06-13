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

| ID | Area | Status | Finding | Suspected cause | Proposed fix | Coverage |
|---|---|---:|---|---|---|---|
| AUTH-001 | API gate | Fixed | Auth now defaults fail-closed on production runtimes; `INTENTOS_AUTH=off` is ignored in production. | Previous dev defaults were allowed to leak into production. | Keep fail-closed default and cover production auth behavior in smoke tests. | `app/e2e/journey.spec.ts` gate coverage |
| AUTH-002 | Frontend auth config | Open | IntentBuilder can show a connected wallet but call `/api/intent/chat` without `Authorization` when the browser build lacks `VITE_FIREBASE_API_KEY`; `auth.ts` creates a local session with an empty `idToken`, while the fail-closed backend still requires a Firebase Bearer token, producing `missing bearer token`. | Cloud Run/Vite build may not receive `VITE_FIREBASE_API_KEY`, and frontend dev fallback treats empty-key auth as signed in. | Inject `VITE_FIREBASE_API_KEY` at app build/deploy time and fail closed in frontend when backend auth is expected but no Firebase key/idToken exists. | expected-fail e2e |
| STORE-001 | Persistence | Mitigated | Store now defaults to Firestore in production; explicit `INTENTOS_STORE=memory` still only warns. | Demo/local memory store is still selectable in production. | Refuse `INTENTOS_STORE=memory` on Cloud Run unless a deliberate break-glass env is set. | Manual review |
| LLM-001 | IntentBuilder | Open | Vertex failures still fall back to scripted mock, but now log and return `llm:"mock"`. Decide whether production should hard-fail instead. | Demo reliability preference conflicts with production truthfulness. | In production, return an explicit error or require a visible fallback banner/metric before allowing mock replies. | Manual review |
| API-001 | Executor create | Fixed | Create Executor button posts `intentId`; server loads FIXed draft and uses package hash/guard. | Earlier create path used hardcoded demo intent/hash. | Keep request-body capture tests for all new create/write actions. | `app/e2e/data-wiring.spec.ts` |
| API-002 | Watcher create | Fixed | Create Watcher button posts `intentId`; server binds watcher to the active executor. | Earlier watcher path used static watcher package/hash values. | Keep create watcher tied to stored FIXed packages and active executor token. | `app/e2e/data-wiring.spec.ts` |
| API-003 | Gas funding | Fixed | Gas Funding now has explicit top-up buttons wired to `POST /api/gas/fund`. | Funding existed only as implicit setup side effect. | Keep explicit funding buttons and verify request lane + intent context. | `app/e2e/data-wiring.spec.ts` |
| API-004 | Trade/resume intent context | Fixed | Trade and owner resume now accept `intentId` and load the FIXed guard when available. | Write-path endpoints were global/demo scoped. | Keep `intentId` on all launched-intent write APIs. | `app/e2e/data-wiring.spec.ts` |
| API-005 | Reset intent context | Open | Intent List reset still calls `api.reset()` without the current `intentId`; off-chain history may not be stopped. | Intent List does not load the current active Intent document, only `/api/state`. | Load active Intent/history in Intent List and call `api.reset(activeIntentId)`. | expected-fail e2e |
| API-006 | Start conditions | Open | Start Conditions are persisted, but no runtime/Cloud Run AgentLoop start API consumes them yet. | UI added config persistence before runtime launch orchestration existed. | Add `/api/runtime/start` (bounded) or relabel the screen as config-only until runtime start is wired. | Manual review |
| UI-001 | Active Intent card | Open | Intent List active card still shows static `intent-abc` / `DCA USDC -> WETH` instead of current intent API values. | Intent List only reads chain state, not the per-wallet active Intent doc. | Fetch `/api/intents`, derive active Intent, and render `intentId`/`title` from the API. | expected-fail e2e |
| UI-002 | Live Console title | Open | Live Console heading still shows static `intent · DCA USDC -> WETH` instead of current intent API values. | Console history is loaded but title ignores the active Intent doc. | Render active Intent title/id from `/api/intents` or `/api/intents/:id`. | expected-fail e2e |
| UI-003 | Owner address display | Open | Live Console Owner EOA display uses `ADDR.owner` instead of `/api/state.delegate`. | Config constant was used as a shortcut for the shared demo Owner. | Render `state.delegate` everywhere live chain owner/delegate is displayed. | expected-fail e2e |
| UI-004 | Runtime/funding claims | Open | `Cloud Run (OpenClaw)`, `Owner-funded`, and `live on Base` are static claims, not runtime/funding status. | UI labels were written before runtime/funding status APIs existed. | Drive badges from `/api/state` and/or a runtime status API; otherwise downgrade copy to neutral labels. | expected-fail e2e |
| UI-005 | ENS/ERC-8004 registration | Open | ENS/Basename and ERC-8004 registration text are derived strings/assertions; no API verifies registration. | Registration read path is not implemented; UI derives expected names from token IDs. | Add registry/ENS read API or label values as planned/derived until verified. | Manual review |
| UI-006 | Token pair display | Open | Live guard token pair is rendered as fixed `USDC / WETH` instead of deriving from guard token addresses. MVP-fixed pair may be acceptable, but it is not data-driven. | MVP pair is hardcoded across the product. | Derive token labels from `state.guard.tokenA/tokenB` with a known-token map. | Manual review |
| ROUTE-001 | Direct routes | Open | `#/launch` and `#/console` can be opened directly without enforcing the onboarding gate. | Route switch renders protected screens without checking `useGate()`. | Add a route guard in `App.tsx` or each protected page; redirect/show Onboarding until gate passes. | expected-fail e2e |
| TEST-001 | Mocked e2e | Mitigated | Existing e2e mocks APIs; data-wiring tests now use non-demo fixture values to catch hardcoded displays. | Earlier UI tests asserted presence, not data provenance. | Keep adding fixture values that differ from demo constants for every live display. | `app/e2e/data-wiring.spec.ts` |

## Test policy

- Expected-fail tests are intentional for open QA rows. When a row is fixed, remove `test.fail()` from
  the matching test so the fix becomes a normal regression guard.
- New buttons must include a test that captures the request body and verifies the endpoint and
  `intentId`/payload.
- New live displays must be tested with API fixture values that differ from demo constants.
