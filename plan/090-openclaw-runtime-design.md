# OpenClaw Runtime integration design

This document defines the implementation shape for replacing the current control-panel-only runtime
record with a real bounded OpenClaw Runtime path.

## 1. Goal

IntentOS needs a real cloud runtime that can keep an Executor or Watcher agent active after the
browser is closed, without giving that runtime custody of funds or unrestricted infrastructure access.

The runtime must:

- run as an isolated Cloud Run service or job;
- be started only from an authenticated Intent launch;
- execute bounded ticks, not an infinite loop;
- call Vertex AI only from backend infrastructure using ADC;
- use typed IntentOS tools instead of arbitrary shell/network/contract access;
- emit structured evidence for every tick and decision;
- never receive an Owner private key or a key that can directly move funds;
- only request execution through the EIP-7702 delegated account and Hard Guardrails.

## 2. Runtime service shape

Create a dedicated OpenClaw gateway/runtime service separate from the control panel.

Recommended services:

| Service | Responsibility |
|---|---|
| `intentos-panel` | Browser SPA, auth, IntentBuilder, launch wizard, relayer/write-path API |
| `intentos-openclaw-gateway` | OpenClaw gateway + model bridge + agent workspace |
| `intentos-runtime-session` or `/runtime/run` | Bounded resident runtime session entrypoint |

MVP ownership model:

- one Owner may have at most one **active** Intent;
- one active Intent has one Executor Agent and at most one Watcher Agent;
- historical AgentNFTs may remain on-chain, but only the current active pair should have a live runtime
  binding;
- starting a new active Intent must stop/expire the old runtime binding first.

The OpenClaw service should be private:

- no public unauthenticated ingress;
- invoked only by the control panel service account, Scheduler, Tasks, or a signed internal request;
- Cloud Run IAM is the external authentication boundary for the gateway, and the OpenClaw gateway token
  is still used for the application-level gateway API. Service-to-service calls must put the Cloud Run
  identity token in `X-Serverless-Authorization` and the OpenClaw token in `Authorization` so the two
  bearer schemes do not conflict.
- service account granted only the minimum roles needed for Vertex AI and logging.

## 2.1 Cloud Run container blueprint

Build a small wrapper image around the OpenClaw runtime image. The wrapper should not bake secrets.

Container responsibilities:

1. start with the OpenClaw runtime image;
2. copy an entrypoint script into the image;
3. copy a local Vertex OpenAI-compatible bridge into the image;
4. run as a non-root runtime user after setup;
5. generate runtime configuration at container boot;
6. start the Vertex bridge on localhost;
7. set the default OpenClaw model;
8. start the OpenClaw gateway on `$PORT`.

Required environment variables:

```text
PORT
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
OPENCLAW_STATE_DIR
OPENCLAW_DEFAULT_MODEL
VERTEX_SHIM_PORT
VERTEX_SHIM_MODEL
VERTEX_SHIM_MIN_OUTPUT_TOKENS
VERTEX_SHIM_MAX_OUTPUT_TOKENS
```

Recommended defaults:

```text
OPENCLAW_STATE_DIR=/home/node/.openclaw
OPENCLAW_DEFAULT_MODEL=openai/vertex-gemini-2.5-flash
GOOGLE_CLOUD_LOCATION=us-central1
VERTEX_SHIM_PORT=4000
VERTEX_SHIM_MODEL=gemini-2.5-flash
VERTEX_SHIM_MIN_OUTPUT_TOKENS=256
VERTEX_SHIM_MAX_OUTPUT_TOKENS=2048
```

Runtime directory layout:

```text
$OPENCLAW_STATE_DIR/
  openclaw.json
  workspace-intentos/
  agents/
    executor/
      agent/
    watcher/
      agent/
```

OpenClaw config generated at boot should include:

- gateway HTTP chat-completions enabled;
- token auth enabled;
- allowed CORS origins limited to Cloud Run and local development;
- default agent workspace set to `workspace-intentos`;
- model provider configured to call the local Vertex bridge;
- dangerous tool categories denied;
- default Executor profile and optional Watcher profile.

The entrypoint should trap process signals and stop the local Vertex bridge when the container exits.

## 2.2 Cloud Run deployment blueprint

Provision the runtime service with:

```text
service name: intentos-openclaw-gateway
region: us-central1
ingress: authenticated only
max instances: 1 for MVP
concurrency: 1 for deterministic agent sessions
cpu: 1
memory: 1Gi
timeout: <= 300s
service account: dedicated runtime service account
```

Required service-account roles:

```text
roles/aiplatform.user
roles/logging.logWriter
roles/secretmanager.secretAccessor on the gateway token secret
```

KMS signing MUST stay outside the OpenClaw runtime. The runtime may propose a typed action, but it
does not receive `cloudkms.signerVerifier` and cannot directly sign ExecutionRequests or Watcher votes.
Signing happens in a minimal typed-tool signer/relayer path that does not run LLM output and revalidates
the request against registry, binding, package hash, guard state, nonce, and deadline before signing.

Deployment should:

1. enable required APIs: Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Vertex AI;
2. create the runtime service account if absent;
3. deploy the wrapper image;
4. grant `roles/run.invoker` only to the control panel service account and trusted operators.

Smoke test:

```text
GET  /readyz
GET  /v1/models              through authenticated Cloud Run
POST /v1/chat/completions    through authenticated Cloud Run
```

Expected minimal response for a safety smoke is a deterministic `HOLD`-style answer. Do not test with
fund-moving tools in the gateway smoke.

## 3. Vertex model bridge

OpenClaw should talk to a local OpenAI-compatible endpoint inside the runtime container. That endpoint
translates OpenAI-style chat/responses requests to Vertex AI Gemini using Cloud Run ADC.

Important behavior:

- never use a browser API key for model calls;
- never enable or depend on Gemini Developer API from the browser key;
- clamp output token settings to avoid empty responses from too-small `max_tokens`;
- return clear structured errors when Vertex fails;
- log prompt/response metadata and lengths, not secrets or raw credentials.

Bridge endpoints:

```text
GET  /healthz
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
```

Bridge behavior:

- accept both chat-completions and responses style request shapes;
- extract the latest user prompt robustly;
- call Vertex `generateContent`;
- clamp requested output tokens between configured min/max;
- support streaming responses only if needed by OpenClaw;
- return OpenAI-compatible response envelopes;
- log request shape, prompt length, response length, finish reason, and safety metadata;
- throw on empty Vertex text so the runtime does not silently treat an empty model response as a valid
  decision.

The bridge is not a public API. It should bind to localhost inside the runtime container.

## 4. OpenClaw runtime configuration

The runtime container should generate its OpenClaw config at startup from environment variables and
Secret Manager values.

Required defaults:

- state directory under the service user's home;
- workspace directory per runtime/agent;
- one default Executor agent profile and one optional Watcher profile;
- gateway token auth enabled; Cloud Run auth uses `X-Serverless-Authorization` for direct calls;
- model set to the Vertex bridge model;
- dangerous tools disabled.

Tool policy should deny at least:

- shell/exec/spawn;
- arbitrary filesystem writes/deletes/moves;
- arbitrary browser control;
- arbitrary node/session spawning;
- gateway/admin controls;
- unbounded cron.

Only typed IntentOS tools should be exposed to agent logic:

- observe current guard and balances;
- read intent package;
- get quote;
- propose swap;
- request simulation/preflight;
- submit typed execution request;
- read evidence;
- report watcher judgement;
- vote tighten/freeze;
- self-stop.

MVP tool profile:

```text
allowed:
  intentos.observe_state
  intentos.read_package
  intentos.get_quote
  intentos.propose_swap
  intentos.request_simulation
  intentos.submit_execution_request
  intentos.read_evidence
  intentos.report_ok
  intentos.report_suspicious
  intentos.vote_tighten
  intentos.vote_freeze
  intentos.self_stop

denied:
  shell
  filesystem mutation
  arbitrary URL fetch
  arbitrary contract call
  arbitrary calldata generation
  private key export
  policy loosen
  delegate replacement
  unbounded cron
```

## 5. Runtime Registry

Add a durable Runtime Registry as the source of truth between AgentNFTs and cloud runtime instances.

MVP storage choice: **Firestore**. This keeps the current backend store shape, avoids adding a database
operator path for the hackathon, and is enough for one active Intent per Owner. A SQL store can replace
it later if we need richer querying, but the API contract below must not depend on Firestore-specific
fields.

Minimum record:

```text
RuntimeRecord
  ownerUid
  tokenId
  role
  intentId
  packageHash
  runtimeId
  runtimeOwner
  delegate
  bindingNonce
  cloudRunService
  status
  startedAt
  lastHeartbeatAt
  autoStopAt
  plannedTicks
  executedTicks
  failureReason
  createdAt
  updatedAt
```

Recommended Firestore layout:

```text
users/{uid}/runtimeRecords/{intentId}
runtimeRecords/{runtimeId}
runtimeRecords/{runtimeId}/ticks/{tickNumber}
runtimeRecords/{runtimeId}/heartbeats/{timestamp}
```

The per-user document supports UI/history reads. The top-level `runtimeRecords/{runtimeId}` supports
runtime-service reads without walking per-user paths. Both records must carry `ownerUid`, `intentId`,
`executorTokenId`, `watcherTokenId?`, and `delegate`.

Registry behavior:

1. `spawnOrResume(tokenId)`
   - if no record exists: create a new runtime binding;
   - if `ownerOf(tokenId) == runtimeOwner`: reuse the existing runtime;
   - if ownership changed: invalidate the old binding and require rebind.
2. `assertBindingValid(tokenId, bindingNonce)`
   - verify current NFT owner matches the runtime owner;
   - verify binding nonce is current;
   - mark old runtime self-stopped on mismatch.
3. `heartbeat(tokenId, runtimeId)`
   - update liveness and tick counters;
   - refuse heartbeats from stale bindings.

The registry must persist across Cloud Run restarts. Firestore is sufficient for MVP.

Owner/agent cardinality rule:

```text
Owner
  has 0 or 1 active Intent
  active Intent has exactly 1 Executor Agent
  active Intent has 0 or 1 Watcher Agent
```

Registry should reject a second active Executor for the same Owner unless the prior runtime is stopped,
expired, or explicitly reset. A new historical AgentNFT can exist, but it must not imply a second live
runtime.

### 5.1 Registry lifecycle and state transitions

Canonical runtime status:

```text
NONE -> SCHEDULED -> RUNNING -> STOPPING -> STOPPED
                    |          |          |-> EXPIRED
                    |          |          |-> FAILED
                    |          |-> SELF_STOPPED
                    |-> UNBOUND      (ownership/binding mismatch)
```

Chain/Intent terminal states map onto runtime status:

| Chain / Intent state | Runtime status | Meaning |
|---|---|---|
| running | RUNNING or SCHEDULED | runtime has active future ticks or is currently executing one |
| tightened | RUNNING | watcher narrowed future capability; runtime may continue |
| frozen | STOPPED | no further executor ticks should execute |
| self-stopped | SELF_STOPPED | executor/watcher chose to stop |
| owner-stopped | STOPPED | owner stopped or reset |
| fund-exhausted | FAILED | relayer/vault reimbursement failed due to budget |
| transferred | UNBOUND | runtime owner no longer matches `ownerOf(tokenId)` |

Transition rules:

- `start` may create `SCHEDULED` only when an Executor token exists and no active runtime exists for
  the Owner.
- `tick begin` moves `SCHEDULED` to `RUNNING`.
- `tick complete` increments `executedTicks`; if there are remaining ticks and `autoStopAt` is in the
  future, enqueue the next tick.
- `autoStopAt` reached moves to `EXPIRED`.
- `owner stop/reset` moves to `STOPPED` and cancels future ticks.
- `binding invalid` moves to `UNBOUND` and refuses heartbeats/ticks.
- any unexpected exception moves the current tick to failed; the runtime may retry only according to the
  Cloud Tasks retry policy.

### 5.2 Stale binding consequences

If ownership changes or `bindingNonce` mismatches:

- no new tick may start;
- heartbeat is rejected;
- KMS signing is refused;
- relayer submission is refused;
- watcher votes are refused;
- pending Cloud Tasks for that runtime become no-ops;
- UI shows `UNBOUND` / `transferred` and prompts rebind.

On-chain guardrails still protect funds even if a stale runtime manages to submit an old request:
`bindingNonce` mismatch must revert.

## 6. Package materialization

OpenClaw should not receive free-form prompt text directly from the browser. The control plane should
materialize a fixed Agent Package into the runtime workspace.

Materialization flow:

1. Owner chats with IntentBuilder.
2. Owner FIXes Executor and Watcher packages.
3. Server computes package hash.
4. AgentNFT stores package hash.
5. Runtime Registry resolves `tokenId -> packageHash`.
6. Runtime workspace receives a package directory:
   - `manifest.json`;
   - `SUMMARY.md`;
   - `AGENTS.md`;
   - `SOUL.md`;
   - `TOOLS.md`;
   - `MEMORY.md`;
   - `EVIDENCE.md`;
   - `STOP.md`;
   - `CONSTRAINTS.json`.
7. Runtime verifies the package hash before executing.

Hard numeric constraints must be generated and validated by server logic, not trusted from LLM prose.

## 7. Bounded Executor runtime session

The Executor loop must be short-lived and bounded. MVP execution uses a **single Cloud Run resident
session** rather than Cloud Tasks per tick. This is acceptable because the MVP runtime window is short
and hard-capped.

MVP execution model:

- `/api/runtime/start` creates a RuntimeRecord and invokes the private runtime service once;
- the private runtime service keeps one HTTP request/session open while it runs bounded ticks;
- each session exits at TTL, stop request, budget exhaustion, frozen guard, binding mismatch, or max
  tick count;
- no process sleeps forever;
- max ticks and TTL are enforced both in registry and runtime;
- every tick writes evidence.

Hard runtime bounds:

```text
maxRuntimeMinutes: 10
defaultRuntimeMinutes: 1
minTickIntervalSeconds: 5
defaultTickIntervalSeconds: 10
maxTicks: 60
maxConcurrentRuntimeSessionsPerOwner: 1
maxConcurrentRuntimeSessionsPerIntent: 1
```

The runtime service should use Cloud Run request timeout >= `maxRuntimeMinutes` plus startup margin, but
must still self-stop internally before `autoStopAt`. Cloud Run timeout is not the safety boundary; the
registry status, loop code, and kill switches are.

Session request payload:

```json
{
  "runtimeId": "rt_...",
  "ownerUid": "eip155:8453:0x...",
  "intentId": "intent-...",
  "executorTokenId": "6",
  "watcherTokenId": "7",
  "delegate": "0x...",
  "bindingNonce": "1",
  "startedAt": 1780000000000,
  "autoStopAt": 1780000600000,
  "tickIntervalSec": 10,
  "maxTicks": 60,
  "idempotencyKey": "runtimeId:session"
}
```

The session endpoint must be idempotent. If `runtimeRecords/{runtimeId}` already has status `RUNNING`
with a non-expired lease, a duplicate start request returns the current record and must not start a
second loop.

### 7.0 Idempotency and concurrency

Cloud Run and browsers can retry requests. Operators can double-click. Multiple tabs can call start.
The runtime must be safe under duplicate and overlapping requests.

Hard requirements:

- session idempotency key = `(runtimeId, bindingNonce)`;
- `start` uses a Firestore transaction / compare-and-swap on `RuntimeRecord.status` and `leaseExpiresAt`;
- only one non-terminal session per owner and per intent may hold the runtime lease;
- duplicate start after terminal result returns 409 unless the owner explicitly resets/restarts;
- duplicate start while another worker holds the lease returns 200/409 without starting a second loop;
- relayer dedupes by `executionRequestHash` and by `(delegate, nonce)`;
- contract nonce remains final replay protection.

Lease record:

```text
RuntimeLease
  runtimeId
  leaseOwner
  leaseExpiresAt
  status: scheduled | running | stopping | terminal
```

If a lease expires without a terminal result, the reaper may mark the runtime `FAILED` or reacquire only
after checking whether a tick has a pending `txHash`.

Tick outline:

```text
read RuntimeRecord
assert binding valid
read Agent Package
read current guard/balances/vaults
ask OpenClaw/Vertex for a bounded action
validate action against RuntimePolicy
if HOLD: write evidence and exit
if BUY/SELL/RECOVER:
  get quote
  build typed request
  preflight guard
  request signer/relayer service to validate + KMS-sign the typed request
  relayer submits submitExecutionRequest
  check receipt.status
  write evidence/action result
exit
```

The runtime should prefer HOLD when any required input is missing, stale, or ambiguous.

### 7.1 Tick output contract

Each tick returns and stores:

```text
TickResult
  runtimeId
  tick
  status: held | submitted | rejected | reverted | failed | self-stopped
  action
  reason
  observedStateHash
  packageHash
  quoteHash?
  simulationHash?
  executionRequestHash?
  txHash?
  receiptStatus?
  errorKind?
  errorMessage?
  nextTickScheduled: boolean
```

Errors should be classified, not only logged:

```text
model_error
quote_error
simulation_reject
guard_reject
receipt_reverted
rpc_error
binding_invalid
budget_exhausted
unexpected_error
```

Retry policy:

| Error kind | Retry? | Result |
|---|---:|---|
| model_error / empty_model_response | no blind retry | HOLD or failed tick depending on policy |
| quote_error / rpc_read_error | yes, bounded | retry before submit only |
| simulation_reject / guard_reject | no | rejected/HOLD terminal tick |
| binding_invalid / frozen / expired | no | self-stopped/terminal |
| receipt_reverted | no | failed or rejected; do not resubmit same action |
| submit_rpc_error before txHash | yes, bounded | retry submit only if no txHash recorded |
| txHash recorded but receipt pending | no immediate duplicate | schedule receipt resolver |

## 8. RuntimePolicy

RuntimePolicy is the non-chain safety layer that constrains agent behavior before a request reaches the
contract.

Minimum policy:

```text
allowedActions: HOLD, BUY, SELL, RECOVER
allowedTools: observe, quote, simulate, submitExecutionRequest, readEvidence, selfStop
allowedTokens: USDC, WETH
maxAmountPerTick
maxCumulativeAmount
maxTradesPerSession
maxSlippageBps
quoteMaxAgeSeconds
maxRuntimeSeconds
maxTicks
maxGasBudget
```

RuntimePolicy does not replace Hard Guardrails. The contract remains final authority.

## 9. Evidence model

Every tick should produce structured evidence before and after any on-chain action.

Minimum evidence fields:

```text
runtimeId
tokenId
intentId
tick
action
reason
observedGuardHash
packageHash
quoteHash
simulationHash
requestHash
txHash
receiptStatus
resultHash
timestamp
```

Evidence should be stored off-chain and, when execution succeeds, anchored through the contract's
`EvidenceCommitted` event.

Do not store secrets, raw API responses, long prompts, personal data, or markdown in on-chain `reason`.

Evidence timeline:

```text
TickStarted
ObservedState
DecisionMade
QuoteReceived | QuoteSkipped
SimulationResult | SimulationSkipped
GuardPreflightResult
ExecutionSubmitted | ExecutionRejected | ExecutionReverted | ExecutionSucceeded
WatcherJudgement
RuntimeStopped
```

Storage:

```text
runtimeRecords/{runtimeId}/ticks/{tick}/evidence/{eventId}
```

The UI should merge:

- on-chain `EvidenceCommitted`, `GuardTightened`, `GuardFrozen`;
- off-chain tick evidence;
- RuntimeRecord status/heartbeat;
- Intent history metadata.

On-chain remains canonical for money movement. Off-chain evidence explains decisions and failures.

## 9.1 ExecutionGasVault and reimbursement

Runtime never holds funds and never pays gas from an Owner key. Gas movement is:

```text
relayer fronts gas
delegate executes request/vote
delegate reimburses relayer from executor or watcher lane
vault lane decrements
receipt/status/evidence are recorded
```

Rules:

- Executor execution uses the executor lane.
- Watcher tighten/freeze uses the watcher lane.
- The relayer hot wallet pays the transaction first.
- Reimbursement is capped by `gasPerTxCap`.
- Any gas beyond the cap is platform cost.
- If a lane is depleted, the transaction reverts and runtime state becomes `fund-exhausted` / `FAILED`.
- Runtime UI must show both lane balances or a combined user-friendly reserve with expandable lane
  details.
- Manual top-up is acceptable, but runtime must also check budget before every tick.
- No Agent or OpenClaw container receives the relayer private key unless the runtime service is
  explicitly the relayer service and has the corresponding security review.

## 10. Watcher runtime

Watcher runtime should be a separate bounded loop or tick path.

Watcher tick outline:

```text
read RuntimeRecord
assert binding valid
read watched Executor tokenId / intentId / packageHash
read recent EvidenceCommitted events
read off-chain evidence by executionId
judge semantic guardrails
write REPORT_OK or REPORT_SUSPICIOUS
if needed:
  build monotonic patch
  sign watcher vote with KMS WatcherKey
  relay tighten/freeze
  check receipt.status
exit
```

For MVP quorum remains `1`, but the data model should keep `quorumSetId` and report records so it can
generalize later.

Watcher authority boundary:

- may read evidence;
- may ask/judge/report;
- may vote tighten;
- may vote freeze;
- may self-stop;
- must never loosen;
- must never move funds;
- must never change the delegate implementation;
- must never create arbitrary calldata.

Watcher preconditions before voting:

- watcher token exists and is bound to the executor token;
- watcher runtime binding is valid;
- watcher lane has enough budget;
- evidence being judged matches the watched intent/package context;
- proposed patch is monotonic (all limits are <= current limits);
- freeze uses the current binding nonce.

Reports:

```text
WatcherReport
  runtimeId
  watcherTokenId
  executorTokenId
  intentId
  executionId
  verdict: REPORT_OK | REPORT_SUSPICIOUS | VOTE_TIGHTEN | VOTE_FREEZE
  reason
  evidenceRefs
  proposedPatch?
  txHash?
```

## 11. Cloud Run deployment model

Recommended configuration:

```text
service account: intentos-runtime@...
roles:
  aiplatform.user
  logging.logWriter
  secretmanager.secretAccessor for gateway/runtime token only
  cloudkms.signerVerifier for SessionKey/WatcherKey if signing occurs inside runtime
ingress:
  internal or authenticated only
max instances:
  bounded
concurrency:
  low for tick determinism
timeout:
  short, e.g. <= 300s
```

The control panel can either:

- call a private runtime service endpoint directly; or
- enqueue Cloud Tasks for each tick; or
- rely on Cloud Scheduler for coarse-grained ticks.

Cloud Tasks is preferable when each Intent has its own finite queue of ticks.

## 11.1 Service accounts and IAM

Recommended principals:

| Principal | Purpose | Minimum permissions |
|---|---|---|
| panel service account | auth/store/control plane | Firestore, Secret Manager for panel secrets, Cloud Tasks enqueuer, Cloud Run invoker |
| signer/relayer service account | typed-tool signing + tx submission | exact KMS signerVerifier on SessionKey/WatcherKey, relayer key access if server-side, Firestore read for binding/package validation |
| runtime service account | OpenClaw/Vertex/tick execution | Vertex AI user, logging, read runtime package/registry, invoke typed-tool adapter |
| tasks invoker service account | OIDC identity for Cloud Tasks | Cloud Run invoker on runtime service only |
| relayer service account / hot wallet holder | submit tx and front gas | Secret access only for relayer key if key stays server-side |

Hard rules:

- browser keys are only for Firebase Auth;
- Vertex uses ADC only;
- Cloud Run IAM protects the service, and OpenClaw token auth protects the gateway API. Direct callers
  must use `X-Serverless-Authorization` for the Cloud Run identity token and `Authorization` for the
  OpenClaw gateway token;
- runtime service must not be public unauthenticated;
- runtime service must not have broad Secret Manager access;
- runtime service must not have KMS sign permissions;
- every signer request must include `ownerUid`, `tokenId`, `intentId`, `runtimeId`, `bindingNonce`, and
  idempotency key.

## 12. API additions

Add or harden these control-plane endpoints:

```text
POST /api/runtime/spawn
POST /api/runtime/start
POST /api/runtime/tick
POST /api/runtime/stop
GET  /api/runtime/status?intentId=...
POST /api/runtime/heartbeat
```

`/api/runtime/start` must no longer only store metadata. It must create a RuntimeRecord and schedule or
trigger ticks.

`/api/runtime/status` should drive UI labels such as `scheduled`, `running`, `stopped`, `expired`,
`failed`, and `manual-only`.

Canonical MVP API contract:

```text
POST /api/runtime/start
  auth: Firebase bearer
  body: { intentId }
  effect: validate one-active-intent, create RuntimeRecord, enqueue tick 1
  response: { runtimeId, status, plannedTicks, firstTickAt, autoStopAt }

POST /api/runtime/run
  auth: internal only
  body: RuntimeSessionPayload
  effect: run a bounded resident session until stop/TTL/maxTicks
  response: RuntimeRecord + final TickResult summary

GET /api/runtime/status?intentId=...
  auth: Firebase bearer
  response: RuntimeRecord + latest TickResult + heartbeat

POST /api/runtime/stop
  auth: Firebase bearer
  body: { intentId, reason }
  effect: mark STOPPING; resident runtime observes this and exits as STOPPED

POST /api/runtime/heartbeat
  auth: runtime service only
  body: { runtimeId, bindingNonce, status }
```

Runtime-service endpoints:

```text
GET  /healthz
GET  /readyz
POST /runtime/tick
POST /runtime/run
POST /runtime/heartbeat
POST /v1/chat/completions     (gateway token only)
POST /v1/responses            (gateway token only)
```

Idempotency:

- `runtime/start` is idempotent for the same active `intentId`;
- `runtime/run` is idempotent by `(runtimeId, bindingNonce)` while non-terminal;
- relayer submissions remain idempotent by `(delegate, nonce)`;
- retrying or restarting a session must not submit a second transaction if a tx hash was already recorded.

Receipt resolution:

```text
POST /api/runtime/receipt/resolve
  auth: Cloud Tasks OIDC / internal only
  body: { runtimeId, tick, txHash }
  effect: read receipt, update TickResult, reconcile evidence/timeline
```

The resident session must not block indefinitely waiting for receipts. Once a transaction hash is
recorded, the session can continue to the next bounded step only after a short receipt wait. If still
pending, it records `pending_receipt`, avoids resubmitting the same request, and the receipt resolver
handles success, reverted, not-found-yet, and timeout states.

Sweeper/reaper:

```text
POST /api/runtime/reap
  auth: internal/scheduled
  effect: expire stale RuntimeRecords, release expired leases, mark stale heartbeats, stop old bindings
```

A reaper must:

- expire records past `autoStopAt`;
- mark stale heartbeat records as `FAILED` or `EXPIRED`;
- no-op future ticks for stopped/unbound runtimes;
- report stuck pending receipts;
- enforce per-owner active-runtime uniqueness.

## 13. UI impact

Until a real runtime is provisioned, the UI must not say:

- `OpenClaw Runtime running`;
- `AgentLoop running`;
- `live runtime`;
- `keeps ticking`;
- `runtime armed` if no tick will execute.

After implementing the runtime:

- show runtime service/status separately from on-chain guard status;
- show last heartbeat and next tick time;
- show executed/planned tick count;
- show whether the last tick was HOLD, executed, rejected, or failed;
- show watcher judgement reports separately from manual watcher buttons.

## 14. Safety gates

Runtime execution must remain bounded:

- minimum tick interval: 5 seconds;
- maximum TTL: 5 minutes for MVP;
- maximum planned ticks: 12 or lower;
- maximum attempts per tick;
- no infinite process loops;
- no unbounded retries;
- no unbounded model calls;
- explicit self-stop on stale quote, missing evidence, exhausted budget, frozen guard, or binding
  mismatch.

Billing/cost gates:

- per-runtime max Vertex calls;
- per-runtime max quote/simulation calls;
- per-runtime max relay attempts;
- per-owner daily runtime creation cap;
- World ID/personhood gate before creating runtime resources;
- Cloud Run max instances, concurrency, request timeout, and runtime lease TTL;
- BigQuery/log analysis should use dry-run/cost-limited queries when applicable.

Observability:

- every tick logs `runtimeId`, `intentId`, `tokenId`, `tick`, `status`, `errorKind`;
- every write path logs route + sanitized error on failure;
- every receipt must check `status`;
- dashboards must show latest heartbeat and last tick status;
- alerts should fire on repeated `rpc_error`, `receipt_reverted`, `budget_exhausted`, or stale heartbeat.

Global kill switches:

```text
INTENTOS_RUNTIME_ENABLED=false
INTENTOS_TRADING_ENABLED=false
INTENTOS_WATCHER_VOTES_ENABLED=false
INTENTOS_VERTEX_ENABLED=false
```

When disabled, runtime ticks must HOLD/self-stop and avoid signing/submitting new transactions.

Cloud Run cost guardrails:

- `max-instances=1` for the runtime service in MVP;
- `concurrency=1` for deterministic sessions;
- request timeout <= 12 minutes;
- runtime loop exits before 10 minutes;
- Firestore `RuntimeLease` prevents duplicate sessions;
- per-owner active runtime cap = 1;
- UI start button disabled while status is `scheduled`, `running`, or `stopping`;
- stop request is Owner-authenticated and sets status `STOPPING` immediately.

## 15. Implementation order

1. Add Runtime Registry store and status API.
2. Add OpenClaw gateway Cloud Run service with Vertex bridge.
3. Add private authenticated invocation from control panel.
4. Materialize fixed Agent Packages into runtime workspaces.
5. Implement one-shot Executor tick endpoint.
6. Schedule finite ticks from `/api/runtime/start`.
7. Add evidence storage and UI display for tick results.
8. Implement Watcher tick/report pipeline.
9. Add runtime binding checks against AgentNFT ownership.
10. Replace manual-only UI labels with runtime-backed status.

## 16. Test matrix

Registry tests:

- one Owner cannot start two active runtimes;
- start is idempotent for the same active Intent;
- reset/stop cancels future ticks;
- transfer or owner mismatch produces `UNBOUND`.

Runtime session tests:

- run payload includes `runtimeId`, `bindingNonce`, `autoStopAt`, `tickIntervalSec`, and `maxTicks`;
- duplicate run request while running does not create a second loop;
- stop request makes the resident loop exit before the next trade;
- expired runtime cannot be restarted without explicit reset;
- overlapping start requests serialize through a lease;
- stale lease is reaped safely.

Runtime tests:

- OpenClaw gateway health/model/chat smoke;
- Vertex bridge clamps token settings and fails on empty text;
- tool policy denies shell/filesystem/arbitrary contract calls;
- executor tick HOLD path writes evidence;
- executor tick submit path checks receipt status;
- watcher tick writes REPORT_OK / REPORT_SUSPICIOUS;
- watcher tighten/freeze path is monotonic.
- receipt pending path schedules resolver without duplicate submit.
- receipt reverted path records failure and does not log success.

Security tests:

- runtime service rejects unauthenticated public requests;
- Cloud Tasks OIDC principal can invoke `/runtime/tick`;
- browser Firebase key cannot call Vertex/Gemini Developer API;
- runtime service account cannot read unrelated secrets;
- KMS signing requires active binding.
- OpenClaw runtime service account cannot call KMS sign.
- signer refuses arbitrary calldata and unsigned package hashes.
- signer refuses stale runtime binding after NFT transfer.

UI tests:

- runtime status labels come from RuntimeRecord, not session token presence;
- latest heartbeat is shown;
- last tick status/error appears in Live Console;
- history distinguishes saved Intent docs from on-chain execution evidence.
