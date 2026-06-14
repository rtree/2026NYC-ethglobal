#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCP_PROJECT:-ethglobal-nyc2026-rtree}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${OPENCLAW_SERVICE:-intentos-openclaw-gateway}"
SECRET="${OPENCLAW_GATEWAY_TOKEN_SECRET:-intentos-openclaw-gateway-token}"
PROXY_URL="${OPENCLAW_PROXY_URL:-http://127.0.0.1:18089}"

token="$(gcloud secrets versions access latest --secret "${SECRET}" --project "${PROJECT}")"

if ! curl -fsS "${PROXY_URL}/readyz" >/dev/null 2>&1; then
  cat >&2 <<EOF
Cloud Run proxy is not reachable at ${PROXY_URL}.
Start it in another terminal:

  gcloud run services proxy ${SERVICE} --project ${PROJECT} --region ${REGION} --port 18089

EOF
  exit 1
fi

echo "--- readyz ---"
curl -fsS "${PROXY_URL}/readyz"
printf '\n--- models ---\n'
curl -fsS "${PROXY_URL}/v1/models" -H "Authorization: Bearer ${token}"
printf '\n--- chat ---\n'
curl -fsS "${PROXY_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw/default","user":"intentos-smoke","messages":[{"role":"user","content":"Reply with exactly: HOLD"}],"max_completion_tokens":32}'
printf '\n'
