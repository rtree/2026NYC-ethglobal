#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GCP_PROJECT:-ethglobal-nyc2026-rtree}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${OPENCLAW_SERVICE:-intentos-openclaw-gateway}"
SA_NAME="${OPENCLAW_SA_NAME:-intentos-openclaw-runtime}"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
PANEL_SA="${PANEL_SA:-intentos-panel@${PROJECT}.iam.gserviceaccount.com}"
SECRET="${OPENCLAW_GATEWAY_TOKEN_SECRET:-intentos-openclaw-gateway-token}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../openclaw-cloudrun" && pwd)"

if [[ "${DEPLOY_OPENCLAW_YES:-}" != "1" ]]; then
  cat <<EOF
Dry run. Set DEPLOY_OPENCLAW_YES=1 to deploy.

Project:        ${PROJECT}
Region:         ${REGION}
Service:        ${SERVICE}
Service account:${SA}
Source:         ${SOURCE_DIR}
Secret:         ${SECRET}
Min instances:  ${OPENCLAW_MIN_INSTANCES:-1} (warm; no cold start)
CPU throttling: off (always-on CPU)
EOF
  exit 0
fi

gcloud config set project "${PROJECT}" >/dev/null
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  --project "${PROJECT}"

gcloud iam service-accounts create "${SA_NAME}" \
  --project "${PROJECT}" \
  --display-name "IntentOS OpenClaw runtime" >/dev/null 2>&1 || true

gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member "serviceAccount:${SA}" \
  --role roles/aiplatform.user >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member "serviceAccount:${SA}" \
  --role roles/logging.logWriter >/dev/null

if ! gcloud secrets describe "${SECRET}" --project "${PROJECT}" >/dev/null 2>&1; then
  token="$(openssl rand -hex 32)"
  printf '%s' "${token}" | gcloud secrets create "${SECRET}" \
    --project "${PROJECT}" \
    --replication-policy automatic \
    --data-file - >/dev/null
fi

gcloud secrets add-iam-policy-binding "${SECRET}" \
  --project "${PROJECT}" \
  --member "serviceAccount:${SA}" \
  --role roles/secretmanager.secretAccessor >/dev/null

gcloud run deploy "${SERVICE}" \
  --source "${SOURCE_DIR}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --service-account "${SA}" \
  --no-allow-unauthenticated \
  --min-instances "${OPENCLAW_MIN_INSTANCES:-1}" \
  --max-instances 1 \
  --no-cpu-throttling \
  --concurrency 1 \
  --cpu 1 \
  --memory 1Gi \
  --timeout 300 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION:-us-central1},OPENCLAW_DEFAULT_MODEL=${OPENCLAW_DEFAULT_MODEL:-openai/vertex-gemini-2.5-flash},VERTEX_MODEL=${VERTEX_MODEL:-gemini-2.5-flash}" \
  --set-secrets "OPENCLAW_GATEWAY_TOKEN=${SECRET}:latest"

active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -n "${active_account}" ]]; then
  gcloud run services add-iam-policy-binding "${SERVICE}" \
    --project "${PROJECT}" \
    --region "${REGION}" \
    --member "user:${active_account}" \
    --role roles/run.invoker >/dev/null
fi

gcloud run services add-iam-policy-binding "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --member "serviceAccount:${PANEL_SA}" \
  --role roles/run.invoker >/dev/null

url="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
echo "OpenClaw service: ${url}"
echo "Smoke: scripts/smoke-openclaw-cloudrun.sh"
