#!/usr/bin/env bash
# Restores a database (and optionally media) from a backup file.
#
# Usage:
#   bash scripts/restore.sh /srv/uni-lovers/backups/daily/app-20261118.db
#   bash scripts/restore.sh <file.db> <media.tar.gz>
#
# Safety: the current database is copied aside first, the service is stopped
# while files are swapped, and integrity is verified before the swap.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/uni-lovers}"
DB_FILE="${UNI_DB_FILE:-$APP_DIR/data/app.db}"
SERVICE="${SERVICE:-uni-lovers}"
SOURCE="${1:-}"
MEDIA_SOURCE="${2:-}"

if [ -z "$SOURCE" ] || [ ! -f "$SOURCE" ]; then
  echo "Usage: bash scripts/restore.sh <backup.db> [media.tar.gz]" >&2
  exit 1
fi

log() { echo "[$(date -Iseconds)] $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQLITE_TOOL="$SCRIPT_DIR/sqlite-tool.js"

log "checking backup integrity"
if command -v sqlite3 >/dev/null 2>&1; then
  RESULT="$(sqlite3 "$SOURCE" 'PRAGMA integrity_check;')"
  if [ "$RESULT" != "ok" ]; then
    echo "Backup is corrupted: $RESULT" >&2
    exit 1
  fi
else
  node "$SQLITE_TOOL" check "$SOURCE" >/dev/null
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$APP_DIR/backups/pre-restore"
if [ -f "$DB_FILE" ]; then
  log "saving current database aside"
  cp -f "$DB_FILE" "$APP_DIR/backups/pre-restore/app-$STAMP.db"
fi

log "stopping $SERVICE"
systemctl stop "$SERVICE" 2>/dev/null || true

log "restoring database"
rm -f "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
cp -f "$SOURCE" "$DB_FILE"

if [ -n "$MEDIA_SOURCE" ]; then
  if [ ! -f "$MEDIA_SOURCE" ]; then
    echo "Media archive not found: $MEDIA_SOURCE" >&2
    systemctl start "$SERVICE" 2>/dev/null || true
    exit 1
  fi
  log "restoring media"
  tar -xzf "$MEDIA_SOURCE" -C "$APP_DIR"
fi

if id unilovers >/dev/null 2>&1; then
  chown -R unilovers:unilovers "$DB_FILE" "$APP_DIR/uploads" "$APP_DIR/storage" 2>/dev/null || true
fi

log "starting $SERVICE"
systemctl start "$SERVICE" 2>/dev/null || true

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  body="$(curl -fsS --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  if printf '%s' "$body" | grep -q '"ok":true'; then
    log "restore complete, service healthy"
    exit 0
  fi
done

echo "Service did not become healthy. Previous database is in backups/pre-restore/app-$STAMP.db" >&2
exit 1
