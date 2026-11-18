# Деплой на VPS: пошагово для владельца

Всё, что ниже, делает владелец руками. Агент проверить VPS, DNS и настоящий
HTTPS не может — это отмечено в `docs/HANDOFF.md`.

Нужно: домен, VPS с Ubuntu 24.04 LTS (минимум 2 ГБ RAM, 20 ГБ диска), доступ
по SSH. Стоимость ориентировочно: домен 10–15 $/год, VPS 5–10 $/мес.

## 1. Домен

1. Купите домен у любого регистратора (например `.uz` у UZINFOCOM или `.com`).
2. В DNS создайте две A-записи:
   - `@` → IP вашего VPS;
   - `www` → тот же IP.
3. Проверьте, что записи разошлись: `dig +short example.com` должен вернуть IP.

## 2. VPS и первый вход

```bash
ssh root@ВАШ_IP
adduser deploy            # пользователь без root
usermod -aG sudo deploy
# скопируйте свой ключ, затем отключите вход по паролю в /etc/ssh/sshd_config
```

## 3. Код на сервере

```bash
sudo mkdir -p /srv/uni-lovers && sudo chown deploy:deploy /srv/uni-lovers
git clone https://github.com/loshadtimur-dot/uni-lovers.git /srv/uni-lovers
cd /srv/uni-lovers
```

Если репозиторий приватный, используйте deploy key или токен только на чтение
(он останется в `~/.git-credentials` пользователя `deploy`, не в репозитории).

## 4. Установка окружения

```bash
sudo bash /srv/uni-lovers/deploy/install.sh
```

Скрипт поставит Node.js 20, Caddy, sqlite3, создаст пользователя `unilovers`,
каталоги `/srv/uni-lovers/{data,uploads,storage,logs,backups}` и
`/etc/uni-lovers`, установит systemd-юнит, таймер бэкапа и logrotate.

## 5. Секреты

```bash
sudo cp /srv/uni-lovers/deploy/.env.production.example /etc/uni-lovers/uni-lovers.env
sudo nano /etc/uni-lovers/uni-lovers.env      # впишите значения
sudo chown root:unilovers /etc/uni-lovers/uni-lovers.env
sudo chmod 0640 /etc/uni-lovers/uni-lovers.env
```

Обязательно:

- `JWT_SECRET` — `openssl rand -hex 48` (без него создастся `data/secret.txt`,
  это тоже рабочий вариант, но файл нельзя терять: с ним связаны сессии и 2FA);
- `SITE_URL` и `APP_URL` — `https://ваш-домен`;
- `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` — для алертов бэкапа;
- при желании `RCLONE_REMOTE` для внешней копии бэкапов.

## 6. Домен в Caddy

```bash
sudo nano /etc/caddy/caddy.env
#   SITE_DOMAIN=ваш-домен
#   ACME_EMAIL=ваш@email
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

Caddy сам получит сертификат Let's Encrypt. Порты 80 и 443 должны быть открыты
(`install.sh` настраивает ufw).

## 7. Первый запуск

```bash
sudo chown -R unilovers:unilovers /srv/uni-lovers
sudo -u unilovers bash /srv/uni-lovers/deploy/deploy.sh
curl -s https://ваш-домен/api/health
```

Ожидаемый ответ: `{"ok":true,...,"db_ok":true,"version":"1.0.0"}`.

## 8. Стать владельцем

1. Откройте `https://ваш-домен` и **сразу зарегистрируйтесь** — первый реальный
   аккаунт становится владельцем.
2. Пароль владельца — минимум 10 символов, сохраните его в менеджере паролей.
3. Включите 2FA: «Безопасность» → «Двухфакторная аутентификация», сохраните
   резервные коды.
4. Настройте рекламу: «Админ-панель» → «Реклама» → «Настройки»: Telegram,
   цена, реквизиты карты, флажок «Показывать карту».

## 9. Секреты GitHub для автодеплоя

В репозитории → Settings → Secrets and variables → Actions добавьте:

| Секрет | Что это |
| --- | --- |
| `VPS_HOST` | IP или домен сервера |
| `VPS_USER` | `deploy` (пользователь с sudo без пароля для deploy-скриптов) |
| `VPS_SSH_KEY` | приватный ключ, публичная часть — в `~/.ssh/authorized_keys` |
| `SITE_URL` | `https://ваш-домен` (для проверки после выкладки) |

Чтобы деплой шёл без ввода пароля:

```bash
echo 'deploy ALL=(root) NOPASSWD: /opt/uni-lovers/deploy/deploy.sh, /opt/uni-lovers/deploy/rollback.sh' \
  | sudo tee /etc/sudoers.d/uni-lovers-deploy
```

(в примере путь `/opt/uni-lovers`; при `/srv/uni-lovers` используйте его).

Workflow `Deploy` запускается вручную (Actions → Deploy → Run workflow) или
автоматически после зелёного CI в ветке `main`. Пайплайн: бэкап БД → `git` →
`npm ci --omit=dev` → рестарт → проверка `/api/health`; при неудаче вызывается
`deploy/rollback.sh`.

## 10. Обновление вручную

```bash
sudo -u unilovers bash /srv/uni-lovers/deploy/deploy.sh
```

Откат: `sudo -u unilovers bash /srv/uni-lovers/deploy/rollback.sh`.

## 11. Проверка после запуска

```bash
systemctl status uni-lovers --no-pager
journalctl -u uni-lovers -n 50 --no-pager
curl -s https://ваш-домен/api/health
sudo -u unilovers bash /srv/uni-lovers/deploy/backup.sh
systemctl list-timers uni-lovers-backup.timer
```

Дальше: `docs/BACKUP_RESTORE.md`, `docs/RUNBOOK.md`.
