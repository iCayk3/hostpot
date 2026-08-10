#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="conecta"
APP_ROOT="/opt/conecta"
DATA_DIR="/var/lib/conecta"
CONFIG_DIR="/etc/conecta"
ENV_FILE="$CONFIG_DIR/conecta.env"
SERVICE_FILE="/etc/systemd/system/conecta.service"
NGINX_FILE="/etc/nginx/sites-available/conecta"
NODE_VERSION="${NODE_VERSION:-24.19.0}"
APP_PORT="${APP_PORT:-3000}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail(){ echo "ERRO: $*" >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || fail "execute com sudo: sudo bash deploy/ubuntu/install-ubuntu.sh"
[[ -f "$SOURCE_DIR/package.json" ]] || fail "package.json não encontrado em $SOURCE_DIR"

if [[ -z "${PUBLIC_BASE_URL:-}" && -t 0 ]]; then read -rp "URL pública HTTPS (ex.: https://wifi.exemplo.com.br): " PUBLIC_BASE_URL; fi
if [[ -z "${ADMIN_USERNAME:-}" && -t 0 ]]; then read -rp "Usuário administrador [admin]: " ADMIN_USERNAME; fi
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
if [[ -z "${ADMIN_PASSWORD:-}" && -t 0 ]]; then read -rsp "Senha administrativa (mínimo 16 caracteres): " ADMIN_PASSWORD; echo; fi
[[ "${PUBLIC_BASE_URL:-}" =~ ^https://[^/]+/?$ ]] || fail "defina PUBLIC_BASE_URL com uma URL HTTPS sem caminho"
[[ ${#ADMIN_PASSWORD} -ge 16 ]] || fail "ADMIN_PASSWORD precisa ter pelo menos 16 caracteres"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils rsync nginx sqlite3 openssl

case "$(dpkg --print-architecture)" in amd64) NODE_ARCH="x64";; arm64) NODE_ARCH="arm64";; *) fail "arquitetura não suportada: $(dpkg --print-architecture)";; esac
NODE_DIR="$APP_ROOT/node-v$NODE_VERSION-linux-$NODE_ARCH"
if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  TMP_DIR="$(mktemp -d)"; trap 'rm -rf "$TMP_DIR"' EXIT
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz" -o "$TMP_DIR/node.tar.xz"
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$TMP_DIR/SHASUMS256.txt"
  (cd "$TMP_DIR" && grep " node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz$" SHASUMS256.txt | sha256sum --check -)
  mkdir -p "$APP_ROOT"; tar -xJf "$TMP_DIR/node.tar.xz" -C "$APP_ROOT"
fi
ln -sfn "$NODE_DIR" "$APP_ROOT/node"

id "$APP_NAME" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --create-home --shell /usr/sbin/nologin "$APP_NAME"
install -d -o "$APP_NAME" -g "$APP_NAME" -m 0750 "$DATA_DIR" "$APP_ROOT/releases"
install -d -o root -g "$APP_NAME" -m 0750 "$CONFIG_DIR"

RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
mkdir -p "$RELEASE_DIR"
rsync -a --exclude='.git' --exclude='.env' --exclude='node_modules' --exclude='dist' --exclude='data' "$SOURCE_DIR/" "$RELEASE_DIR/"
cd "$RELEASE_DIR"
PATH="$APP_ROOT/node/bin:$PATH" npm ci --ignore-scripts --no-audit --no-fund
NODE_ENV=production SKIP_ENV_VALIDATION=1 PATH="$APP_ROOT/node/bin:$PATH" npm run build
PATH="$APP_ROOT/node/bin:$PATH" npm prune --omit=dev
chown -R root:root "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

if [[ ! -f "$ENV_FILE" ]]; then
  ACTIVATION_TOKEN_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  ADMIN_SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat >"$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$APP_PORT
HOST=127.0.0.1
PUBLIC_BASE_URL=${PUBLIC_BASE_URL%/}
PROVISIONING_DATA_DIR=$DATA_DIR
ACTIVATION_TOKEN_SECRET=$ACTIVATION_TOKEN_SECRET
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_SESSION_SECRET=$ADMIN_SESSION_SECRET
PIX_TEMP_RATE_LIMIT=1M/1M
EOF
  chown root:"$APP_NAME" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
else
  echo "Mantendo configuração existente em $ENV_FILE"
fi

cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Conecta+ HotSpot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_NAME
Group=$APP_NAME
WorkingDirectory=$APP_ROOT/current
EnvironmentFile=$ENV_FILE
Environment=PATH=$APP_ROOT/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=$APP_ROOT/node/bin/npm run start
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
ReadWritePaths=$DATA_DIR
UMask=0027

[Install]
WantedBy=multi-user.target
EOF

DOMAIN="$(printf '%s' "${PUBLIC_BASE_URL#https://}" | cut -d/ -f1)"
cat >"$NGINX_FILE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 65s;
    }
}
EOF
ln -sfn "$NGINX_FILE" /etc/nginx/sites-enabled/conecta
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload
systemctl enable --now conecta nginx
sleep 2
curl --fail --silent "http://127.0.0.1:$APP_PORT/api/health" >/dev/null || { journalctl -u conecta -n 80 --no-pager; fail "serviço iniciou sem responder ao healthcheck"; }

install -m 0750 "$SOURCE_DIR/deploy/ubuntu/update-ubuntu.sh" /usr/local/sbin/conecta-update
install -m 0750 "$SOURCE_DIR/deploy/ubuntu/backup-ubuntu.sh" /usr/local/sbin/conecta-backup
install -m 0750 "$SOURCE_DIR/deploy/ubuntu/uninstall-ubuntu.sh" /usr/local/sbin/conecta-uninstall
echo "Conecta+ instalado. Configure TLS para $DOMAIN e acesse ${PUBLIC_BASE_URL%/}."
echo "Logs: journalctl -u conecta -f"

