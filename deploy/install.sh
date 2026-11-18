#!/usr/bin/env bash
# One-time setup of a clean Ubuntu LTS server for UNI Lovers.
# Run as root:  sudo bash deploy/install.sh
# It installs Node.js LTS, Caddy, sqlite3 and creates the service user.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/uni-lovers}"
APP_USER="${APP_USER:-unilovers}"
ENV_DIR="/etc/uni-lovers"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash deploy/install.sh" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This installer supports Ubuntu/Debian only." >&2
  exit 1
fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git rsync sqlite3 ufw age logrotate

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  echo "==> Installing Node.js ${NODE_MAJOR}.x"
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
  echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Installing Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Creating service user ${APP_USER}"
if ! id "$APP_USER" >/dev/null 2>&1; then
  adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> Creating directories"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 \
  "$APP_DIR" "$APP_DIR/data" "$APP_DIR/data/backups" "$APP_DIR/uploads" \
  "$APP_DIR/storage" "$APP_DIR/logs" "$APP_DIR/backups"
install -d -o root -g "$APP_USER" -m 0750 "$ENV_DIR"
install -d -o caddy -g caddy -m 0755 /var/log/caddy

echo "==> Installing systemd unit and timers"
install -m 0644 "$APP_DIR/deploy/uni-lovers.service" /etc/systemd/system/uni-lovers.service
if [ -f "$APP_DIR/deploy/uni-lovers-backup.service" ]; then
  install -m 0644 "$APP_DIR/deploy/uni-lovers-backup.service" /etc/systemd/system/
  install -m 0644 "$APP_DIR/deploy/uni-lovers-backup.timer" /etc/systemd/system/
fi
install -m 0644 "$APP_DIR/deploy/logrotate.conf" /etc/logrotate.d/uni-lovers
systemctl daemon-reload

echo "==> Configuring Caddy"
install -m 0644 "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
if [ ! -f /etc/caddy/caddy.env ]; then
  cat > /etc/caddy/caddy.env <<'CADDYENV'
SITE_DOMAIN=example.com
ACME_EMAIL=admin@example.com
CADDYENV
  chmod 0640 /etc/caddy/caddy.env
fi
systemctl enable --now caddy

echo "==> Firewall"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

cat <<EOF

Готово. Осталось:
  1) Скопировать проект в ${APP_DIR} (git clone ... ${APP_DIR})
  2) Создать ${ENV_DIR}/uni-lovers.env по образцу deploy/.env.production.example
     chown root:${APP_USER} ${ENV_DIR}/uni-lovers.env && chmod 0640 ${ENV_DIR}/uni-lovers.env
  3) Прописать домен в /etc/caddy/caddy.env и перезапустить: systemctl restart caddy
  4) Первый деплой: sudo -u ${APP_USER} bash ${APP_DIR}/deploy/deploy.sh
  5) Включить бэкапы: systemctl enable --now uni-lovers-backup.timer
EOF
