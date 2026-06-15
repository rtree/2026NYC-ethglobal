# IntentOS — Repo Instructions for AI agents

Project facts and the **mandatory** safety policy for this repository. Read before editing.

## What this is
- **IntentOS**: post-hackathon maintenance is pivoting to an x402-funded Executor-only TradingAgent.
  The ETHGlobal NYC 2026 MVP proved EIP-7702 guarded execution on Base mainnet with Executor + single
  Watcher; keep that as historical context, not the default next task.
- Current build doctrine is **real-first**: do not count mocks, fake balances, fake receipts, fake
  runtime status, or sessionStorage gates as product progress. Build the final x402 coin-in ->
  AgentFund -> Receipt NFT -> runtime execution -> receipt redeem/refund path first. Local server and
  local Anvil are allowed; PoCs are only for isolating blockers.
- Current product entry doctrine is **registry-first**: the first user-visible surface is ERC-8004
  registry metadata plus x402 HTTPS APIs, not the React panel. The panel may stay as debug/status UI
  only if it reads real state.
- Runtime acceptance requires **real OpenClaw**: Cloud Run must start/tick the actual OpenClaw
  AgentLoop with bounded cost/spend. Scripted dummy decision loops are not product progress.
- Source of truth: [doc/plan/000-northStar.md](../doc/plan/000-northStar.md) (JP) /
  [doc/plan/000-northStar-en.md](../doc/plan/000-northStar-en.md) (EN). Maintenance index:
  [doc/plan/120-maintenance-index.md](../doc/plan/120-maintenance-index.md). First pivot Issue:
  [doc/plan/130-issue-pivot-x402-funded-executor.md](../doc/plan/130-issue-pivot-x402-funded-executor.md).
  First registry/OpenClaw/Concierge implementation Issue:
  [doc/plan/150-issue-registry-openclaw-concierge.md](../doc/plan/150-issue-registry-openclaw-concierge.md).
  Interfaces frozen in [doc/plan/010-interfaces.md](../doc/plan/010-interfaces.md). SDD in
  `doc/plan/020`–`doc/plan/050`. Status in [doc/TASK.md](../doc/TASK.md).

## Languages & file conventions
- `doc/plan/000-northStar.md` stays **Japanese**. Everything else (docs, mocks, code, comments) in **English**.
- `doc/plan/` files increment by 10 (`000-`, `010-`, ...).
- `doc/mock/` is historical/visual reference only. It is not an acceptance target for maintenance work.

## Supply-chain security (MANDATORY)
JavaScript/Node uses **pnpm** (never npm/yarn). Python uses **uv** (never pip).

Already configured in this repo — keep these on:
- [.npmrc](../.npmrc): `ignore-scripts=true` (block install lifecycle scripts), `audit=true`,
  `min-release-age=7` (npm knob; days).
- [pnpm-workspace.yaml](../pnpm-workspace.yaml): `minimumReleaseAge: 10080` (**7 days** in minutes — only
  install modules ≥7 days old), `trustPolicy: no-downgrade`, `onlyBuiltDependencies: []` (block all
  build scripts unless explicitly allow-listed).
- `trustPolicyIgnoreAfter: 43200` (**30 days**): exempts the trust-downgrade check for versions
  published >30 days ago. Needed because build-tool deps (vite, `@babel/core`>`semver`, esbuild)
  moved from human/trusted publishing to GitHub Actions provenance-only, which `no-downgrade` flags.
  These are dev/build-time only. New releases (<30d) still get full no-downgrade + 7-day-age checks;
  `ignore-scripts` stays on for every version. (Verified `vite@5.4.21` etc. are legit CI releases.)
- Lockfiles are committed. CI uses `pnpm install --frozen-lockfile`.
- Override only when truly needed, per-package: `onlyBuiltDependencies` allow-list, or
  `pnpm install --ignore-scripts=false` for a single audited dependency.

## Secrets (MANDATORY)
- **Never** commit secrets. Store them in **GCP Secret Manager**. `.gitignore` blocks `.env*`, key
  files, `*-key.json`, keystores, ADC.
- The platform/relayer wallet private key and the SessionKey live in **GCP KMS / Secret Manager only**.
  Commit addresses, never keys.
- Never put secrets / raw API responses / personal data / markdown in the on-chain `reason` field or
  evidence (≤200 ASCII chars).

## Chain & money (MANDATORY)
- MVP runs on **Base mainnet (chainId 8453)** — real production network.
- Test with **tiny amounts only**: ~`0.001 USDC` or equivalent ETH/WETH.
- Cloud Run runtimes must be **bounded**: short tick loops (e.g. one tick / 5s for ~30s), hard
  `maxAttemptsPerTick`, no infinite loops, no spamming.

## GCP
- Project: `ethglobal-nyc2026-rtree` (number `41929375451`). Region `us-central1`. ADC configured.

## Deploying the panel (MANDATORY — use the scripts, never hand-type gcloud)
- Build + deploy the `intentos-panel` Cloud Run service ONLY via:
  `./scripts/build-panel.sh && ./scripts/deploy-panel.sh`
- Why: a plain/image-only `gcloud run deploy` (or a long comma `--set-env-vars`) **silently drops env
  vars** — it kept turning World ID off and erasing `WORLDID_*`. The scripts pass **every** env from
  [scripts/panel-env.sh](../scripts/panel-env.sh) (the single source of truth) with a `^@@^` delimiter and
  re-attach secrets, then **verify `/api/config`** (authRequired + ownerMode:connected + worldIdRequired)
  and fail if anything was dropped.
- To change panel config (env, secrets, image, sizing) edit `scripts/panel-env.sh`, then redeploy.
- `panel-env.sh` holds only secret *references* (`name:version`), never secret values — safe to commit.

