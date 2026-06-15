# IntentOS — Task & Workflow

> Maintenance phase started on 2026-06-15. The hackathon MVP scope below is historical context. The
> current product critical path is the x402-funded Executor-only TradingAgent described in
> [plan/000-northStar.md](plan/000-northStar.md), organized by [plan/120-maintenance-index.md](plan/120-maintenance-index.md),
> and opened as [plan/130-issue-pivot-x402-funded-executor.md](plan/130-issue-pivot-x402-funded-executor.md).
> Watcher work is parked for now; do not treat M3 Watcher as the next default task.

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
    `deployment/base-mainnet.json` (no keys).
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

### M1 DONE — real Base mainnet execution proven
- Funded by user. Infura Base RPC stored in Secret Manager `base-rpc-url` (read via `getBaseRpcUrl()`).
- `ExecutionDelegate7702` impl `0x37d9933c5ac95399c840d3a2c07fdfdbc8b7f9c1`, `AgentNFT`
  `0x82b70553c4b7b4506cb39032c91e94c49d613fee` deployed on Base mainnet.
- Owner EOA `0xeEa9c291…0f01` is EIP-7702-delegated (code `0xef0100…`) + initialized; executor gas
  vault funded; **real guarded USDC->WETH swaps executed** (cumulativeSpent up to 0.004 USDC, WETH
  received), each emitting `EvidenceCommitted`. Sample tx
  `0x07e43c013fdf219a17675b4fc070ede0c54322267783adc6774b1fe769ad2404`.
- Runner `packages/runtime/scripts/m1-run.ts` is resumable and runs on fork (`INTENTOS_FORK=1`) or
  mainnet. Setup merged into one 7702 tx (initialize seeds the gas vault) to respect Base's
  1-in-flight-tx limit on delegated accounts.

### Next
- **M3 — watcher slice** (fork-testable now): WatcherRuntime read evidence -> judge -> vote_tighten /
  vote_freeze (quorum=1) -> contract narrows / freezes -> next executor request reverts.
- **M2 — frontend**: wire mocks to live chain reads (EvidenceCommitted timeline, guard state, vaults).

---

## M4 — Full Journey, live, on the public internet (Cloud Run)

Goal (definition of done): from a browser at a public Cloud Run URL (behind Basic auth), a user can
walk the North Star journey and SEE it happen on Base mainnet:
1. Create an **Executor Agent** (mint AgentNFT + EIP-7702 delegate + initialize HardGuardState + fund
   gas vault) — one click, real txs.
2. Create a **Watcher Agent** (mint Watcher AgentNFT, bound to the executor; quorum=1).
3. **Trade**: trigger a guarded USDC->WETH execution; watch EvidenceCommitted appear on the timeline.
4. **Watcher stops it**: VOTE_FREEZE (or VOTE_TIGHTEN) -> next trade reverts (GuardIsFrozen /
   AmountTooLarge). Owner can resume (loosen) — only the Owner.
Then: World ID gate on onboarding.

Architecture decision: the write-path (mint / 7702 / fund / KMS-signed execute / votes) needs the
Owner private key + KMS + relayer, which must stay server-side (never in the browser). So we add a
small **backend API** that performs these actions and the React app calls it. This matches the North
Star (Runtime/Relayer are server-side; the browser only views + triggers).

### Build steps
1. `packages/server` (Node + a tiny HTTP layer, no heavy deps): endpoints
   - `GET  /api/state`            -> live chain state (guard, vaults, balances, timeline)
   - `POST /api/executor/create`  -> mint Executor AgentNFT + 7702 delegate + initialize + fund vault
   - `POST /api/watcher/create`   -> mint Watcher AgentNFT (bound), set quorum=1
   - `POST /api/trade`            -> one guarded USDC->WETH execution (quote->sign(KMS)->relay)
   - `POST /api/watcher/freeze`   -> watcher VOTE_FREEZE (KMS watcher key -> relay)
   - `POST /api/watcher/tighten`  -> watcher VOTE_TIGHTEN
   - `POST /api/owner/resume`     -> owner unfreeze/loosen (only-owner path)
   - `POST /api/reset`            -> rotateBinding / re-init so the demo can be re-run
   - Reuses `@intentos/runtime` (deploy, setup7702, executor, watcher, KMS, secrets).
2. Server also serves the built `app/web/dist` (single origin -> no CORS).
3. **Auth** (superseded by M5): originally HTTP Basic auth; **removed in M5** because it doesn't attach
   to fetch()/XHR (caused repeated popups + 401s). Now `/api/*` writes are gated by a **Firebase ID
   token** (Web3 -> Firebase sign-in, plan/010 §17); `/api/state` is public read-only.
4. Control-panel UI: buttons on the Launch/Owner/Watcher screens call the API; the existing live
   dashboards reflect results.
5. **Local iteration**: run the whole journey against Base mainnet (tiny amounts) until smooth.
6. **Containerize**: one Dockerfile (build app + server, run node). `.dockerignore`.
7. **Cloud Run**: dedicated runtime service account with `roles/cloudkms.signerVerifier` on the keys
   + `secretmanager.secretAccessor` on the secrets. Deploy. Bounded (no infinite loops).
8. **Verify** the public URL: full journey over the internet (M5: behind Firebase-Auth-gated writes).
9. **World ID gate** on onboarding (screen 010) — last.

Safety reminders for M4: tiny amounts only (~0.001 USDC); bounded actions (no loops/spam); keys only
in KMS/Secret Manager; (M5) Firebase Auth gates money-writes; never log secrets.

---

## M5 — UX overhaul (live-demo redesign) — REGISTERED MEMO TO FUTURE SELF

Context-saving note: this section is the **source of truth for the redesign** decided in the M5
working session, so we can free the chat context and still resume. After M5 ships, **back-port the
shaded decisions into `plan/000-northStar.md` (JP, source of truth), `plan/000-northStar-en.md`, and
the SDD (`020`–`050`)** — see "Back-port checklist" at the end. Until then, THIS is the spec.

### Why (user feedback, 2026-06-13)
The live demo exposed flow problems: a "running" Intent showed before the user created anything;
the launch flow is split across many routes with broken/mock pieces; the IntentBuilder conversation
is fully scripted; gas/start/result screens are placeholders. We are reworking the **information
architecture** and making the launch pieces real.

### New information architecture (3 authenticated destinations)
1. **Intents** (`#/intents`) — hub. If an Intent is active this session → card links to the Live
   Console; else → the create card on the right is the only entry. (DONE this session.)
   - Active state is **session-scoped** (`session.executorTokenId`), NOT the permanent on-chain 7702
     delegation. Owner EOA stays delegated forever, so `delegated` must never imply "running".
   - One active Intent per Owner: while active, "Run a new Intent" is **disabled**; Reset first.
2. **Launch** (`#/launch`) — **single screen, master/detail wizard** (no route hops). Left = vertical
   step nav; right pane swaps the controls for the selected step. Bottom "Complete required cards to
   start" stays. Steps, in order:
   1. **Intent & Agent Packages** — the IntentBuilder conversation builds **both** the Executor and
      the Watcher **Agent Packages** at once. Right pane shows a **dual AgentPackage preview**
      (Executor + Watcher), each with its **AGENTS.md** (objective / tools / Hard Guardrails /
      Semantic Guardrails / recovery) and a **FIX** button to lock that package. No agent is *minted*
      here — this step only authors + freezes packages. No "Setup steps" list here.
   2. **Executor Agent** — mint AgentNFT + EIP-7702 delegate + initialize HardGuardState. Agent
      **identity (ENS `agent-<id>.intentos.base.eth` + ERC-8004 registration)** is shown/created
      **inline here** (moved out of the standalone identity screen).
   3. **Watcher Agent** — mint Watcher AgentNFT (bound, quorum=1). Identity inline here too. Comes
      **right after** Executor (rename "Watcher Guard" → "Watcher Agent").
   4. **Gas Funding** — fund executor/watcher lanes. Remove the "Skip to Start" button ("do nothing"
      is fine, "skip" is not). Remove the separate **Runtime Preview** card entirely.
   5. **Start Conditions** — **real settings**: AgentLoop period (e.g. one tick / Ns) and Cloud Run
      **TTL minutes** (auto-stop after M minutes). Launch summary must show the **real** AgentPackage,
      Guardrails, identities, vaults — not a mock.
   - **Human Proof** (World ID) gets a real-looking screen (widget UI present; verification can stay
     inert/dev-sim until we wire IDKit). No more blank pane after pressing it.
3. **Live Console** (merge of `#/dashboard` + `#/watcher` + `#/result`) — one screen showing the
   running Intent: guard, vaults, balances, shared timeline, Owner controls (trade/resume) AND Watcher
   controls (freeze/tighten). After stop it **becomes** the Result view. Must include a **history
   list of past Intents** so prior runs are reachable.

### Decisions (locked 2026-06-13)
- **D1 Data store = Firestore, but ON-CHAIN IS PRIMARY.** The chain is the only source of truth for
  money state (guard, vaults, balances, cumulativeSpent, EvidenceCommitted/GuardTightened/GuardFrozen
  timeline). Firestore holds ONLY what cannot live on-chain: pre-mint AgentPackage drafts, the
  IntentBuilder conversation transcript, each agent's AGENTS.md text, Start config (loop period +
  Cloud Run TTL), and a lightweight **per-wallet index of intents** so the history list works.
  Firestore docs are scoped `users/{address}/intents/{intentId}`. On reconnect we reconcile: chain
  wins, Firestore annotates. Toggle `INTENTOS_STORE=memory|firestore` (memory for dev/e2e).
- **D2 IntentBuilder LLM = Vertex AI Gemini, BACKEND-ONLY.** The browser NEVER calls Vertex. The
  server exposes `POST /api/intent/chat` (turn) and `POST /api/intent/compile` (transcript ->
  Executor+Watcher AgentPackages). These are **session-gated (D4) + rate-limited** so we never hand
  the public a free LLM proxy. Graceful fallback to the scripted conversation when Vertex is
  unreachable, so the demo never hard-fails. Toggle `INTENTOS_LLM=vertex|mock`. Called via the
  existing GCP ADC (REST + google-auth), no model key in the repo.
  - **⚠️ SECURITY — the two "Gemini" APIs must not be confused (user-flagged 2026-06-13, verified vs
    Firebase docs updated 2026-06-12):** there are TWO distinct Gemini APIs.
    | API | service name | auth | our stance |
    |-----|------|------|-----------|
    | **Gemini Developer API** ("Google AI"/AI Studio) | `generativelanguage.googleapis.com` | **API key** | **MUST STAY DISABLED** — never use |
    | **Vertex AI Gemini** | `aiplatform.googleapis.com` | **OAuth/ADC** (service account) | the one we use, backend-only |
    The disaster mode: if `generativelanguage.googleapis.com` is enabled AND the public Firebase Web
    API key has "Generative Language API" in its allowlist, anyone can scrape the browser key and run
    **unlimited Gemini queries billed to us**. Firebase's own doc: *"never include the Gemini Developer
    API in the allowlist for a publicly accessible API key."* Our Vertex path uses ADC (no API-key
    auth path at all), so it is immune — BUT we must enforce: (1) keep `generativelanguage.googleapis.com`
    **disabled** (verified off 2026-06-13); (2) restrict the browser Web API key to ONLY
    `identitytoolkit` + `securetoken` (never Generative Language API); (3) do NOT run the Firebase
    "AI Logic" setup wizard — it can enable the Gemini Developer API + mint a Gemini key. Enable Vertex
    via plain `gcloud services enable aiplatform.googleapis.com` only.
- **D3 Delivery = full build, single review** (user choice). Build it all, then one review pass.
- **D4 Auth = Web3 login → Firebase Auth (Custom Token).** User's idea (2026-06-13): make the wallet a
  real Firebase Auth user. The wallet signature (SIWE / EIP-4361 message) is the primary credential;
  the server verifies it and mints a Firebase **custom token**, so the browser signs into Firebase
  Auth. This gives a per-wallet identity that BOTH Firestore Security Rules (`request.auth.uid`) and
  our backend trust, and the same Firebase **ID token** gates the Vertex endpoint (no open LLM proxy).
  - Flow: connect wallet → `GET /api/auth/nonce` (server stores nonce, short TTL) → wallet signs the
    SIWE message (domain + nonce + chainId) → `POST /api/auth/web3 {message, signature}` → server
    verifies signature (viem `verifyMessage`) + nonce + domain → mints custom token → browser
    `signInWithCustomToken` (REST) → Firebase ID token (+ refresh). Protected `/api/*` require a valid
    ID token (Bearer); the verified address scopes Firestore.
  - **uid = `eip155:8453:<lowercased address>`** (CAIP-10; chain-explicit, future-proof). Custom
    claims `{ address, chainId }`.
  - **Key-less minting (supply-chain policy):** the custom token is a JWT (alg RS256, iss=sub=Cloud
    Run SA email, aud=`https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit`,
    exp ≤ iat+3600, uid). We sign it via the **IAM Credentials `signJwt`** REST API using ADC — NO
    service-account JSON key in the repo. Cloud Run SA needs `roles/iam.serviceAccountTokenCreator`
    on itself (`iam.serviceAccounts.signJwt`).
  - **No Firebase SDKs:** browser calls Identity Toolkit REST `accounts:signInWithCustomToken?key=WEB_API_KEY`
    directly (Web API Key is NOT a secret — it ships in every Firebase web app) and refreshes via
    `securetoken.googleapis.com/v1/token`. Server verifies Firebase ID tokens by fetching Google's
    `securetoken@system.gserviceaccount.com` x509 certs and checking RS256 + aud=projectId +
    iss=`https://securetoken.google.com/<projectId>` + exp (node crypto; no firebase-admin).
  - Toggle `INTENTOS_AUTH=firebase|off` (off for dev/e2e). Basic auth stays the venue-door perimeter;
    Firebase Auth is the per-wallet locker.
  - **Demo compromise (unchanged):** ONE shared on-chain demo Owner EOA (judges can't 7702-delegate
    real funds) → everyone shares the single on-chain Intent; the OFF-chain layer (drafts / transcript
    / history) is per-wallet via the Firebase uid. PRODUCT mode (future, North Star): the connected
    wallet IS its own 7702 Owner.
- Implementation note: Firestore + Vertex + IAM signJwt are accessed **server-side via REST +
  `google-auth-library` ADC** (promote it to a direct `@intentos/server` dep — already in the pnpm
  store at 9.15.1 via @google-cloud/secret-manager, so no new download; avoids the heavy
  @google-cloud/{firestore,vertexai} + firebase / firebase-admin packages). Verify Firebase ID tokens
  with node crypto against the securetoken x509 certs. Hand-roll the SIWE message; verify with viem
  `verifyMessage`.

### M5 infra to provision (GCP project ethglobal-nyc2026-rtree)
- Enable APIs: `identitytoolkit.googleapis.com` (Firebase Auth / GCIP), `firestore.googleapis.com`,
  `aiplatform.googleapis.com` (Vertex), `iamcredentials.googleapis.com` (signJwt).
  - **DO NOT enable `generativelanguage.googleapis.com` (Gemini Developer API).** It is currently
    DISABLED (verified 2026-06-13) and must stay that way — see the D2 security box. We use Vertex
    (`aiplatform`) via ADC, which needs no API key.
- Initialize **Firebase Auth** (GCIP) on the project + ensure custom-token sign-in is on (may need a
  one-time console "Get started" click — flag to user). **Decline / skip any "Firebase AI Logic" or
  "Gemini in Firebase" step in the wizard** — it enables the Gemini Developer API and mints a public
  Gemini key (the exact disaster D2 warns about).
- Create a **Web API Key** (browser): **API restrictions = ONLY `identitytoolkit.googleapis.com` +
  `securetoken.googleapis.com`**. Never add "Generative Language API". Expose to the browser as
  `VITE_FIREBASE_API_KEY` (non-secret) + `VITE_FIREBASE_PROJECT_ID`. (Defense-in-depth: even if the
  Gemini Dev API were ever enabled, this key can't call it.)
- Create **Firestore** database (Native mode, us-central1 or nam5).
- Grant Cloud Run SA `intentos-panel@…`: `roles/iam.serviceAccountTokenCreator` (on itself, for
  signJwt), `roles/datastore.user` (Firestore), `roles/aiplatform.user` (Vertex).
- Optional hardening (post-MVP): Firebase App Check on the browser; tighten `identitytoolkit` quota;
  Vertex per-minute quota cap as a billing circuit-breaker.

### Open decisions (revisit as needed — user: "必要に応じて議論継続しよう")
- True per-wallet on-chain isolation (each user their own 7702 Owner) — deferred to PRODUCT mode.
- Firestore security rules vs. backend-only access (currently backend-only via ADC; browser never
  touches Firestore directly).

### Done in this session
- Intent List (`#/intents`): session-scoped active state; empty-state has no stray button (entry
  moved into the right card); "Run a new Intent" disabled while an Intent is live; Reset kept.
- Wallet connect: EIP-6963 connector **picker** (pick MetaMask), surfaces connect errors.
- **Full M5 build shipped + deployed** (revision intentos-panel-00002+): single-screen Launch wizard,
  Live Console, server auth/store/vertex modules, GCP infra provisioned, e2e green. Live-verified via
  ADC: signJwt + Firestore + Vertex all PASS.
- **Post-deploy fixes (from live feedback):**
  1. **Removed HTTP Basic auth.** It does not attach to `fetch()`/XHR, so it caused repeated native
     login popups + intermittent `/api/*` 401 (incl. `/api/state 401`, and a non-JSON "Authentica…"
     body breaking the trade button). Now public = SPA + `/api/state` (read-only) + `/api/auth/*`; ALL
     money-write endpoints are gated by Firebase ID token (`requireUid`). Deploy with `--clear-secrets`.
  2. **Vertex confirmed backend-only** (browser → `/api/intent/chat` → server → Vertex via ADC). The
     "missing bearer token" was sign-in not completing because Basic-auth blocked the handshake fetches;
     fixed by (1) + a manual **"Sign in"** retry button on the wallet chip + reactive auth state.
  3. **Live Console empty-state**: shows "No running Intent yet" until the session has an Executor
     (`hasActiveIntent`) — previously it always rendered the SHARED demo Owner's timeline/history as if
     it were the user's. e2e covers it.

### Back-port checklist — DONE (2026-06-13)
- ✅ North Star §2 (JP source + EN mirror): added the IA v2 implementation note (3 destinations).
- ✅ interfaces.md: §15.1 (IA v2), §16 (store), §17 (auth), §18 (control-panel API + StartConfig).
- ✅ SDD `050-sdd-frontend.md` §8 (routes/data-sources for wizard + console).
- ✅ SDD `040-sdd-runtime.md` §9 (store + IntentBuilder LLM + StartConfig + bounded loop).
- ☐ SDD `020-sdd-overview.md`: end-to-end sequence for merged Console + history (minor; pending).

Safety reminders unchanged: tiny amounts only; bounded actions; keys only in KMS/Secret Manager;
never log secrets. (Basic auth removed — Firebase Auth is the gate; Cloud Run is `--allow-unauthenticated`
at the edge but `/api/*` writes require a Firebase ID token.)
