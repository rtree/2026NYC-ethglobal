#!/usr/bin/env bash
# Canonical Cloud Run env + secrets for the intentos-panel service.
# -----------------------------------------------------------------------------
# SINGLE SOURCE OF TRUTH. deploy-panel.sh sources this and passes EVERY var on
# every deploy, so a `gcloud run deploy` never silently drops env (the bug that
# kept turning World ID off). To change config, edit HERE and re-run deploy-panel.sh.
#
# Secrets hold VALUES in GCP Secret Manager — only the *reference* is here, never
# a secret value. Safe to commit.

PROJECT="${GCP_PROJECT:-ethglobal-nyc2026-rtree}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${PANEL_SERVICE:-intentos-panel}"
PANEL_SA="${PANEL_SA:-intentos-panel@${PROJECT}.iam.gserviceaccount.com}"
IMAGE="${PANEL_IMAGE:-us-central1-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/intentos-panel:firebase}"

# OpenClaw gateway URL (the runtime Cloud Run service the panel calls).
OPENCLAW_GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-https://intentos-openclaw-gateway-hjx3x7yweq-uc.a.run.app}"

# --- plain env vars (NO secret values here) -------------------------------------------------
# Keep as an ordered array of KEY=VALUE. deploy-panel.sh joins these with a custom
# delimiter so commas/colons inside values can't break parsing.
PANEL_ENV=(
  "INTENTOS_AUTH=firebase"
  "INTENTOS_STORE=firestore"
  "INTENTOS_LLM=vertex"
  "GOOGLE_CLOUD_PROJECT=${PROJECT}"
  "INTENTOS_OWNER=connected"
  "OPENCLAW_GATEWAY_URL=${OPENCLAW_GATEWAY_URL}"
  # --- World ID 4.0 (plan/110). app_id/rp_id are public; the signing key is a secret (below). ---
  "INTENTOS_WORLDID=on"
  "WORLDID_APP_ID=app_1d5a8618ed01e1330e177ff4f803e6ad"
  "WORLDID_RP_ID=rp_c5057c1fc547760d"
  "WORLDID_ACTION=intentos-onboarding"
  "WORLDID_ENVIRONMENT=production"
  # Demo test EOAs allowed to SHARE one World ID nullifier (both are the dev's own test wallets), so the
  # same human can verify on both. Only listed addresses can share; real users keep 1-human-1-account.
  "WORLDID_SHARED_NULLIFIER_ADDRESSES=0x5e9041e731e10727d923d79b1e83290f6e83a221,0x7b79c37bb80cc76fe6b758c7140228fecc7e2a2e"
)

# --- secrets: ENV_NAME=secret-name:version (values live in Secret Manager) -------------------
PANEL_SECRETS=(
  "WORLDID_RP_SIGNING_KEY=worldid-rp-signing-key:latest"
)

# Cloud Run sizing.
PANEL_MEMORY="${PANEL_MEMORY:-512Mi}"
PANEL_CPU="${PANEL_CPU:-1}"
PANEL_MAX_INSTANCES="${PANEL_MAX_INSTANCES:-1}"
PANEL_TIMEOUT="${PANEL_TIMEOUT:-120}"
