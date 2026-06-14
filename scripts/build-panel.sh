#!/usr/bin/env bash
# Build the intentos-panel container image via Cloud Build.
# -----------------------------------------------------------------------------
# The PUBLIC Firebase web config must be baked into the Vite bundle at BUILD time
# (not at Cloud Run runtime), so it's passed as a Cloud Build substitution from a
# local gitignored env file. World ID / owner-mode / store are RUNTIME env and are
# applied by deploy-panel.sh — NOT here.
#
# Usage:   scripts/build-panel.sh
# Override: GCP_PROJECT=... scripts/build-panel.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"
# shellcheck source=panel-env.sh
source "${HERE}/panel-env.sh"

cd "${ROOT}"

ENV_FILE="${FIREBASE_ENV_FILE:-app/.env.production}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found (needs VITE_FIREBASE_API_KEY). Set FIREBASE_ENV_FILE=..." >&2
  exit 1
fi

FBKEY="$(grep '^VITE_FIREBASE_API_KEY=' "${ENV_FILE}" | cut -d= -f2-)"
if [[ -z "${FBKEY}" ]]; then
  echo "ERROR: VITE_FIREBASE_API_KEY missing/empty in ${ENV_FILE}" >&2
  exit 1
fi
echo "Firebase web API key: ${#FBKEY} chars (from ${ENV_FILE})"

# Optional World ID build args (the client also learns these at runtime via /api/config, so they are
# not required at build time; included only if present in the env file).
WORLDID_APP_ID_BUILD="$(grep '^VITE_WORLDID_APP_ID=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- || true)"
WORLDID_ACTION_BUILD="$(grep '^VITE_WORLDID_ACTION=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- || true)"

SUBS="_VITE_FIREBASE_API_KEY=${FBKEY},_VITE_FIREBASE_PROJECT_ID=${PROJECT}"
[[ -n "${WORLDID_APP_ID_BUILD}" ]] && SUBS="${SUBS},_VITE_WORLDID_APP_ID=${WORLDID_APP_ID_BUILD}"
[[ -n "${WORLDID_ACTION_BUILD}" ]] && SUBS="${SUBS},_VITE_WORLDID_ACTION=${WORLDID_ACTION_BUILD}"

echo "Building image ${IMAGE} via Cloud Build (project ${PROJECT})…"
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions="${SUBS}" \
  --project "${PROJECT}"

echo "✔ Build complete: ${IMAGE}"
echo "Next: scripts/deploy-panel.sh"
