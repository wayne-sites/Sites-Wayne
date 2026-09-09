#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCTOR="$WORKER_DIR/doctor.mjs"
WORKER="$WORKER_DIR/index.mjs"
GATEWAY_FILE="$WORKER_DIR/gateway.url"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13+ nao encontrado no PATH." >&2
  exit 1
fi

if [[ -z "${NEXUS_WORKER_TOKEN:-}" ]]; then
  read -r -s -p "Cole o token nxw1_ do Nexus Worker: " NEXUS_WORKER_TOKEN
  echo
  export NEXUS_WORKER_TOKEN
fi

if [[ -z "${NEXUS_WORKER_GATEWAY_URL:-}" && -z "${NEXUS_BASE_URL:-}" && -f "$GATEWAY_FILE" ]]; then
  NEXUS_WORKER_GATEWAY_URL="$(tr -d '\r\n' < "$GATEWAY_FILE")"
  export NEXUS_WORKER_GATEWAY_URL
fi

if [[ -z "${NEXUS_WORKER_GATEWAY_URL:-}" && -z "${NEXUS_BASE_URL:-}" ]]; then
  echo "Defina NEXUS_WORKER_GATEWAY_URL ou NEXUS_BASE_URL antes de iniciar." >&2
  exit 1
fi

echo "[NEXUS] executando preflight seguro..."
node "$DOCTOR"

echo "[NEXUS] preflight aprovado; iniciando worker allowlisted."
exec node "$WORKER"
