# 110 — World ID Integration (research + change map)

**Goal.** Replace the current *client-only mocked* World ID gate with a real, **server-enforced**
World ID **Proof of Human** check, bound to the signed-in Owner EOA, so it actually does its North Star
job: stop bots/sybils from mass-creating Cloud Run runtimes (compute/cost abuse gate).

Status: research + plan. Implementation scaffolding follows in code; the Developer-Portal app + signing
key are a **manual one-time step only the repo owner can do** (see §6). Links current as of 2026-06-14.

---

## 1. Why World ID here (recap from North Star §2)

- The Owner connects a wallet, signs in (SIWE → Firebase), and **proves personhood** before entering.
- World ID is **not** used for execution (Base mainnet is). It is a **human-proof abuse gate** placed
  *before runtime creation*, because each Agent spins up a real OpenClaw Runtime Capsule on Cloud Run —
  if a wallet alone could do that unboundedly, bots would farm our compute/model/indexer budget.
- It's also an ETHGlobal NYC 2026 sponsor (World ID 4.0 track).

---

## 2. Current state in OUR code (what exists today)

| File | What it does now | Gap |
| --- | --- | --- |
| [app/src/gate.ts](../app/src/gate.ts) | `WORLDID_APP_ID`/`WORLDID_ACTION` from Vite env; `worldIdVerified()`/`setWorldIdVerified()` persist a `"1"` flag in **sessionStorage**; `useGate()` combines wallet+SIWE+worldId | The proof is **faked client-side** — sessionStorage flag, no real proof, **no server check** |
| [app/src/Onboarding.tsx](../app/src/Onboarding.tsx) | Renders the gate; when `WORLDID_APP_ID` set shows an empty `<div id="worldid-slot" />`, else a **"Simulate World ID proof (dev)"** button | The IDKit widget is **never mounted** into `#worldid-slot`; dev button just flips the flag |
| [cloudbuild.yaml](../cloudbuild.yaml) / [Dockerfile](../Dockerfile) | Already pass `VITE_WORLDID_APP_ID` + `VITE_WORLDID_ACTION` build args | Need to also pass `rp_id` to the client and the **RP signing key as a server secret** |
| [packages/server/src/server.ts](../packages/server/src/server.ts) | Path-routed HTTP server; has `/api/config`, `/api/auth/nonce`, `/api/auth/web3`; write-path gated by Firebase ID token | **No `/api/worldid/*` endpoints**; the gate is not enforced server-side at all |
| [packages/server/src/store.ts](../packages/server/src/store.ts) | `Store` interface (Memory + Firestore REST), per-uid intents/turns/runtimes | **No nullifier persistence** (needed for one-human-one-action) |
| [packages/runtime/src/secrets.ts](../packages/runtime/src/secrets.ts) | Secret Manager loader pattern (`accessSecretVersion`) | Need a loader for the **RP signing key** secret |

**Key finding:** today's gate is cosmetic. A bot can `sessionStorage.setItem("intentos:worldid","1")`
and walk straight in. Real World ID must be **verified on the server** and the **human-verified state must
gate the write-path** (mint / `runtime/spawn`), exactly like the Firebase token already gates money/LLM.

---

## 3. How World ID v4 actually works (from docs + SKILL.md)

> Use **IDKit `^4.x`**. Do **NOT** use `^2.x`/`^3.x` samples — the v4 API was redesigned and old code
> will not work. Credential preset for "unique real human" = **`orbLegacy`** (Proof of Human).

Four actors: **client** (IDKit) · **our backend** (signs requests, verifies proofs, holds secrets) ·
**World App** (on the user's phone, makes the ZK proof) · **Developer Portal** (validates proofs).

Six steps:

1. **Install IDKit** — React widget `@worldcoin/idkit` (client) + `@worldcoin/idkit-core/signing`
   (Node backend RP signing).
2. **Create the app in the Developer Portal** (`app_mode: external` for IDKit — *not* `mini-app`).
   Capture **`app_id`**, **`rp_id`**, and the **`signing_key` (private)** — the portal shows the signing
   key **exactly once**. Store it in **GCP Secret Manager** immediately.
3. **Backend signs the RP request** — `signRequest({ signingKeyHex: RP_SIGNING_KEY, action })` returns
   `{ sig, nonce, created_at, expires_at }`. *Why backend:* the signing key authenticates our app; if it
   leaks, anyone can forge proof requests. **Never on the client. Never a `VITE_*`/`NEXT_PUBLIC_*` var.**
4. **Client opens IDKit** with that signature:
   ```ts
   const rpSig = await fetch("/api/worldid/sign", { method:"POST", body: JSON.stringify({ action }) }).then(r=>r.json());
   const request = await IDKit.request({
     app_id, action,
     rp_context: { rp_id, nonce: rpSig.nonce, created_at: rpSig.created_at, expires_at: rpSig.expires_at, signature: rpSig.sig },
     allow_legacy_proofs: true,
     environment: "production",        // "staging" only for the simulator
   }).preset(orbLegacy({ signal: ownerAddress }));   // bind the proof to the signed-in EOA
   const response = await request.pollUntilCompletion();   // (widget shows QR / deep-links World App)
   ```
5. **Backend verifies** — forward the IDKit payload **byte-for-byte** to
   `POST https://developer.world.org/api/v4/verify/{rp_id}`. *Why backend:* a client can return any JSON;
   only the World verifier (called from a trusted server) confirms the proof is real. **Do not mutate the
   proof JSON.**
6. **Store the nullifier** — every proof returns a `nullifier` (RP-scoped, action-scoped, irreversible,
   same human+action ⇒ same nullifier). Persist `(action, nullifier)` with a **UNIQUE** constraint and
   reject duplicates. Store as a 256-bit decimal (e.g. Firestore string / `NUMERIC(78,0)` in SQL).

Environment trap: the IDKit `environment`, the action's environment, and simulator-vs-real-app must
**all match**. For real phones the action must be **production**. Make **both** staging + production
actions so the simulator works for dev QA.

---

## 4. Target design for IntentOS (decisions)

1. **Bind the proof to the Owner EOA.** Use `signal = ownerAddress` (the SIWE-signed-in address). The
   server re-checks the same signal so a proof can't be lifted onto another account.
2. **Server-enforced gate, tied to the Firebase uid.** After `/api/worldid/verify` succeeds, persist a
   **`humanVerified` record keyed by `uid`** (our `uid = eip155:8453:<addr>`), storing
   `{ nullifier, action, verifiedAt }`. The **write-path that creates runtimes/mints must require it**.
3. **Uniqueness = one human per action.** Enforce `UNIQUE(action, nullifier)`. If the same nullifier is
   already bound to a *different* uid, reject (a single human shouldn't farm many wallets through the
   gate). If it's the same uid, it's an idempotent re-verify.
4. **Keep the dev mock, but make it impossible in production.** When `INTENTOS_WORLDID=off` (or no
   `app_id`/secret) the existing simulate button stays for local/e2e. When the server is configured for
   World ID, the server **rejects** the cosmetic path and requires a verified nullifier (mirror of the
   AUTH-002 rule: the *server* decides, not the client build flag).

### 4.1 Where the gate is enforced

The North Star says World ID gates **runtime creation**. Concrete: require `humanVerified(uid)` in the
write-path before spawning a Capsule (and/or before mint). Touch points:
[packages/server/src/server.ts](../packages/server/src/server.ts) runtime/mint routes →
[packages/server/src/journey.ts](../packages/server/src/journey.ts) (`runtimeRun`/spawn) and
[packages/server/src/intent.ts](../packages/server/src/intent.ts).

---

## 5. Change map (files to add / edit)

### Backend (`packages/server/src`)
- **NEW `worldid.ts`** —
  - `worldIdEnabled()` (env: `INTENTOS_WORLDID`, presence of `app_id`/`rp_id`/signing key).
  - `signRpRequest(action)` → calls `@worldcoin/idkit-core/signing` `signRequest` with the secret.
  - `verifyProof(payload)` → POST to `https://developer.world.org/api/v4/verify/{rp_id}`, return result.
  - `loadRpSigningKey()` → Secret Manager (`worldid-rp-signing-key`), cached; never logged.
- **EDIT `server.ts`** — add two routes:
  - `POST /api/worldid/sign` (authed: needs Firebase uid) → `{ sig, nonce, created_at, expires_at }`.
  - `POST /api/worldid/verify` (authed) → verify proof, enforce `signal === uid's address`, persist
    nullifier (uniqueness), set `humanVerified(uid)`; return `{ verified: true }`.
  - Add `worldIdRequired` to `/api/config` so the client learns the truth from the server (AUTH-002 style).
  - Gate `runtime spawn`/mint route on `humanVerified(uid)` when `worldIdRequired`.
- **EDIT `store.ts`** — extend `Store`:
  - `getNullifier(action, nullifier): Promise<{ uid: string } | null>`
  - `putNullifier(action, nullifier, uid): Promise<void>`  (uniqueness: fail/no-op if exists for other uid)
  - `getHumanVerified(uid): Promise<boolean>` / `setHumanVerified(uid, rec)`
  - Firestore layout: `worldid/{action}__{nullifierDecimal}` = `{ uid, verifiedAt }`; mirror flag under
    `users/{uid}` = `{ humanVerified: true, worldIdAction, worldIdAt }`.

### Frontend (`app/src`)
- **EDIT `gate.ts`** — replace the sessionStorage truth with a server-derived one:
  - add `WORLDID_RP_ID` env; `worldIdRequiredCached()` from `/api/config` (like `authRequiredCached`).
  - keep a *local* "verified this session" cache but treat the **server** as source of truth.
- **EDIT `Onboarding.tsx`** / **NEW `WorldIdButton.tsx`** — mount the real IDKit flow into the gate:
  - on click: `POST /api/worldid/sign` → `IDKit.request(...).preset(orbLegacy({ signal: address }))` →
    `pollUntilCompletion()` → `POST /api/worldid/verify` → on success flip the gate.
  - keep the dev "simulate" button **only** when `!worldIdRequiredCached()`.
- **EDIT `api.ts`** — `api.worldIdSign(action)` + `api.worldIdVerify(payload)` (Bearer = Firebase token).
- **EDIT `auth.ts`** — extend `/api/config` parse to read `worldIdRequired` + `worldIdRpId`/`appId` if we
  choose to serve them from config instead of build-time Vite env.

### Config / infra
- **`cloudbuild.yaml` + `Dockerfile`** — already pass `VITE_WORLDID_APP_ID` + `VITE_WORLDID_ACTION`;
  add `VITE_WORLDID_RP_ID`. The **RP signing key is NOT a build arg** — it's a runtime **Secret Manager**
  secret mounted to the server (e.g. `--set-secrets` or accessed via ADC like the other secrets).
- **GCP Secret Manager** — new secret `worldid-rp-signing-key` (private signing key). Grant the panel SA
  `secretAccessor`.
- **Deps** — add `@worldcoin/idkit` (app) + `@worldcoin/idkit-core` (server) at **`^4.x`**. Note the repo
  policy: pnpm `minimumReleaseAge` blocks packages <7 days old — fine for idkit 4.x (long-released).

### Deps / packaging notes
- App already has duplicate `@wagmi/core`/`viem` (see plan/070 sign-in note). Adding idkit shouldn't
  touch that. Watch bundle size; idkit is React-only on the client.

---

## 6. Manual steps only the repo owner can do (blocking)

These need a World account + our GCP project; an agent can't do them safely:

1. **Create the Developer Portal app** (`app_mode: external`) — get `app_id`, `rp_id`. Prefer the
   **Developer Portal MCP** (`mcp__worldcoin-developer-portal__*`) over the dashboard; it captures the
   signing key reliably. Endpoint `https://developer.world.org/api/mcp`, Bearer team API key.
2. **Create the action** `intentos-onboarding` in **both** `staging` and `production`.
3. **Capture the `signing_key` once** and write it to Secret Manager `worldid-rp-signing-key` in the same
   step (the portal shows it only once; loss ⇒ rotate).
4. **Poll registration to `registered`** (`get_world_id_registration_status`) before relying on it.
5. Provide `app_id`/`rp_id` for the build substitutions; grant the panel SA access to the secret.

Until these exist, the code path stays in **dev-mock mode** (current behavior) so nothing breaks.

---

## 7. Security / policy checklist (must hold)

- RP signing key: **server-only**, Secret Manager, never a `VITE_*` var, never logged.
- Verify proofs **server-side**; forward the IDKit JSON **unmodified** to `/v4/verify/{rp_id}`.
- Persist nullifier with **UNIQUE(action, nullifier)**; reject duplicates (don't upsert).
- Server is the source of truth for "World ID required" (mirror AUTH-002); client flag can't bypass.
- Bind `signal` to the Owner EOA and re-check it server-side.
- World ID stays **out of the on-chain authority path** (identity/abuse-gate only; Base enforces money).
- Env must match end-to-end (production action for real phones; staging for the simulator).

---

## 8. Phased plan

- **Phase 1 (code scaffolding, no portal yet):** add `worldid.ts`, the two endpoints, `Store` nullifier
  methods (Memory + Firestore), `worldIdRequired` in `/api/config`, client `WorldIdButton` + api wiring —
  all **behind `worldIdEnabled()`** so unconfigured deploys keep the dev mock. Typecheck + e2e stay green.
- **Phase 2 (owner does §6):** create portal app/action, store the signing key secret, set
  `app_id`/`rp_id`, redeploy. Flip `INTENTOS_WORLDID=on`.
- **Phase 3:** enforce `humanVerified(uid)` on the runtime-spawn/mint write-path; QA with the simulator
  (staging) then a real phone (production); add a QA-register row.

---

## 9. Source links
- Overview: https://docs.world.org/world-id  ·  Concepts: https://docs.world.org/world-id/concepts
- Integrate (6 steps, all languages): https://docs.world.org/world-id/idkit/integrate
- SKILL (meta-guide): https://docs.world.org/world-id/SKILL.md
- RP signature spec: https://docs.world.org/world-id/idkit/signatures
- Verify reference: https://docs.world.org/api-reference/developer-portal/verify
- Error codes: https://docs.world.org/world-id/idkit/error-codes
- Developer Portal: https://developer.world.org  ·  MCP: https://github.com/worldcoin/developer-portal/tree/main/web/api/mcp
- Simulator (staging): https://simulator.worldcoin.org

---

## 10. TL;DR
Today's World ID gate is a **client-side mock** — no real proof, no server check, trivially bypassed.
Wire **IDKit v4 `orbLegacy`**: client opens IDKit with a **backend-signed** RP request, the **backend
verifies** the proof at `/v4/verify/{rp_id}` and stores the **nullifier uniquely**, binding it to the
signed-in EOA + Firebase uid; the **write-path (runtime spawn/mint) requires `humanVerified(uid)`**. RP
signing key lives **only** in Secret Manager. Ship the code behind `worldIdEnabled()` (dev mock until the
owner creates the Portal app + secret).
