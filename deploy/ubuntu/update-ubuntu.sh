#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "Execute com sudo." >&2; exit 1; }
SOURCE_DIR="${1:-$(pwd)}"; APP_ROOT="/opt/conecta"; OLD_RELEASE="$(readlink -f "$APP_ROOT/current" || true)"; RELEASE_DIR="$APP_ROOT/releases/$(date -u +%Y%m%d%H%M%S)"
[[ -f "$SOURCE_DIR/package.json" ]] || { echo "Informe o diretório atualizado do projeto: sudo conecta-update /caminho/projeto" >&2; exit 1; }
mkdir -p "$RELEASE_DIR"
rsync -a --exclude='.git' --exclude='.env' --exclude='node_modules' --exclude='dist' --exclude='data' "$SOURCE_DIR/" "$RELEASE_DIR/"
cd "$RELEASE_DIR"; PATH="$APP_ROOT/node/bin:$PATH" npm ci --ignore-scripts --no-audit --no-fund
NODE_ENV=production SKIP_ENV_VALIDATION=1 PATH="$APP_ROOT/node/bin:$PATH" npm run build
PATH="$APP_ROOT/node/bin:$PATH" npm prune --omit=dev; chown -R root:root "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"; systemctl restart conecta; sleep 3
APP_PORT="$(sed -n 's/^PORT=\([0-9][0-9]*\)$/\1/p' /etc/conecta/conecta.env | tail -n 1)"; APP_PORT="${APP_PORT:-3000}"
if ! curl --fail --silent "http://127.0.0.1:$APP_PORT/api/health" >/dev/null; then ln -sfn "$OLD_RELEASE" "$APP_ROOT/current"; systemctl restart conecta; echo "Atualização falhou; versão anterior restaurada." >&2; exit 1; fi
echo "Atualização concluída."
