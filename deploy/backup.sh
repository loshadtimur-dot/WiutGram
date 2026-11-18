#!/usr/bin/env bash
# Daily backup of the SQLite database and uploaded files.
# Usage (cron): 15 3 * * * /srv/uni-lovers/deploy/backup.sh >> /var/log/uni-lovers-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/uni-lovers}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

# SQLite-safe copy (works even while the app is running).
DB_FILE="${UNI_DB_FILE:-$APP_DIR/data/app.db}"
sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/app-$STAMP.db'"

# Uploads are mostly immutable; an archive per day is enough.
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/uploads}"
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"

# Keep two weeks by default.
find "$BACKUP_DIR" -name 'app-*.db' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "[$(date -Iseconds)] backup complete: app-$STAMP.db uploads-$STAMP.tar.gz"
