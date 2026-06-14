# Production Debug: Connected Owner Resume / Frozen Guard

Status: active incident investigation  
Reported at: 2026-06-14 06:24 EDT  
Panel: <https://intentos-panel-41929375451.us-central1.run.app/#/console>

Resolution update: restored at 2026-06-14 06:58 EDT by local Owner-signed unfreeze. Live state now shows `guard.frozen:false`, `amountCapPerTx:2000`, and two successful `EvidenceCommitted` BUY events for Executor #26.

Follow-up UX update: auto-refresh was too passive during runtime execution. `GET` API calls and `/api/state` now use `cache:no-store`, server JSON responses send `cache-control:no-store`, and runtime status polling forces chain-state refresh while a runtime is scheduled/running/stopping.

## Open issue: IntentBuilder sometimes emits nearly empty AGENTS.md

Reported 2026-06-14 07:13 EDT. Not fixed here; handing off to another team.

User-visible symptom:

- In the Launch IntentBuilder, the generated Agent Package `AGENTS.md` is sometimes almost empty, e.g. only a name like `DCAExecutor` instead of the expected objective/tools/never/default content.
- This appears intermittent: other generations produce normal `AGENTS.md`.

Known implementation facts:

- IntentBuilder lives in `packages/server/src/vertex.ts`.
- Production defaults to Vertex AI (`INTENTOS_LLM=vertex` or production runtime default) using model `INTENTOS_VERTEX_MODEL ?? "gemini-2.5-flash"` and location `INTENTOS_VERTEX_LOCATION ?? "us-central1"`.
- Vertex call uses `generationConfig: { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: "application/json" }`.
- The prompt asks for strict JSON with `executor.agents` and `watcher.agents`, but does not specify a minimum length or required section headings for each `agents` field.
- `normalize()` preserves any non-empty string from the model: `agents: ascii(draft.agents, fallback.agents, 1200)`. Because `ascii()` only falls back on empty/non-string values, a too-short non-empty string like `DCAExecutor` is accepted and stored.
- `normalize()` also truncates `agents` to 1200 chars. This does not directly explain a one-word output, but it is another size constraint to review if richer AgentMD is desired.
- `intentChat()` persists the generated packages immediately unless a package is already FIXed (`packages/server/src/intent.ts`). A bad-but-non-empty `agents` value therefore becomes the visible draft and can be FIXed by the user.
- UI renders `pkg.agents` directly in LaunchFlow `PackageCard` under `AGENTS.md`; there is no client-side quality gate.

Current hypothesis:

1. `maxOutputTokens: 2048` may be too small for two full packages (reply + executor summary/agents/soul/constraints/semantic + watcher summary/agents/soul/constraints/semantic) in strict JSON, so Gemini may compress the long `agents` fields.
2. More importantly, the server lacks a quality/minimum-content validator: any non-empty `agents` string passes. Even if token size is raised, the model can still emit a terse label unless the prompt and validator require structure.

Recommended fix direction for next team:

1. Increase Vertex `maxOutputTokens` for IntentBuilder, likely to 4096 or 8192, preferably via env such as `INTENTOS_VERTEX_MAX_OUTPUT_TOKENS`. First mitigation applied: default is now `20480` (10x previous `2048`) and AGENTS.md normalization cap is now `12000` chars.
2. Strengthen the system prompt: require `agents` to be full AGENTS.md with explicit sections (`# Executor Agent`, `Objective`, `Tools`, `Never`, `Default`, `Evidence`, etc.) and minimum detail.
3. Add server-side validation/repair in `normalize()`:
   - Treat `agents` as invalid if trimmed length is below a threshold (e.g. `< 180` or missing `Objective:`/`Tools:`/`Never:`).
   - Fall back to default package `agents` or merge the model-specific text into the default template rather than accepting a one-word value.
   - Consider logging a warning with lengths (not raw user prompt/secrets) when repair happens.
4. Consider exposing AGENTS.md editing before FIX, similar to existing semantic guardrail editing, so the user can correct a bad AgentMD without regenerating.
5. Add a regression test for `normalize()` with `{ agents: "DCAExecutor" }` and assert it falls back/repairs instead of preserving the terse string.

Fast verification commands for next team:

```bash
pnpm --filter @intentos/server typecheck
INTENTOS_LLM=vertex INTENTOS_LLM_STRICT=1 pnpm --filter @intentos/server exec tsx src/scripts/m5-live-check.ts
```

Relevant files:

- `packages/server/src/vertex.ts` — prompt, Vertex `maxOutputTokens`, `normalize()`/`ascii()`.
- `packages/server/src/intent.ts` — generated draft persistence and FIX behavior.
- `app/src/LaunchFlow.tsx` — AGENTS.md display in PackageCard.
- `packages/server/src/intentTypes.ts` — AgentPackageDraft shape.

## User-visible symptom

- Live Console shows the connected Owner account as `frozen`.
- `Execute guarded trade (0.001 USDC -> WETH)` returns `rejected: guard is frozen -- resume first`.
- `Resume / unfreeze (Owner only)` displays `[object Object]`.
- Active Intent timeline shows `0 events`.

## Confirmed live state

For reported connected Owner `0x5E9041E731E10727d923D79B1e83290f6E83a221`, live `/api/state` confirms:

- `delegated: true`
- `guard.frozen: true`
- `amountCapPerTx: 1000` (0.001 USDC)
- `cumulativeSpent: 2000` (0.002 USDC)
- `execVault: 397167628000000`
- `watcherVault: 199362710000000`
- `timeline: []`

For the shared demo Owner with no `address` query param, live `/api/state` currently returns `guard.frozen: false`. This confirms the incident is per connected Owner EOA/account-level state, not a global panel outage.

Live `/api/config` confirms deployment mode is correct:

- `authRequired: true`
- `ownerMode: connected`
- `worldIdRequired: true`

## Current root-cause assessment

This is primarily a connected-Owner resume failure, not an Executor/Agent trade bug.

1. The trade rejection is expected while the account-level guard is frozen. `trade()` explicitly returns `ok:false` with `guard is frozen -- resume first` when `guard.frozen` is true (`packages/server/src/journey.ts`).
2. `0 events` is expected after the active-intent timeline filter: `EvidenceCommitted` is filtered by `intentId`, while `GuardFrozen`/`GuardTightened` are account-level and are hidden when an active intent filter is present.
3. Resume/unfreeze must be signed by the connected Owner wallet as an EIP-7702 self-call to `ownerUpdateGuard`. The server correctly refuses to sign owner-authority resume in connected mode.
4. `[object Object]` is a UI error-formatting bug: browser wallet/RPC providers can throw plain objects, and the shared `ActionButton` displayed `String(e)`.
5. The likely functional failure is wallet-send compatibility: `walletClient.sendTransaction` can fail for this EIP-7702 self-call, and the existing fallback to raw EIP-1193 `eth_sendTransaction` was not reached if `walletClient` existed but threw.

## Known QA mapping

This matches existing QA entries:

- `API-009 Connected Owner resume reliability` (`plan/070-qa-register.md`)
- `API-010 New Intent guard reset` (`plan/070-qa-register.md`)
- `UX-004 Active-intent timeline vs account-level guard state` (`plan/070-qa-register.md`)

Planner review result: this is an already-known QA path, not a new protocol flow gap. Priority is P0 live-test/fix connected Owner `ownerUpdateGuard` through Resume and Start, with EIP-1193 fallback and readable wallet errors.

Manager review result: live config is correct, so this is not a Cloud Run env-drop/deploy issue. The connected Owner is genuinely frozen on Base, contract/server behavior is correctly blocking execution, and the user-visible confusion is concentrated in active-intent timeline filtering plus poor wallet error normalization.

Tech Lead review result: root cause is likely frontend race + wallet UX, not contract. `ownerModeCached()` defaults to `demo` until `/api/config` loads, while the route gate previously allowed entry before `configLoaded`; Live Console could therefore call server `/api/owner/resume`, which correctly fails in connected mode. Live logs reportedly confirm `POST /api/owner/resume failed: connected mode: resume...`.

## Mitigation / fix status

Current code state:

- Added `app/src/walletSelfCall.ts`
  - extracts readable messages from wallet/RPC object errors
  - tries `walletClient.sendTransaction`
  - if that fails, falls back to `window.ethereum.request({ method: "eth_sendTransaction" })`
- Updated `app/src/ActionButton.tsx` to avoid `[object Object]` and show a real error message.
- Updated `app/src/LiveConsole.tsx` to use the shared self-call helper.
- Updated `app/src/LaunchFlow.tsx` to use the same shared self-call helper for Start-time guard reset.
- Updated `app/src/gate.ts` so gated routes cannot pass until `/api/config` has loaded, preventing the connected-vs-demo ownerMode race.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- Deployed to Cloud Run revision `intentos-panel-00044-g7s`; deploy verification passed with `authRequired:true`, `ownerMode:"connected"`, and `worldIdRequired:true`.

Remaining local cleanup:

- Live retest with Owner `0x5E9041E731E10727d923D79B1e83290f6E83a221`:
  1. click Resume / unfreeze
  2. confirm wallet prompt signs self-call
  3. confirm `/api/state?address=0x5E9041E731E10727d923D79B1e83290f6E83a221&intentId=intent-uuhyys` returns `guard.frozen:false`
  4. retry guarded trade with tiny amount

## Open investigation threads

- Need Cloud Run logs around the exact failed Resume click if the readable error still does not explain the wallet/provider failure.
- If both viem and raw `eth_sendTransaction` fail, next fallback candidate is using the existing Activation Kit transaction path for `ownerUpdateGuard`.

## Operator fix procedure

1. Deploy the current frontend fix with `./scripts/build-panel.sh && ./scripts/deploy-panel.sh`.
2. Hard-refresh the panel so the browser gets the new bundle.
3. Connect/sign in as Owner `0x5E9041E731E10727d923D79B1e83290f6E83a221`.
4. Click `Resume / unfreeze (Owner only)` and approve the wallet self-call to `ownerUpdateGuard`.
5. Confirm `/api/state?address=0x5E9041E731E10727d923D79B1e83290f6E83a221&intentId=intent-uuhyys` returns `guard.frozen:false`.
6. Retry the tiny guarded trade.

Important: the server cannot unfreeze a connected Owner EOA. Only the Owner wallet can sign the loosening/unfreeze transaction.

## Emergency local unfreeze script

If the browser wallet rejects the EIP-7702 self-call with `External transactions to internal accounts cannot include data`, use:

```bash
./scripts/owner-unfreeze.sh
```

Equivalent manual command:

```bash
read -rsp 'OWNER_PRIVATE_KEY: ' OWNER_PRIVATE_KEY; echo
export OWNER_PRIVATE_KEY
pnpm --filter @intentos/server owner:unfreeze
unset OWNER_PRIVATE_KEY
```

Mnemonic is also supported without writing it to disk:

```bash
read -rsp 'OWNER_MNEMONIC: ' OWNER_MNEMONIC; echo
export OWNER_MNEMONIC
OWNER_ACCOUNT_INDEX=0 pnpm --filter @intentos/server owner:unfreeze
unset OWNER_MNEMONIC
```

Optional overrides, in raw USDC base units:

- `OWNER_ADDRESS` (defaults to `0x5E9041E731E10727d923D79B1e83290f6E83a221`)
- `OWNER_AMOUNT_CAP_PER_TX` (default: keep current)
- `OWNER_CUMULATIVE_CAP` (default: keep current)
- `OWNER_SLIPPAGE_CAP_BPS` (default: keep current)
- `OWNER_EXPIRY` (default: extend to at least 24h)

For the current `#/launch` screen showing `amountCapPerTx 0.002 USDC`, run the emergency script with:

```bash
read -rsp 'OWNER_PRIVATE_KEY: ' OWNER_PRIVATE_KEY; echo
export OWNER_PRIVATE_KEY
OWNER_AMOUNT_CAP_PER_TX=2000 OWNER_CUMULATIVE_CAP=100000 pnpm --filter @intentos/server owner:unfreeze
unset OWNER_PRIVATE_KEY
```

Then hard-refresh the panel and start the runtime again. `LaunchFlow` now skips the browser wallet self-call when the on-chain guard is already unfrozen and matches the planned caps.

2026-06-14 update: MetaMask blocks `from == to == delegated EOA` transactions with calldata before the signature prompt (`External transactions to internal accounts cannot include data`). Browser Resume/Start owner self-calls are therefore not a reliable MetaMask path. Use the local script/Activation Kit path for connected Owner unfreeze/reset/fund-owner self-calls.

2026-06-14 06:58 EDT: `./scripts/owner-unfreeze.sh` successfully sent `0x1c67606da85959ea9c9468f7f19a36480bb085ee8744fd6b83b8a5babb4b864d`. The immediate script read initially showed stale `frozen:true`, but live `/api/state` then confirmed `frozen:false`, cap `0.002 USDC`, and subsequent tiny trades `0x5c09512f55d1fd016d2058037ce05c3f59a954f2a6951bfb6331ef48fd7b017b` and `0xaaf446aab176e4f78f8eadfa00478ccd6944dcac069c8da1119857cbff6ffb90` succeeded. The script now polls after receipt to reduce stale-RPC confusion.

---

## Second-team validation (manager / tech lead / planner) — 2026-06-14

A second team independently re-investigated and **verified the first team's fix against the live
working tree** (not just the PD claims). Result: the diagnosis and the committed fix are correct, with
**one decisive open item (deploy)** and a few nuances the first PD under-weighted.

### Verification of the committed fix (tech lead)

Confirmed on disk + in `git` (the fix is committed in the `WIP` commits, not just claimed):

- `app/src/walletSelfCall.ts` is **tracked** and exports `walletErrorMessage` + `sendOwnerSelfCall`.
- `app/src/ActionButton.tsx` now does `setError(walletErrorMessage(e))` — **kills `[object Object]`.** ✓
- `app/src/LiveConsole.tsx` `ownerResume()` (connected) → `ownerGuardPlan` → encode `ownerUpdateGuard`
  → `sendOwnerSelfCall(walletClient, address, state.delegate, data)` (viem then EIP-1193 fallback). ✓
- `app/src/LaunchFlow.tsx` `applyIntentGuard()` uses the same shared helper for Start-time reset. ✓
- `app/src/gate.ts` `useGate()` returns `configLoaded` and `passed = loaded && …` — closes the
  demo-vs-connected `ownerMode` race that could route a connected user into the server `/api/owner/resume`
  path (which correctly refuses). ✓
- **Unfreeze is real:** `guardFromDraft()` returns `frozen: false` (journey.ts:238); `ownerUpdateGuard`
  overwrites the whole guard (keeping only `bindingNonce`), so Resume genuinely clears `frozen`. ✓

### Reframe of "the agent doesn't work" (manager)

The connected Owner `0x5E90…a221` shows `cumulativeSpent: 0.002 USDC` = **two guarded trades already
executed successfully**, then `frozen: true`. So the Executor is **not broken** — it worked, then the
account-level guard was frozen (most likely a `VOTE_FREEZE` test: `watcherFreeze` is relayer-sponsored
and needs no Owner signature, so one click freezes the connected account). The trade rejection and the
`0 events` timeline are both **expected** while frozen + active-intent-filtered. The real defect was the
**recovery UX** (`[object Object]` + a wallet-send path with no fallback), now fixed in code.

### The one thing that actually matters right now (all three roles agree)

**The fix is committed but NOT deployed.** The live panel still serves the OLD bundle, so the user keeps
seeing `[object Object]`. Nothing changes until:

```
./scripts/build-panel.sh && ./scripts/deploy-panel.sh
```

DEPLOY HAZARD (repo memory, recurring): the parallel "Conduct Code Review" agent's image-only
`gcloud run deploy --source .` can SEIZE traffic in **demo** mode and drop the World ID env. After
deploying, re-verify `/api/config` still returns `ownerMode:connected` + `worldIdRequired:true`
(the deploy script asserts this and exits nonzero if dropped — use it, never hand-type gcloud).

### Will the browser Resume actually broadcast for this EOA? (tech lead — answers the PD's open thread)

Yes, expected to work. `0x5E90…a221` was activated via the **Local Activation Kit** because MetaMask
refuses the 7702 `signAuthorization`. But Resume is **not** a `signAuthorization` — it is a plain
self-call tx on an **already-delegated** account, which MetaMask can broadcast normally. The user is
currently **connected + signed in** as `0x5E90…a221` (SIWE required a signature from that key in the
browser wallet), so the key IS in the browser wallet → the self-call should broadcast. The Activation-Kit
`ownerUpdateGuard` path remains a fallback only if both viem and raw `eth_sendTransaction` fail.

### Minor follow-ups (planner — non-blocking)

- `ActionButton` still renders `error.slice(0, 60)`; the new readable wallet error can be truncated.
  Consider widening or a tooltip. Low priority.
- All 7 of this wallet's Intents read `status: "live"` simultaneously (SESSION-001 data hygiene). Not a
  blocker for Resume (one EOA = one account-level guard), but the history/active-intent selection is
  noisy. Track separately.
- QA mapping stands: API-008 / API-009 / API-010 / UX-004. Move them to "Fixed, pending live retest"
  only AFTER the deploy + the live Resume→trade retest below passes.

### Go/No-go retest (unchanged, restated)

1. `./scripts/build-panel.sh && ./scripts/deploy-panel.sh`; verify `/api/config` (connected + worldId).
2. Hard-refresh panel; connect + sign in as `0x5E90…a221`.
3. Click **Resume / unfreeze** → approve the wallet self-call to `ownerUpdateGuard`.
4. `/api/state?address=0x5E9041E731E10727d923D79B1e83290f6E83a221&intentId=intent-uuhyys` →
   expect `guard.frozen:false`.
5. Retry the tiny guarded trade → expect `ok:true` with a tx hash.

Second-team verdict: **diagnosis correct, fix correct and wired, ship it (deploy) then retest.** No
contract change, no protocol gap.

---

## DEFINITIVE ROOT CAUSE — browser Resume is a DEAD END on MetaMask (2026-06-14, continued investigation)

> **Correction of my own earlier claim.** Above I wrote "browser Resume should work … the self-call
> should broadcast." **That was wrong.** After the deploy the `[object Object]` UX bug was fixed (good —
> that confirms the deploy + readable-error fix landed), but the *real* wallet now surfaces the actual
> block, and it is **not bypassable from the browser on MetaMask.**

### The exact error, traced to MetaMask's source

Live error on Resume: `External transactions to internal accounts cannot include data`.

This string is thrown by **`@metamask/transaction-controller`**,
`packages/transaction-controller/src/utils/validation.ts` → `validateTransactionOrigin()`
(verified via GitHub code search of `MetaMask/core`):

```ts
export async function validateTransactionOrigin({ data, from, internalAccounts, isInternal, origin, txParams, type, ... }) {
  if (isInternal) return;                                    // MetaMask's OWN send UI bypasses the check
  const { authorizationList, to, type: envelopeType } = txParams;
  if (authorizationList || envelopeType === setCode)
    throw rpcErrors.invalidParams('External EIP-7702 transactions are not supported');
  const hasData = Boolean(data && data !== '0x');
  if (hasData && internalAccounts?.some(a => a.toLowerCase() === to?.toLowerCase()))
    throw rpcErrors.invalidParams('External transactions to internal accounts cannot include data');
}
```

Our Resume is an EIP-7702 Owner **self-call**: `from == to == 0x5E90…a221`, carrying `ownerUpdateGuard(...)`
calldata. **All three trigger conditions are met simultaneously:**

1. `isInternal === false` — the tx is **dApp-initiated** (origin = the panel website, via wagmi/
   `window.ethereum`). Only MetaMask's own internal Send flow sets `isInternal=true`.
2. `hasData === true` — it carries `ownerUpdateGuard` calldata.
3. `to ∈ internalAccounts` — `to` is the user's OWN EOA, which is in MetaMask's account list (it must be,
   since they connected + SIWE-signed with it).

→ MetaMask **rejects the request before the signing prompt**. This is a categorical anti-phishing guard,
not a transient/race error.

### Why the committed fix cannot rescue this path

`sendOwnerSelfCall`'s fallback to raw `window.ethereum.request({ method: "eth_sendTransaction" })` hits the
**exact same** `validateTransactionOrigin` with `isInternal=false` → identical rejection. **viem path and
EIP-1193 path both dead-end.** The fix correctly fixed the *error display*; it cannot change MetaMask's
policy.

### This is the SAME class of wall as activation (now generalized)

Repo memory already records: *"MetaMask CANNOT activate … browser self-delegate is a DEAD END …
signAuthorization is LOCAL-ACCOUNT-ONLY."* This investigation **extends** that: **every owner-authority
self-call is blocked from the dApp on MetaMask**, not just activation. The asymmetry that trapped the user:

| Operation | Path | MetaMask? | Works from browser? |
|---|---|---|---|
| Watcher `VOTE_FREEZE` / `VOTE_TIGHTEN` | relayer-sponsored (watcherKey signs, platform relays) | no | **YES** (1 click) |
| Owner `Execute guarded trade` | relayer-sponsored (SessionKey signs, platform relays) | no | YES (once unfrozen) |
| Owner `Resume / unfreeze` (`ownerUpdateGuard`) | **Owner self-call** | **yes** | **NO — blocked** |
| Owner activate / `fundGasVault` / `ownerStop` | **Owner self-call** | **yes** | **NO — blocked** |

So a connected user can **freeze themselves in one click but cannot unfreeze from the browser.** The only
reliable way to issue any owner self-call on MetaMask is a **locally-signed** tx (the script / Activation
Kit), which never enters MetaMask's dApp-origin validation (`isInternal` is irrelevant — it isn't MetaMask).

### Other blockers RULED OUT (so the unfreeze actually sticks) — live-verified `0x5E90…a221`

The freeze is the **sole** blocker; nothing else will bite after unfreeze:

- `guard.expiry = 1781500676` → **~18h in the future**, NOT expired. (No follow-on `Expired` revert.)
- `amountCapPerTx = 1000` (0.001 USDC); trade `amountIn = 1000` → `1000 > 1000` is false → passes.
- `cumulativeCap = 100000` (0.1), `cumulativeSpent = 2000` → 2000+1000 ≤ 100000 → passes.
- `usdc balance = 4.976687 USDC` → ample for tiny swaps. `bindingNonce = 1` (matches).
- **Owner raw ETH balance = 0.009982 ETH**, vault counters = 0.000597 ETH → **~0.00938 ETH spare** → more
  than enough to pay gas for the owner-funded `ownerUpdateGuard` self-call (and the trade reimburses from
  the 0.000397 ETH exec vault). **No insufficient-funds risk for the script.**

Conclusion: run the local script → `frozen` clears → the guarded trade will succeed server-side.

### ⚠️ The emergency script will FAIL TO START as written — 1-line import fix needed

`packages/server/src/scripts/owner-unfreeze.ts` imports:

```ts
import { abi as delegateAbi } from "@intentos/shared/abis/ExecutionDelegate7702";  // ✗ unresolvable
```

Two problems: (1) `@intentos/shared`'s `package.json` `exports` map exposes only `"."`, so the
`/abis/ExecutionDelegate7702` **subpath cannot be resolved** (Node's exports field blocks unlisted
subpaths) → `ERR_PACKAGE_PATH_NOT_EXPORTED` on launch; (2) even if it resolved, the ABI is re-exported
from the package **root** as the named const `ExecutionDelegate7702Abi` (the JSON array itself), there is
no `{ abi }` export. Fix (whoever owns the script — it's open in the parallel agent's session):

```ts
import { ExecutionDelegate7702Abi as delegateAbi, type HardGuardState } from "@intentos/shared";
```

(`getBaseRpcUrls` from `@intentos/runtime` is fine — `secrets.js` is re-exported from the runtime index.)

### Mnemonic vs private-key (so the script loads the RIGHT key)

`0x5E90…a221` was activated via the kit. If it was **imported into MetaMask as a raw private key**, a
seed phrase will NOT derive it at any index → use `OWNER_PRIVATE_KEY`. If it came from your MetaMask
**seed**, use `OWNER_MNEMONIC` and, if the account isn't #1, set `OWNER_ACCOUNT_INDEX` (0,1,2,…). The
script already asserts `derived address === OWNER_ADDRESS` and exits with a clear message on mismatch, so
just bump the index until it matches. Never paste the secret into chat or a file — the `read -rsp` env
pattern in the script's help is correct.

### Corrected verdict

- The deployed frontend fix is good and necessary (kills `[object Object]`, closes the ownerMode race),
  **but it does NOT make browser Resume work on MetaMask — that path is architecturally a dead end.**
- **Unblock now:** fix the script's 1-line import, then run `owner:unfreeze` with the owner key/mnemonic.
  Everything else on-chain is already in a passing state; the trade will work once `frozen` clears.
- **Product follow-up (separate from this incident):** in connected mode the UI should not present Owner
  self-call buttons (Resume/unfreeze, fund, activate) as plain browser actions on MetaMask — it should
  route them through the local kit/script (or detect MetaMask and surface the kit), the same way
  activation already does. Otherwise users can freeze themselves into a corner they can't exit in-app.
