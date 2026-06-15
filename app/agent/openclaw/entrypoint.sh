#!/usr/bin/env sh
set -eu

export HOME="${HOME:-/home/node}"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
export OPENCLAW_GATEWAY_PORT="${PORT:-8080}"
export OPENCLAW_DEFAULT_MODEL="${OPENCLAW_DEFAULT_MODEL:-openai/vertex-gemini-2.5-flash}"
export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
export VERTEX_BRIDGE_PORT="${VERTEX_BRIDGE_PORT:-4000}"
export VERTEX_MODEL="${VERTEX_MODEL:-gemini-2.5-flash}"

if [ -z "${GOOGLE_CLOUD_PROJECT:-}" ] && [ -n "${GCP_PROJECT:-}" ]; then
  export GOOGLE_CLOUD_PROJECT="$GCP_PROJECT"
fi

if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  echo "OPENCLAW_GATEWAY_TOKEN is required" >&2
  exit 64
fi

mkdir -p \
  "$OPENCLAW_STATE_DIR" \
  "$OPENCLAW_STATE_DIR/workspace-intentos" \
  "$OPENCLAW_STATE_DIR/agents/executor/agent" \
  "$OPENCLAW_STATE_DIR/agents/watcher/agent"

cat > "$OPENCLAW_STATE_DIR/openclaw.json" <<JSON
{
  "gateway": {
    "mode": "local",
    "bind": "lan",
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    },
    "controlUi": {
      "allowedOrigins": ["https://*.run.app", "http://localhost:${OPENCLAW_GATEWAY_PORT}", "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}"]
    }
  },
  "tools": {
    "profile": "messaging",
    "deny": ["gateway", "cron", "sessions_spawn", "sessions_send", "exec", "shell", "spawn", "fs_write", "fs_delete", "fs_move", "apply_patch", "nodes", "browser"]
  },
  "models": {
    "providers": {
      "openai": {
        "apiKey": "local-vertex-bridge",
        "baseUrl": "http://127.0.0.1:${VERTEX_BRIDGE_PORT}/v1",
        "models": [
          { "id": "vertex-gemini-2.5-flash", "name": "vertex-gemini-2.5-flash" }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "$OPENCLAW_STATE_DIR/workspace-intentos",
      "skipBootstrap": true,
      "sandbox": { "mode": "off" }
    },
    "list": [
      {
        "id": "executor",
        "default": true,
        "workspace": "$OPENCLAW_STATE_DIR/workspace-intentos",
        "identity": { "name": "IntentOS Executor", "theme": "bounded onchain executor", "emoji": "I" }
      },
      {
        "id": "watcher",
        "workspace": "$OPENCLAW_STATE_DIR/workspace-intentos",
        "identity": { "name": "IntentOS Watcher", "theme": "semantic circuit breaker", "emoji": "W" }
      }
    ]
  }
}
JSON

node /app/intentos-vertex-bridge.mjs &
bridge_pid="$!"
trap 'kill "$bridge_pid" >/dev/null 2>&1 || true' EXIT TERM INT

node /app/openclaw.mjs models set "$OPENCLAW_DEFAULT_MODEL" >/tmp/openclaw-model-set.log 2>&1 || cat /tmp/openclaw-model-set.log >&2

exec node /app/openclaw.mjs gateway run \
  --allow-unconfigured \
  --bind lan \
  --port "$OPENCLAW_GATEWAY_PORT" \
  --auth token \
  --token "$OPENCLAW_GATEWAY_TOKEN" \
  --force
