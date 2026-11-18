# RUNBOOK: что делать, когда что-то сломалось

Команды выполняются на сервере под пользователем с sudo.

## Сайт не открывается

1. `systemctl status uni-lovers --no-pager` — сервис запущен?
2. `journalctl -u uni-lovers -n 100 --no-pager` — первая ошибка обычно и есть причина.
3. `curl -s http://127.0.0.1:3000/api/health` — отвечает ли приложение в обход Caddy.
4. `systemctl status caddy --no-pager` и `journalctl -u caddy -n 50 --no-pager` —
   жив ли прокси и сертификат.
5. Если приложение отвечает, а сайт нет — проблема в Caddy/DNS, а не в коде.

## Сервис падает сразу после старта

```bash
journalctl -u uni-lovers -n 200 --no-pager | tail -40
sudo -u unilovers node /srv/uni-lovers/server.js   # запуск вручную, видно ошибку
```

Частые причины: не читается `/etc/uni-lovers/uni-lovers.env` (права `0640`,
владелец `root:unilovers`), занят порт 3000, повреждена БД, не хватает места.

## Плохой деплой

```bash
sudo -u unilovers bash /srv/uni-lovers/deploy/rollback.sh
```

Скрипт возвращает коммит из `.deploy/last-good`, переустанавливает зависимости,
перезапускает сервис и проверяет `/api/health`. Если и это не помогло:

```bash
cd /srv/uni-lovers && git log --oneline -10
sudo -u unilovers bash /srv/uni-lovers/deploy/rollback.sh <нужный-коммит>
```

## База повреждена

```bash
sudo -u unilovers bash /srv/uni-lovers/scripts/restore.sh \
  /srv/uni-lovers/backups/daily/app-ПОСЛЕДНИЙ.db
```

Подробности — `docs/BACKUP_RESTORE.md`.

## Кончилось место

```bash
df -h /srv
du -sh /srv/uni-lovers/* | sort -h
```

Безопасно чистить: старые логи (`logrotate` уже настроен), старые бэкапы
(ротация), `storage/` — только после проверки, что файлы не нужны пользователям.

## Владелец потерял доступ

- Забыт пароль: сброса по почте пока нет, пароль меняется скриптом на сервере:
  `cd /srv/uni-lovers && NEW_OWNER_PASSWORD='...' node scripts/owner-reset.js owner@example.com`.
  Скрипт меняет только владельца, завершает все его сессии и требует сменить
  пароль при следующем входе; 2FA не трогает.
- Потерян телефон с 2FA: используйте резервные коды (10 штук, выдаются при
  включении). Если их нет — очистите `totp_enabled`, `totp_secret`,
  `totp_backup_codes` у владельца в БД и войдите по паролю, затем включите 2FA
  заново.

## Подозрение на взлом

1. `sqlite3 data/app.db "select action, created_at, ip from activity_log order by id desc limit 50;"`.
2. Смените пароль владельца и `JWT_SECRET` (после смены все сессии завершатся).
3. Проверьте раздел «Безопасность» в панели: активные сессии, неудачные входы.
4. Сохраните копию БД и логов до любых изменений.

## Мониторинг

Внешний пингер (UptimeRobot и подобные) настраивается на
`https://ваш-домен/api/health`, интервал 5 минут, ожидаемый код 200 и подстрока
`"ok":true`. Телеграм-алерты бэкапа приходят при заданных
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`.
