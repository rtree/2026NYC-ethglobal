# IntentOS Build & Layout

This document records the current repository layout and the build/deploy entrypoints after the
post-hackathon cleanup.

## Directory layout

```text
app/
  web/                 React + Vite control panel (`@intentos/app`)
  agent/
    openclaw/          Cloud Run OpenClaw gateway wrapper
packages/
  shared/              Shared TS types, config, ABIs, KMS signer
  runtime/             Base clients, quotes, request build/sign, relayer helpers
  server/              Control-plane API and static web serving
contracts/             Foundry contracts and tests
deployment/            Public deployment addresses (no secrets)
doc/                   North Star, SDD, issues, mocks, deck
scripts/               Build/deploy/operator scripts
```

## Local build commands

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

Focused commands:

```bash
pnpm --filter @intentos/shared build
pnpm --filter @intentos/runtime build
pnpm --filter @intentos/server build
pnpm --filter @intentos/app build
pnpm contracts:build
pnpm contracts:test
```

## Web app

The web app lives in [app/web](../app/web).

```bash
cd app/web
pnpm dev
pnpm build
pnpm e2e
```

The app imports the mock design system from [doc/mock/styles.css](mock/styles.css). Production static
files are emitted to `app/web/dist`; the server serves that directory by default.

`doc/mock/` is a historical/visual reference only. Maintenance work must prove behavior against the
real API, contract, runtime, and AgentFund state.

Local Firebase/Vite env files now live under `app/web/`:

```text
app/web/.env.local
app/web/.env.production
```

## Control panel container

The panel Docker image builds the web app plus `packages/server`, then runs the server.

- Dockerfile: [Dockerfile](../Dockerfile)
- Cloud Build config: [cloudbuild.yaml](../cloudbuild.yaml)
- Runtime static dir: `APP_DIST=/repo/app/web/dist`

Use the scripts, not hand-typed `gcloud`:

```bash
./scripts/build-panel.sh
./scripts/deploy-panel.sh
```

`build-panel.sh` reads Firebase public web config from `app/web/.env.production` by default. Override
with `FIREBASE_ENV_FILE=...` when needed.

## OpenClaw agent runtime

The OpenClaw gateway wrapper lives in [app/agent/openclaw](../app/agent/openclaw).

```bash
./scripts/deploy-openclaw-cloudrun.sh          # dry run
DEPLOY_OPENCLAW_YES=1 ./scripts/deploy-openclaw-cloudrun.sh
./scripts/smoke-openclaw-cloudrun.sh
```

The service remains private and is invoked by the panel through Cloud Run IAM plus the gateway token.

## Deployment addresses

Public addresses live in [deployment/base-mainnet.json](../deployment/base-mainnet.json). This file must
never contain private keys. Override consumers with `INTENTOS_DEPLOYMENTS=/path/to/base-mainnet.json`.

## Documentation

Planning files live under [doc/plan](plan). `doc/plan/000-northStar.md` is the Japanese source of
truth. New issue documents start at `doc/plan/130-issue-*.md`.
