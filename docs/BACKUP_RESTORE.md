# Бэкапы и восстановление

## Что делает `deploy/backup.sh`

1. Делает консистентный снимок SQLite: `VACUUM INTO` (через `sqlite3`, а если его
   нет — через `scripts/sqlite-tool.js` на `better-sqlite3`). База при этом не
   блокируется и не изменяется.
2. Проверяет `PRAGMA integrity_check` у копии. При ошибке бэкап не публикуется,
   владельцу уходит алерт.
3. Архивирует `uploads/` и `storage/` в `media-YYYYMMDD.tar.gz`.
4. Раскладывает копии: `daily/` (7 штук), `weekly/` (4, по воскресеньям),
   `monthly/` (3, первого числа).
5. Опционально копирует за пределы сервера: `rclone` (если задан
   `RCLONE_REMOTE`) или `scp` (`BACKUP_SCP_TARGET`). Если не задано — пишет
   предупреждение в лог, копия остаётся только на сервере.
6. При `AGE_RECIPIENT` шифрует архивы перед отправкой (`age`).

Запуск по расписанию — systemd timer `uni-lovers-backup.timer` (03:15 по Ташкенту,
`Persistent=true`). Ручной запуск:

```bash
sudo -u unilovers bash /srv/uni-lovers/deploy/backup.sh
```

## Где лежат копии

```
/srv/uni-lovers/backups/
  daily/    app-20261118.db, media-20261118.tar.gz
  weekly/   ...
  monthly/  ...
  pre-restore/  копии, снятые перед восстановлением
```

## Как проверить, что бэкап живой (раз в месяц)

```bash
LATEST=/srv/uni-lovers/backups/daily/app-$(date +%Y%m%d).db
node /srv/uni-lovers/scripts/sqlite-tool.js check "$LATEST"
sqlite3 "$LATEST" 'select count(*) from users;'
```

## Восстановление

```bash
sudo -u unilovers bash /srv/uni-lovers/scripts/restore.sh \
  /srv/uni-lovers/backups/daily/app-20261118.db \
  /srv/uni-lovers/backups/daily/media-20261118.tar.gz
```

Скрипт: проверяет целостность архива → копирует текущую базу в
`backups/pre-restore/` → останавливает сервис → заменяет базу и медиа →
запускает сервис → 30 секунд ждёт `/api/health`. Если сервис не поднялся, старая
база остаётся в `pre-restore` и нужно действовать по `docs/RUNBOOK.md`.

## Что проверено на копии данных

На временной копии реальной БД выполнено: бэкап → проверка integrity → подмена
базы «мусором» → восстановление → сверка количества записей (31 пользователь,
103 поста) и распаковка архива медиа. Ротация проверена отдельно: из девяти
ежедневных копий осталось семь.

## Чего бэкап не делает

- Не копирует `/etc/uni-lovers/uni-lovers.env` и `data/secret.txt`. Сохраните
  `JWT_SECRET` в менеджере паролей: без него не расшифруются TOTP-секреты и
  придётся сбрасывать 2FA.
- Не восстанавливает Caddy-конфиг и DNS — они описаны в `docs/DEPLOY.md`.
