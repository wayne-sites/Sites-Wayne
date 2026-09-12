#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCTOR="$WORKER_DIR/doctor.mjs"
PAIR="$WORKER_DIR/pair.mjs"
WORKER="$WORKER_DIR/index.mjs"
GATEWAY_FILE="$WORKER_DIR/gateway.url"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13+ nao encontrado no PATH." >&2
  exit 1
fi

if [[ -z "${NEXUS_WORKER_GATEWAY_URL:-}" && -z "${NEXUS_BASE_URL:-}" && -f "$GATEWAY_FILE" ]]; then
  NEXUS_WORKER_GATEWAY_URL="$(tr -d '\r\n' < "$GATEWAY_FILE")"
  export NEXUS_WORKER_GATEWAY_URL
fi

if [[ -z "${NEXUS_WORKER_GATEWAY_URL:-}" && -z "${NEXUS_BASE_URL:-}" ]]; then
  echo "Defina NEXUS_WORKER_GATEWAY_URL ou NEXUS_BASE_URL antes de iniciar." >&2
  exit 1
fi

if [[ -z "${NEXUS_WORKER_TOKEN:-}" ]]; then
  read -r -s -p "Cole o token nxw1_ ou codigo temporario nxp1_: " NEXUS_WORKER_SECRET
  echo
  if [[ "$NEXUS_WORKER_SECRET" == nxp1_* ]]; then
    if [[ -z "${NEXUS_WORKER_GATEWAY_URL:-}" ]]; then
      echo "NEXUS_WORKER_GATEWAY_URL e obrigatorio para pareamento." >&2
      unset NEXUS_WORKER_SECRET
      exit 1
    fi
    export NEXUS_WORKER_PAIRING_CODE="$NEXUS_WORKER_SECRET"
    unset NEXUS_WORKER_SECRET
    if ! NEXUS_WORKER_TOKEN="$(node "$PAIR")"; then
      unset NEXUS_WORKER_PAIRING_CODE
      exit 1
    fi
    unset NEXUS_WORKER_PAIRING_CODE
    export NEXUS_WORKER_TOKEN
  else
    NEXUS_WORKER_TOKEN="$NEXUS_WORKER_SECRET"
    unset NEXUS_WORKER_SECRET
    export NEXUS_WORKER_TOKEN
  fi
fi

echo "[NEXUS] executando preflight seguro..."
node "$DOCTOR"

echo "[NEXUS] preflight aprovado; iniciando worker allowlisted."
exec node "$WORKER"
