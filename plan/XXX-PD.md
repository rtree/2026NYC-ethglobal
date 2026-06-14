# Production Debug: Connected Owner Resume / Frozen Guard

Status: active incident investigation  
Reported at: 2026-06-14 06:24 EDT  
Panel: <https://intentos-panel-41929375451.us-central1.run.app/#/console>

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

## Fix in progress

Local changes started:

- Added `app/src/walletSelfCall.ts`
  - extracts readable messages from wallet/RPC object errors
  - tries `walletClient.sendTransaction`
  - if that fails, falls back to `window.ethereum.request({ method: "eth_sendTransaction" })`
- Updated `app/src/ActionButton.tsx` to avoid `[object Object]` and show a real error message.
- Updated `app/src/LiveConsole.tsx` to use the shared self-call helper.

Remaining local cleanup:

- Wire `app/src/LaunchFlow.tsx` to the shared helper and remove duplicated self-call code.
- Run typecheck/build.
- Deploy only via `./scripts/build-panel.sh && ./scripts/deploy-panel.sh`.
- Live retest with Owner `0x5E9041E731E10727d923D79B1e83290f6E83a221`:
  1. click Resume / unfreeze
  2. confirm wallet prompt signs self-call
  3. confirm `/api/state?address=0x5E9041E731E10727d923D79B1e83290f6E83a221&intentId=intent-uuhyys` returns `guard.frozen:false`
  4. retry guarded trade with tiny amount

## Open investigation threads

- Manager and Tech Lead sub-agent reviews are still running at the time this note was created.
- Need Cloud Run logs around the exact failed Resume click if the readable error still does not explain the wallet/provider failure.
- If both viem and raw `eth_sendTransaction` fail, next fallback candidate is using the existing Activation Kit transaction path for `ownerUpdateGuard`.

