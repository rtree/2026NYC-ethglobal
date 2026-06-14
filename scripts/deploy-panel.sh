#!/usr/bin/env bash
# Deploy the intentos-panel Cloud Run service with the FULL canonical env + secrets.
# -----------------------------------------------------------------------------
# WHY THIS EXISTS: a plain `gcloud run deploy` (especially image-only, or with a
# long comma --set-env-vars) kept silently DROPPING env vars (World ID turned off,
# WORLDID_* vanished). This script always passes EVERY var from panel-env.sh using
# `--set-env-vars` with a custom `^@@^` delimiter (so commas/colons in values are
# safe), plus `--set-secrets`, then VERIFIES /api/config afterwards.
# NOTE: `--set-env-vars` and `--set-secrets` each REPLACE the whole set (not merge),
# so passing the full canonical list every time is what keeps env from drifting.
#
# Run scripts/build-panel.sh first (builds the image). Then:
#   scripts/deploy-panel.sh
# Override e.g.:  PANEL_MAX_INSTANCES=2 scripts/deploy-panel.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=panel-env.sh
source "${HERE}/panel-env.sh"

# Join PANEL_ENV with the @@ delimiter. gcloud reads `^@@^a=1@@b=2` as: delimiter is
# @@, then the pairs — so commas/colons inside any value never split a pair.
ENV_ARG="^@@^"
for kv in "${PANEL_ENV[@]}"; do ENV_ARG+="${kv}@@"; done
ENV_ARG="${ENV_ARG%@@}" # strip trailing delimiter

# Join secrets with commas (values can't contain commas — they're secret-name:version).
SECRETS_ARG="$(IFS=,; echo "${PANEL_SECRETS[*]}")"

echo "Deploying ${SERVICE} (project ${PROJECT}, region ${REGION})"
echo "  image:   ${IMAGE}"
echo "  env:     ${#PANEL_ENV[@]} vars (incl. INTENTOS_WORLDID, WORLDID_APP_ID/RP_ID/ACTION/ENVIRONMENT)"
echo "  secrets: ${SECRETS_ARG}"

# Auth preflight: Firebase custom-token minting uses IAM Credentials signJwt with the Cloud Run service
# account as both caller and target. If this self-binding is missing, sign-in, Firestore-backed
# IntentBuilder, and World ID status all fail with 401/500 even though the revision deploys fine.
TOKEN_CREATOR="$(gcloud iam service-accounts get-iam-policy "${PANEL_SA}" --project "${PROJECT}" \
  --flatten='bindings[].members' \
  --filter="bindings.role=roles/iam.serviceAccountTokenCreator AND bindings.members=serviceAccount:${PANEL_SA}" \
  --format='value(bindings.role)' 2>/dev/null || true)"
if [[ "${TOKEN_CREATOR}" != "roles/iam.serviceAccountTokenCreator" ]]; then
  echo "✖ ${PANEL_SA} lacks self roles/iam.serviceAccountTokenCreator; sign-in would fail." >&2
  echo "  Fix:" >&2
  echo "  gcloud iam service-accounts add-iam-policy-binding ${PANEL_SA} \\" >&2
  echo "    --member='serviceAccount:${PANEL_SA}' \\" >&2
  echo "    --role='roles/iam.serviceAccountTokenCreator' \\" >&2
  echo "    --project ${PROJECT}" >&2
  exit 1
fi

gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --service-account "${PANEL_SA}" \
  --allow-unauthenticated \
  --set-env-vars "${ENV_ARG}" \
  --set-secrets "${SECRETS_ARG}" \
  --memory "${PANEL_MEMORY}" \
  --cpu "${PANEL_CPU}" \
  --max-instances "${PANEL_MAX_INSTANCES}" \
  --timeout "${PANEL_TIMEOUT}" \
  --project "${PROJECT}"

# --- verify the deploy actually has the env we intended (catch silent drops) ---
URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --project "${PROJECT}" \
  --format='value(status.url)' 2>/dev/null)"
echo ""
echo "Service URL: ${URL}"
echo "Verifying /api/config…"
CONFIG="$(curl -s "${URL}/api/config" || true)"
echo "  ${CONFIG}"

fail=0
echo "${CONFIG}" | grep -q '"authRequired":true' || { echo "  ✖ authRequired not true"; fail=1; }
echo "${CONFIG}" | grep -q '"ownerMode":"connected"' || { echo "  ✖ ownerMode not connected"; fail=1; }
echo "${CONFIG}" | grep -q '"worldIdRequired":true' || { echo "  ✖ worldIdRequired not true (World ID env dropped!)"; fail=1; }

if [[ "${fail}" == "0" ]]; then
  echo "✔ Deploy verified: auth + connected owner mode + World ID all live."
else
  echo "✖ Deploy verification FAILED — env may have been dropped. Re-run scripts/deploy-panel.sh." >&2
  exit 1
fi
