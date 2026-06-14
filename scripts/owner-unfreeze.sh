#!/usr/bin/env bash
# Emergency connected-Owner unfreeze for MetaMask-blocked EIP-7702 self-calls.
# Reads the Owner key from the terminal only; never write secrets to files or chat.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

cleanup() {
  unset OWNER_PRIVATE_KEY || true
  unset OWNER_MNEMONIC || true
}
trap cleanup EXIT

export OWNER_ADDRESS="${OWNER_ADDRESS:-0x5e9041e731e10727d923d79b1e83290f6e83a221}"
export OWNER_AMOUNT_CAP_PER_TX="${OWNER_AMOUNT_CAP_PER_TX:-2000}"
export OWNER_CUMULATIVE_CAP="${OWNER_CUMULATIVE_CAP:-100000}"

if [[ -z "${OWNER_PRIVATE_KEY:-}" && -z "${OWNER_MNEMONIC:-}" ]]; then
  read -rsp "OWNER_PRIVATE_KEY (leave empty to use mnemonic): " OWNER_PRIVATE_KEY
  echo
  export OWNER_PRIVATE_KEY
  if [[ -z "${OWNER_PRIVATE_KEY}" ]]; then
    unset OWNER_PRIVATE_KEY
    read -rsp "OWNER_MNEMONIC: " OWNER_MNEMONIC
    echo
    export OWNER_MNEMONIC
    read -rp "OWNER_ACCOUNT_INDEX [0]: " OWNER_ACCOUNT_INDEX
    export OWNER_ACCOUNT_INDEX="${OWNER_ACCOUNT_INDEX:-0}"
  fi
fi

pnpm --filter @intentos/server owner:unfreeze
