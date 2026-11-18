#!/usr/bin/env bash
# Daily backup: consistent SQLite copy + media archive, integrity check,
# daily/weekly/monthly rotation and an optional encrypted off-site copy.
#
# Cron:   15 3 * * * /srv/uni-lovers/deploy/backup.sh >> /var/log/uni-lovers-backup.log 2>&1
# systemd timer: deploy/uni-lovers-backup.timer
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/uni-lovers}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
DB_FILE="${UNI_DB_FILE:-$APP_DIR/data/app.db}"
MEDIA_DIRS=("${UPLOADS_DIR:-$APP_DIR/uploads}" "${MEDIA_DIR:-$APP_DIR/storage}")
STAMP="$(date +%Y%m%d-%H%M%S)"
DAY="$(date +%Y%m%d)"
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"
MONTHLY_DIR="$BACKUP_DIR/monthly"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-3}"

log() { echo "[$(date -Iseconds)] $*"; }

notify_failure() {
  local message="$1"
  log "ERROR: $message"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS --max-time 10 \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=⚠️ Wiutgram backup: ${message}" >/dev/null || true
  fi
}

trap 'notify_failure "backup failed on line $LINENO"' ERR

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

if [ ! -f "$DB_FILE" ]; then
  notify_failure "database not found: $DB_FILE"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQLITE_TOOL="$SCRIPT_DIR/../scripts/sqlite-tool.js"

log "copying database with VACUUM INTO"
VACUUM_TARGET="$TMP_DIR/app-$DAY.db"
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" "VACUUM INTO '$VACUUM_TARGET'"
else
  node "$SQLITE_TOOL" backup "$DB_FILE" "$VACUUM_TARGET"
fi

log "checking integrity"
if command -v sqlite3 >/dev/null 2>&1; then
  RESULT="$(sqlite3 "$VACUUM_TARGET" 'PRAGMA integrity_check;')"
  if [ "$RESULT" != "ok" ]; then
    notify_failure "integrity_check returned: $RESULT"
    exit 1
  fi
else
  node "$SQLITE_TOOL" check "$VACUUM_TARGET" >/dev/null
fi

log "archiving media"
MEDIA_ARCHIVE="$TMP_DIR/media-$DAY.tar.gz"
EXISTING=()
for dir in "${MEDIA_DIRS[@]}"; do
  [ -d "$dir" ] && EXISTING+=("$(basename "$dir")")
done
if [ "${#EXISTING[@]}" -gt 0 ]; then
  PARENTS=()
  for dir in "${MEDIA_DIRS[@]}"; do
    [ -d "$dir" ] && PARENTS+=("$(dirname "$dir")")
  done
  tar -czf "$MEDIA_ARCHIVE" -C "${PARENTS[0]}" "${EXISTING[@]}"
else
  tar -czf "$MEDIA_ARCHIVE" --files-from /dev/null
fi

# Optional encryption for off-site copies.
if [ -n "${AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then
  age -r "$AGE_RECIPIENT" -o "$TMP_DIR/app-$DAY.db.age" "$VACUUM_TARGET"
  mv "$TMP_DIR/app-$DAY.db.age" "$VACUUM_TARGET"
  age -r "$AGE_RECIPIENT" -o "$TMP_DIR/media-$DAY.tar.gz.age" "$MEDIA_ARCHIVE"
  mv "$TMP_DIR/media-$DAY.tar.gz.age" "$MEDIA_ARCHIVE"
fi

install -m 0640 "$VACUUM_TARGET" "$DAILY_DIR/"
install -m 0640 "$MEDIA_ARCHIVE" "$DAILY_DIR/"

# Weekly copy on Sunday, monthly copy on the first day of the month.
if [ "$(date +%u)" = "7" ]; then
  cp -f "$DAILY_DIR/app-$DAY.db" "$WEEKLY_DIR/" 2>/dev/null || true
  cp -f "$DAILY_DIR/media-$DAY.tar.gz" "$WEEKLY_DIR/" 2>/dev/null || true
fi
if [ "$(date +%d)" = "01" ]; then
  cp -f "$DAILY_DIR/app-$DAY.db" "$MONTHLY_DIR/" 2>/dev/null || true
  cp -f "$DAILY_DIR/media-$DAY.tar.gz" "$MONTHLY_DIR/" 2>/dev/null || true
fi

log "rotating copies (${KEEP_DAILY} daily, ${KEEP_WEEKLY} weekly, ${KEEP_MONTHLY} monthly)"
rotate() {
  local dir="$1" keep="$2"
  local old
  old="$(ls -1t "$dir"/app-*.db 2>/dev/null | tail -n +"$((keep + 1))" || true)"
  if [ -n "$old" ]; then
    echo "$old" | while read -r file; do rm -f "$file"; done
  fi
  old="$(ls -1t "$dir"/media-*.tar.gz 2>/dev/null | tail -n +"$((keep + 1))" || true)"
  if [ -n "$old" ]; then
    echo "$old" | while read -r file; do rm -f "$file"; done
  fi
  return 0
}
rotate "$DAILY_DIR" "$KEEP_DAILY"
rotate "$WEEKLY_DIR" "$KEEP_WEEKLY"
rotate "$MONTHLY_DIR" "$KEEP_MONTHLY"

# Off-site copy: rclone preferred, plain scp as a fallback.
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  log "uploading to $RCLONE_REMOTE"
  rclone copy "$DAILY_DIR/app-$DAY.db" "$RCLONE_REMOTE" --quiet
  rclone copy "$DAILY_DIR/media-$DAY.tar.gz" "$RCLONE_REMOTE" --quiet
elif [ -n "${BACKUP_SCP_TARGET:-}" ] && command -v scp >/dev/null 2>&1; then
  log "uploading to $BACKUP_SCP_TARGET"
  scp -q "$DAILY_DIR/app-$DAY.db" "$DAILY_DIR/media-$DAY.tar.gz" "$BACKUP_SCP_TARGET"
else
  log "WARNING: no off-site target configured (RCLONE_REMOTE or BACKUP_SCP_TARGET); copy stays on this server"
fi

log "done: app-$DAY.db ($(du -h "$DAILY_DIR/app-$DAY.db" | cut -f1)), media-$DAY.tar.gz ($(du -h "$DAILY_DIR/media-$DAY.tar.gz" | cut -f1))"
