#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(uname -s)" == "Darwin" ]]; then
  INSTALL_DIR="${HOME}/Library/Application Support/NexusWorker"
else
  INSTALL_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}/nexus-worker"
fi
GATEWAY_URL="${NEXUS_WORKER_GATEWAY_URL:-}"
START=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --gateway) GATEWAY_URL="${2:-}"; shift 2 ;;
    --start) START=1; shift ;;
    --enable-autostart)
      echo "NEXUS_AUTOSTART_BLOCKED: esta versao nao persiste o token nxw1_. Autostart desassistido permanece bloqueado ate existir armazenamento seguro por SO." >&2
      exit 2
      ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13+ nao encontrado no PATH." >&2
  exit 1
fi

echo "[NEXUS INSTALL] verificando pacote de origem..."
node "$SOURCE_DIR/verify.mjs"

if [[ -z "$GATEWAY_URL" ]]; then
  read -r -p "Gateway HTTPS do Nexus Worker: " GATEWAY_URL
fi

gateway_status=0
NEXUS_INSTALL_GATEWAY="$GATEWAY_URL" node <<'NODE' || gateway_status=$?
const raw = process.env.NEXUS_INSTALL_GATEWAY || "";
let url;
try { url = new URL(raw.trim()); } catch { process.exit(2); }
const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
if (url.protocol !== "https:" && !local) process.exit(3);
NODE
case "$gateway_status" in
  0) ;;
  2) echo "NEXUS_GATEWAY_URL_invalid" >&2; exit 2 ;;
  *) echo "NEXUS_GATEWAY_URL_must_use_https" >&2; exit 2 ;;
esac

mkdir -p "$INSTALL_DIR"
while IFS= read -r file; do
  cp -f -- "$SOURCE_DIR/$file" "$INSTALL_DIR/$file"
done < <(node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for (const f of m.files) console.log(f);' "$SOURCE_DIR/worker-manifest.json")
cp -f -- "$SOURCE_DIR/SHA256SUMS" "$INSTALL_DIR/SHA256SUMS"
printf '%s\n' "$GATEWAY_URL" > "$INSTALL_DIR/gateway.url"
chmod 600 "$INSTALL_DIR/gateway.url"
chmod +x "$INSTALL_DIR/start.sh" "$INSTALL_DIR/install.sh"

echo "[NEXUS INSTALL] verificando instalacao..."
node "$INSTALL_DIR/verify.mjs"
echo "[NEXUS INSTALL] OK: $INSTALL_DIR"
echo "[NEXUS INSTALL] token nao foi salvo. O launcher pedira nxw1_ ao iniciar."

if [[ "$START" == "1" ]]; then
  echo "[NEXUS INSTALL] iniciando worker..."
  exec bash "$INSTALL_DIR/start.sh"
fi

echo "Para iniciar: bash '$INSTALL_DIR/start.sh'"
