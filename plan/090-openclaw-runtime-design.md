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
| `intentos-runtime-tick` or `/runtime/tick` | Bounded tick executor entrypoint |

MVP ownership model:

- one Owner may have at most one **active** Intent;
- one active Intent has one Executor Agent and at most one Watcher Agent;
- historical AgentNFTs may remain on-chain, but only the current active pair should have a live runtime
  binding;
- starting a new active Intent must stop/expire the old runtime binding first.

The OpenClaw service should be private:

- no public unauthenticated ingress;
- invoked only by the control panel service account, Scheduler, Tasks, or a signed internal request;
- gateway token stored in Secret Manager;
- service account granted only the minimum roles needed for Vertex AI and logging.

## 2.1 Cloud Run container blueprint

Build a small wrapper image around the OpenClaw runtime image. The wrapper should not bake secrets.

Container responsibilities:

1. start with the OpenClaw runtime image;
2. copy an entrypoint script into the image;
3. copy a local Vertex OpenAI-compatible bridge into the image;
4. run as a non-root runtime user after setup;
5. require `OPENCLAW_GATEWAY_TOKEN`;
6. generate runtime configuration at container boot;
7. start the Vertex bridge on localhost;
8. set the default OpenClaw model;
9. start the OpenClaw gateway on `$PORT`.

Required environment variables:

```text
PORT
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
OPENCLAW_GATEWAY_TOKEN
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

The entrypoint should fail fast when `OPENCLAW_GATEWAY_TOKEN` is missing. It should also trap process
signals and stop the local Vertex bridge when the container exits.

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

If KMS signing moves into the runtime, also grant only the exact KMS signer/verifier permissions for
the Executor/Watcher SessionKeys. Otherwise, keep KMS signing in the control panel/relayer service.

Deployment should:

1. enable required APIs: Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Vertex AI;
2. create the runtime service account if absent;
3. create or reuse a random gateway token in Secret Manager;
4. grant the service account access to only that secret;
5. deploy the wrapper image;
6. grant `roles/run.invoker` only to the control panel service account and trusted operators.

Smoke test:

```text
GET  /readyz
GET  /v1/models              with Bearer gateway token
POST /v1/chat/completions    with Bearer gateway token
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
- gateway auth enabled with a token;
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

Minimum record:

```text
RuntimeRecord
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
```

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

## 7. Bounded Executor tick loop

The Executor loop must be short-lived and bounded.

Suggested MVP execution model:

- `/api/runtime/start` creates a RuntimeRecord and schedules a finite number of ticks;
- each tick is a separate Cloud Scheduler/Cloud Tasks invocation or short Cloud Run request;
- a tick exits after one decision;
- no process sleeps forever;
- max ticks and TTL are enforced both in registry and runtime;
- every tick writes evidence.

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
  sign request digest with KMS SessionKey
  relay submitExecutionRequest
  check receipt.status
  write evidence/action result
exit
```

The runtime should prefer HOLD when any required input is missing, stale, or ambiguous.

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
