# IntentOS — Repo Instructions for AI agents

Project facts and the **mandatory** safety policy for this repository. Read before editing.

## What this is
- **IntentOS**: an EIP-7702 guarded-execution layer protocol. The Owner keeps funds in their own EOA;
  an Executor Agent trades **USDC↔WETH on Base mainnet** strictly inside Hard Guardrails; a single
  Watcher Agent (quorum=1) can only tighten / freeze.
- ETHGlobal NYC 2026. MVP scope = "B". Source of truth: [plan/000-northStar.md](plan/000-northStar.md)
  (JP) / [plan/000-northStar-en.md](plan/000-northStar-en.md) (EN). Interfaces frozen in
  [plan/010-interfaces.md](plan/010-interfaces.md). SDD in `plan/020`–`plan/050`. Status in
  [TASK.md](TASK.md).

## Languages & file conventions
- `plan/000-northStar.md` stays **Japanese**. Everything else (docs, mocks, code, comments) in **English**.
- `plan/` files increment by 10 (`000-`, `010-`, ...).

## Supply-chain security (MANDATORY)
JavaScript/Node uses **pnpm** (never npm/yarn). Python uses **uv** (never pip).

Already configured in this repo — keep these on:
- [.npmrc](.npmrc): `ignore-scripts=true` (block install lifecycle scripts), `audit=true`,
  `min-release-age=7` (npm knob; days).
- [pnpm-workspace.yaml](pnpm-workspace.yaml): `minimumReleaseAge: 10080` (**7 days** in minutes — only
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
