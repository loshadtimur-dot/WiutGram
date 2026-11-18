#!/usr/bin/env bash
# Pulls the current main branch and restarts the service.
# Usage: sudo -u unilovers bash /srv/uni-lovers/deploy/deploy.sh
#
# Flow: backup -> fetch -> install deps -> migrate on start -> restart ->
# health check -> remember the good commit (or roll back automatically).
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/uni-lovers}"
SERVICE="${SERVICE:-uni-lovers}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
BRANCH="${BRANCH:-main}"
STATE_DIR="$APP_DIR/.deploy"

cd "$APP_DIR"

echo "[deploy] $(date -Iseconds) start"
mkdir -p "$STATE_DIR"

echo "[deploy] backup before deploy"
UNI_DB_FILE="${UNI_DB_FILE:-$APP_DIR/data/app.db}" \
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/uploads}" \
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}" \
  bash "$APP_DIR/deploy/backup.sh"

PREVIOUS="$(git rev-parse HEAD)"
echo "$PREVIOUS" > "$STATE_DIR/previous-commit"

echo "[deploy] fetching origin/$BRANCH"
git fetch --prune origin
git checkout --force "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[deploy] installing production dependencies"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi

restart_and_check() {
  systemctl restart "$SERVICE"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    sleep 3
    body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q '"ok":true'; then
      echo "[deploy] health ok: $body"
      return 0
    fi
  done
  echo "[deploy] health check failed" >&2
  return 1
}

if restart_and_check; then
  git rev-parse HEAD > "$STATE_DIR/last-good"
  echo "[deploy] $(date -Iseconds) done at $(git rev-parse --short HEAD)"
else
  echo "[deploy] rolling back to $PREVIOUS" >&2
  git reset --hard "$PREVIOUS"
  if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; fi
  systemctl restart "$SERVICE" || true
  echo "[deploy] rolled back, check journalctl -u $SERVICE -n 100" >&2
  exit 1
fi
