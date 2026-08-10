#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "Execute com sudo." >&2; exit 1; }
systemctl disable --now conecta 2>/dev/null || true
rm -f /etc/systemd/system/conecta.service /etc/nginx/sites-enabled/conecta /etc/nginx/sites-available/conecta
systemctl daemon-reload; nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
rm -rf /opt/conecta
rm -f /usr/local/sbin/conecta-update /usr/local/sbin/conecta-backup /usr/local/sbin/conecta-uninstall
if [[ "${1:-}" == "--purge-data" ]]; then rm -rf /var/lib/conecta /etc/conecta; userdel conecta 2>/dev/null || true; echo "Aplicação e dados removidos."; else echo "Aplicação removida. Dados preservados em /var/lib/conecta e /etc/conecta."; fi

