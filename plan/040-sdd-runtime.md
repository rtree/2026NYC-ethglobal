# IntentOS — SDD 2: Runtime, Adapter, Relayer, Registry

The Runtime layer (010 §3): where agents keep running, and the only place an OpenClaw decision becomes
a signed request. Anchors: [010 §7](010-interfaces.md) (Agent Package), [§8](010-interfaces.md)
(intentos.* tools), [§10](010-interfaces.md) (Registry/Binding), [§12](010-interfaces.md) (Guard→LLM
loop). Realizes mocks 060 / 090 / 100.

All services are **TS on Cloud Run**; OpenClaw is the official image. The agent head holds **no**
onchain authority (010 §5).

## 1. Services

```text
registry/   Runtime Registry + Agent Package Store. Backend source of truth (010 §10). REST to app.
runtime/    OpenClaw Capsule wiring (Executor & Watcher) + Vertex OpenAI-compat shim.
adapter/    intentos.* typed-tool HTTP surface. Builds/binds/sign-requests. The trust seam (010 §5).
relayer/    gas-sponsoring tx submitter. Fronts gas, gets reimbursed from a vault lane.
```

One Capsule per Agent NFT: `1 Executor NFT / 1 ExecutorRuntime`, `1 Watcher NFT / 1 WatcherRuntime`
(010 §10). Same OpenClaw image; separate workspace / agent id / session store / tool policy / gas lane.

---

## 2. Runtime Registry (010 §10)

Owns `RuntimeRecord` and `RuntimeBinding` (exact shape in 010 §10). Postgres + a thin REST API.

```text
POST /runtime/spawn      { tokenId } -> verify ownerOf == caller + World ID proof; create/reuse Capsule
POST /runtime/resume     { tokenId } -> reuse if runtimeOwner == ownerOf, else 409 (needs re-bind)
POST /runtime/rebind     { tokenId } -> new owner: rotateBinding on-chain + new SessionKey + record
GET  /runtime/:tokenId   -> RuntimeRecord for screen 060 (status, lane refs, heartbeat)
POST /runtime/heartbeat  { runtimeId } -> lastHeartbeatAt
POST /runtime/stop       { tokenId }  -> owner stop
```

Spawn/resume decision is exactly 010 §10 (does-not-exist / owner-matches / owner-differs). On transfer,
the old binding becomes invalid; the next authority op fails on-chain (`bindingNonce`) and the old
Runtime self-stops at its next stop check (010 §10/§14).

### Agent Package Store (010 §7)

Stores the package files + `manifest.json` (parent `packageHash`). Injection into the Capsule:

```text
MVP    : registry materializes the package into the OpenClaw workspace and embeds
         SUMMARY/MEMORY/EVIDENCE/STOP/CONSTRAINTS summaries + paths into AGENTS.md.
Better : an IntentOS OpenClaw plugin injects the whole package via before_prompt_build hook.
```

Registry verifies `packageHash` before boot (010 §3.6 of North Star). `agentManifestHash` on the NFT
must equal the stored `packageHash`.

---

## 3. Adapter — intentos.* typed tools (010 §8)

HTTP service OpenClaw calls. Logical tools bind to concrete surfaces. Both allowlists stay small
(010 §8). Authority not given to OpenClaw (010 §5) simply has **no tool**.

```text
Executor tools                      bound surface
  intentos.observe_state            onchain read (guard, balances, cumulativeSpent)
  intentos.get_quote                Uniswap Quoter
  intentos.propose_swap             pure shaping (no chain effect)
  intentos.simulate                 eth_call / simulation provider
  intentos.submit_execution_request build->sign->relay pipeline (§3.1)
  intentos.record_evidence          evidence hashing (commitment carried by the contract event)
  intentos.ask_watcher              Executor<->Watcher chat
  intentos.self_stop                stop signal -> registry

Watcher tools
  intentos.read_execution_timeline  getLogs(EvidenceCommitted) + contract state
  intentos.read_evidence            decode one EvidenceCommitted + hashes
  intentos.ask_executor             chat
  intentos.judge_on_intent          shaping vs semantic guardrails
  intentos.submit_report            report tx (optional in MVP) / log
  intentos.vote_tighten             build watcherTighten -> sign -> relay
  intentos.vote_freeze              build watcherFreeze -> sign -> relay
  intentos.self_stop                stop signal
```

### 3.1 submit_execution_request pipeline (010 §8, §9)

```text
1 validate args against HardGuardState shape (types only; not a guarantee — contract is authority)
2 bind hashes: quoteHash, simulationHash, evidenceRoot
3 build typed ExecutionRequest (010 §9) incl. minAmountOut from slippageCap, nonce, bindingNonce, deadline
4 digest = EIP191(keccak256(chainId, delegateAddr, request))  (== contract §2.4)
5 KMS signs the digest with the Executor SessionKey (0 ETH, sign-only)
6 hand {request, sig} to relayer; return tx hash / EvidenceCommitted ref to OpenClaw
```

The adapter **never** sends the tx and **never** holds funds. It only signs a typed request — the
exact seam of 010 §5.

### 3.2 Guard -> LLM feedback loop (010 §12)

```text
before step 5, eth_call preflight submitExecutionRequest(request, sig?)
  revert -> parse custom error (AmountTooLarge, ...) + read amountCapPerTx, cumulativeRemaining
         -> return { ok:false, reason, amountCapPerTx, cumulativeRemaining } to OpenClaw (NOT an error)
         -> OpenClaw re-decides inside the boundary
  ok     -> proceed to sign+relay
maxAttemptsPerTick caps retries. NEVER clamp amount in the adapter (010 §12 anti-pattern).
```

---

## 4. SessionKey / KMS (010 §5, §10)

```text
one secp256k1 key per Runtime in GCP KMS (global/intentos/...). signs digests only; holds 0 ETH.
adapter -> kms.asymmetricSign(digest) -> 65-byte sig (recover == _sessionKey on-chain).
policy: KMS sign path requires the registry to confirm active bindingNonce (010 §10) before signing.
Executor key -> _sessionKey ; Watcher key -> _watcherKey. Distinct keys, distinct lanes.
```

Transfer revocation: a stale Runtime can still ask KMS to sign, but the on-chain `bindingNonce`
mismatch makes the resulting tx revert (`BadBindingNonce`), and lanes/vault reject it (010 §10).

---

## 5. Relayer (North Star "who pays gas")

```text
POST /relay/execute  { request, sig }       -> writeContract submitExecutionRequest, front gas
POST /relay/watcher  { kind, patch?, sig }  -> writeContract watcherTighten|watcherFreeze, front gas
```

- Hot key with ETH; allowlisted as `_relayer` in the delegate (§030 2.5). Reimbursed from the
  matching lane after the call (executor lane for executes, watcher lane for votes).
- Clamp overflow (`spent > gasPerTxCap`) is the Platform's cost (North Star). Lane depletion surfaces
  as the `fund-exhausted` terminal state (010 §13).
- Idempotency: keyed by `(delegate, nonce)` for executes / `(delegate, kind, guardHash)` for votes to
  avoid double subm/double-spend of gas.

---

## 6. OpenClaw runtimes & loops

### Executor AgentLoop (North Star §4)

```text
Perceive(observe_state) -> Decide(BUY/SELL/HOLD/RECOVER) -> Quote -> Simulate
  -> Request(submit_execution_request) -> [adapter: HardGuard preflight -> sign -> relay]
  -> Record(EvidenceCommitted) -> StopCheck(owner/self/fund/owner-change/freeze)
```

Predefined actions only (010 §8). No arbitrary shell/URL/contract call exists as a tool.

### Watcher loop (North Star §5)

```text
Observe(read_execution_timeline) -> Question(ask_executor?) -> Judge(judge_on_intent)
  -> Report/Vote(vote_tighten | vote_freeze) -> [adapter sign -> relay] -> StopCheck
```

Watcher can only tighten/freeze (monotonic on-chain, §030 2.6). quorum=1: one vote = immediate state
change (010 §2).

---

## 7. Observability & known traps

- **LLM empty-output trap** (repo memory / North Star troubleshooting): Vertex `maxOutputTokens` too
  small -> `finishReason=MAX_TOKENS`, empty text -> old shims mis-round to HOLD/DENY. The shim must:
  prefer the latest user message, clamp `maxOutputTokens` to a sane min (>=256) and generous max,
  never round empty text to HOLD, and log `finishReason` / safety / promptFeedback.
- **reason normalization**: adapter normalizes `reason` to non-compressed English ASCII, <=200 chars,
  strips secrets / raw API responses / markdown **before** signing or emitting (010 §11/§14).
- **heartbeat**: each Capsule posts `/runtime/heartbeat`; missed heartbeats surface on screen 060/090.
- **structured logs** per tick: perceived state, decision, quote/sim hashes, action, tx — the offchain
  body is optional (010 §14); the canonical record is the on-chain `EvidenceCommitted`.

---

## 8. Stop / self-stop / transfer (010 §10, §13)

```text
owner-stopped : registry /runtime/stop -> ownerStop() on-chain (freeze + refund drain)
self-stopped  : OpenClaw SELF_STOP -> registry marks runtime SELF_STOPPED
fund-exhausted: relayer reimbursement reverts on empty lane -> terminal
transferred   : ownerOf changes -> bindingNonce stale -> all authority ops revert -> next stop check
                self-stops the old Runtime (no synchronous kill needed)
```

---

## 9. M5 — control-panel server: auth, store, IntentBuilder LLM

The `@intentos/server` (010 §18) hosts the write-path + these M5 modules. All accessed server-side
via REST + `google-auth-library` ADC (no firebase-admin, no @google-cloud/{firestore,vertexai} SDKs —
smaller supply-chain surface under the pnpm policy). Toggles: `INTENTOS_AUTH`, `INTENTOS_STORE`,
`INTENTOS_LLM` (each `…|off|memory|mock` so dev/e2e run with zero GCP).

### 9.1 Auth (Web3 → Firebase, 010 §17)
- `auth.web3.ts`: `getNonce(address)` (in-memory TTL map), `verifyAndMint({message, signature})` —
  viem `verifyMessage` + nonce/domain check → mint Firebase custom token.
- `firebaseToken.ts`: build the custom-token JWT and sign **key-lessly** via IAM Credentials
  `projects/-/serviceAccounts/{sa}:signJwt` (ADC bearer from `google-auth-library`). Verify inbound
  Firebase **ID tokens** with node `crypto` against cached `securetoken@system` x509 certs (check
  RS256, `aud=projectId`, `iss=https://securetoken.google.com/<projectId>`, `exp`). Middleware sets
  `req.uid` (CAIP-10) for gated routes.

### 9.2 Store (010 §16)
- `store.ts` interface `{ getIntents(uid), getIntent(uid,id), putIntent(uid,id,doc), appendTurn(...) }`
  with two impls: `memory` (Map; dev/e2e) and `firestore` (REST `firestore.googleapis.com/v1/...:commit`
  + `:runQuery`, ADC). Docs scoped `users/{uid}/intents/{intentId}` (+ `/transcript/{turnId}`).
  On-chain stays primary; the store never holds money state.

### 9.3 IntentBuilder LLM (010 §18, Vertex)
- `vertex.ts`: `chat(transcript) -> { reply, packages }` and `compile(transcript) -> packages` calling
  Vertex `…aiplatform.googleapis.com/v1/projects/{p}/locations/{loc}/publishers/google/models/gemini-2.5-flash:generateContent`
  with an ADC bearer. The system prompt compiles the conversation into the dual `AgentPackageDraft`
  (Executor + Watcher, 010 §16) as strict JSON; the server validates/normalizes (clamps caps to the
  demo ceiling, forces USDC↔WETH, ASCII `reason` ≤200). `mock` impl returns the scripted drafts so
  the demo never hard-fails. **Vertex via ADC only — never the API-key Gemini Developer API (010 §18).**
- `/api/intent/*` are auth-gated (§9.1) + per-uid rate-limited (token bucket) so the LLM is not an
  open proxy. `compile`/`fix` write the resulting drafts/`packageHash` to the store (§9.2).

### 9.4 StartConfig & bounded loop (010 §18)
- `/api/start` persists `StartConfig {loopPeriodSec, ttlMinutes, watcherEnabled}` and arms a **bounded**
  AgentLoop: at most `ttlMinutes`, one tick per `loopPeriodSec`, hard `maxAttemptsPerTick`. No infinite
  loops, no spam (repo safety policy). The existing `/api/trade` remains the manual single-tick path.
