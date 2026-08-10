#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "Execute com sudo." >&2; exit 1; }
DEST="${1:-/var/backups/conecta}"; DB="/var/lib/conecta/conecta.db"; install -d -m 0700 "$DEST"; [[ -f "$DB" ]] || { echo "Banco não encontrado." >&2; exit 1; }
TARGET="$DEST/conecta-$(date -u +%Y%m%d%H%M%S).db"; sqlite3 "$DB" ".timeout 5000" ".backup '$TARGET'"; chmod 0600 "$TARGET"; find "$DEST" -type f -name 'conecta-*.db' -mtime +30 -delete; echo "$TARGET"

