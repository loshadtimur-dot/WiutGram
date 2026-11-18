#!/usr/bin/env bash
# Rolls the code back to the last deployment that passed its health check.
# Usage: sudo -u unilovers bash /srv/uni-lovers/deploy/rollback.sh [commit]
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/uni-lovers}"
SERVICE="${SERVICE:-uni-lovers}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
STATE_DIR="$APP_DIR/.deploy"

cd "$APP_DIR"

TARGET="${1:-}"
if [ -z "$TARGET" ] && [ -f "$STATE_DIR/last-good" ]; then
  TARGET="$(cat "$STATE_DIR/last-good")"
fi
if [ -z "$TARGET" ]; then
  echo "No target commit: pass one explicitly or deploys have no last-good record." >&2
  exit 1
fi

echo "[rollback] switching to $TARGET"
git reset --hard "$TARGET"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
fi
systemctl restart "$SERVICE"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
  if printf '%s' "$body" | grep -q '"ok":true'; then
    echo "[rollback] service healthy: $body"
    exit 0
  fi
done

echo "[rollback] service still unhealthy, inspect: journalctl -u $SERVICE -n 100" >&2
exit 1
