'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const sessions = require('../../lib/sessions');
const presence = require('../../lib/presence');
const { adminLog } = require('../../lib/activity');
const { notify } = require('../../lib/notify');
const { requireOwner, requireSudo, noStore } = require('../../middleware/auth');
const { adminLimiter } = require('../../middleware/rateLimit');
const { toInt, clamp, cleaned } = require('../../middleware/validate');
const { nowIso, lastDays } = require('../../utils/time');
const { UPLOAD_DIR } = require('../../utils/files');
const DATA_DIR = db.DATA_DIR;
const { CITY } = require('../../config');

const router = express.Router();
router.use(requireOwner, noStore, adminLimiter);

const universityRouter = require('./universities');
const usersRouter = require('./users');
const contentRouter = require('./content');
const reportsRouter = require('./reports');
const adsRouter = require('./ads');
const superlikesRouter = require('./superlikes');
const cosmeticsRouter = require('./cosmetics');
const shopRouter = require('./shop');
const accessRouter = require('./access');
const groupsRouter = require('./groups');
const designRouter = require('./design');

/* ---------- Re-authentication ---------- */

// Confirms the owner password and unlocks dangerous actions for 10 minutes.
router.post('/reauth', (req, res) => {
  const password = String((req.body && req.body.password) || '');
  if (!password || !bcrypt.compareSync(password, req.user.password_hash)) {
    adminLog(req, 'reauth_failed', `user:${req.user.id}`);
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  const until = sessions.grantSudo(req.session.id);
  adminLog(req, 'reauth', `user:${req.user.id}`);
  return res.json({ ok: true, sudo_until: until, minutes: sessions.SUDO_MINUTES });
});

/* ---------- Dashboard ---------- */

function seriesFor(table, days, where = '1=1', params = []) {
  const rows = db.all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total FROM ${table}
     WHERE created_at >= ? AND ${where} GROUP BY day`,
    [`${days[0]}T00:00:00.000Z`, ...params]
  );
  const map = new Map(rows.map((row) => [row.day, row.total]));
  return days.map((day) => ({ day, value: map.get(day) || 0 }));
}

router.get('/stats', (req, res) => {
  const days = lastDays(30);
  const totals = {
    users: db.get('SELECT COUNT(*) AS t FROM users WHERE is_demo = 0').t,
    demo_users: db.get('SELECT COUNT(*) AS t FROM users WHERE is_demo = 1').t,
    new_24h: db.get('SELECT COUNT(*) AS t FROM users WHERE created_at > ?', [
      new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    ]).t,
    new_7d: db.get('SELECT COUNT(*) AS t FROM users WHERE created_at > ?', [
      new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    ]).t,
    new_30d: db.get('SELECT COUNT(*) AS t FROM users WHERE created_at > ?', [
      new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    ]).t,
    online: presence.onlineCount(),
    matches: db.get('SELECT COUNT(*) AS t FROM matches WHERE is_active = 1').t,
    messages: db.get('SELECT COUNT(*) AS t FROM messages').t,
    posts: db.get('SELECT COUNT(*) AS t FROM posts').t,
    stories: db.get('SELECT COUNT(*) AS t FROM stories WHERE expires_at > ?', [nowIso()]).t,
    likes: db.get("SELECT COUNT(*) AS t FROM swipes WHERE action IN ('like','super')").t,
    reports_new: db.get("SELECT COUNT(*) AS t FROM reports WHERE status = 'new'").t,
    banned: db.get('SELECT COUNT(*) AS t FROM users WHERE is_banned = 1').t,
    shadow_banned: db.get('SELECT COUNT(*) AS t FROM users WHERE shadow_banned = 1').t
  };

  const universities = db.all(
    `SELECT uni.id, uni.short_name, uni.name,
       (SELECT COUNT(*) FROM users u WHERE u.university_id = uni.id) AS users
     FROM universities uni ORDER BY users DESC, uni.sort_order ASC LIMIT 20`
  );
  const courses = db.all(
    `SELECT course, COUNT(*) AS total FROM users WHERE course IS NOT NULL GROUP BY course ORDER BY total DESC`
  );
  const genders = db.all('SELECT gender, COUNT(*) AS total FROM users WHERE is_demo = 0 GROUP BY gender');
  const ages = db.all(
    `SELECT CASE
       WHEN age < 20 THEN '18-19'
       WHEN age < 25 THEN '20-24'
       WHEN age < 30 THEN '25-29'
       WHEN age < 35 THEN '30-34'
       ELSE '35+' END AS bucket, COUNT(*) AS total
     FROM (SELECT CAST((julianday('now') - julianday(birthdate)) / 365.25 AS INTEGER) AS age FROM users WHERE is_demo = 0)
     GROUP BY bucket ORDER BY bucket`
  );

  const latestUsers = db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar_path, u.created_at, u.is_demo,
       uni.short_name AS university_short_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     ORDER BY u.created_at DESC LIMIT 8`
  );
  const latestReports = db.all(
    `SELECT r.id, r.reason, r.status, r.created_at, r.reported_id,
       u.username AS reported_username, u.display_name AS reported_name
     FROM reports r JOIN users u ON u.id = r.reported_id
     ORDER BY r.created_at DESC LIMIT 6`
  );

  res.json({
    totals,
    charts: {
      days,
      registrations: seriesFor('users', days, 'is_demo = 0'),
      messages: seriesFor('messages', days),
      swipes: seriesFor('swipes', days),
      posts: seriesFor('posts', days)
    },
    universities,
    courses,
    genders,
    ages,
    latest_users: latestUsers,
    latest_reports: latestReports
  });
});

/* ---------- Site settings ---------- */

const SETTING_KEYS = [
  'site_name',
  'registration_open',
  'maintenance_mode',
  'welcome_message',
  'max_photos',
  'max_bio',
  'super_likes_per_day',
  'allow_university_requests'
];

router.get('/settings', (req, res) => {
  res.json({ settings: db.listSettings(), city: CITY, min_age: 18 });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const before = db.listSettings();
  for (const key of SETTING_KEYS) {
    if (body[key] === undefined) continue;
    if (['registration_open', 'maintenance_mode', 'allow_university_requests'].includes(key)) {
      db.setSetting(key, body[key] ? '1' : '0');
    } else if (key === 'max_photos') {
      db.setSetting(key, String(clamp(toInt(body[key], 9), 1, 9)));
    } else if (key === 'max_bio') {
      db.setSetting(key, String(clamp(toInt(body[key], 500), 50, 2000)));
    } else if (key === 'super_likes_per_day') {
      db.setSetting(key, String(clamp(toInt(body[key], 5), 0, 50)));
    } else if (key === 'site_name') {
      db.setSetting(key, cleaned(body[key], 40) || 'Wiutgram');
    } else if (key === 'welcome_message') {
      db.setSetting(key, cleaned(body[key], 300));
    }
  }
  const after = db.listSettings();
  adminLog(req, 'update_settings', 'site', { before, after });
  res.json({ settings: after, min_age: 18 });
});

/* ---------- Announcements ---------- */

router.get('/announcements', (req, res) => {
  const rows = db.all(
    `SELECT a.*, uni.short_name AS university_short_name
     FROM announcements a LEFT JOIN universities uni ON uni.id = a.target_university_id
     ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json({ announcements: rows });
});

router.post('/announcements', (req, res) => {
  const title = cleaned(req.body && req.body.title, 120);
  const body = cleaned(req.body && req.body.body, 2000);
  const targetUniversityId = req.body && req.body.target_university_id
    ? toInt(req.body.target_university_id, 0) || null
    : null;
  if (title.length < 2 || body.length < 2) {
    return res.status(400).json({ error: 'Заполните заголовок и текст' });
  }
  let recipients = [];
  if (targetUniversityId) {
    recipients = db.all('SELECT id FROM users WHERE university_id = ? AND is_demo = 0', [targetUniversityId]);
  } else {
    recipients = db.all('SELECT id FROM users WHERE is_demo = 0');
  }
  for (const user of recipients) {
    notify({ userId: user.id, type: 'system', text: `${title}\n\n${body}` });
  }
  const result = db.run(
    'INSERT INTO announcements (title, body, target_university_id, created_by, recipients, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [title, body, targetUniversityId, req.user.id, recipients.length, nowIso()]
  );
  adminLog(req, 'announcement', `announcement:${result.lastInsertRowid}`, { meta: { title, recipients: recipients.length } });
  res.status(201).json({ ok: true, recipients: recipients.length });
});

/* ---------- Activity log (read-only by design) ---------- */

router.get('/log', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const q = cleaned(req.query.q, 80);
  const filters = [];
  const params = [];
  if (q) {
    filters.push('(a.action LIKE ? OR a.target LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (req.query.action) {
    filters.push('a.action = ?');
    params.push(String(req.query.action));
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT a.*, u.username, u.display_name FROM activity_log a
     LEFT JOIN users u ON u.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = db.get(
    `SELECT COUNT(*) AS t FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id ${where}`,
    params
  ).t;
  res.json({ log: rows, total, limit, offset });
});

/* ---------- Backups ---------- */

const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

router.get('/backups', (req, res) => {
  ensureBackupDir();
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  res.json({
    backups: files,
    db_size: fs.existsSync(db.DB_FILE) ? fs.statSync(db.DB_FILE).size : 0,
    uploads_size: dirSize(UPLOAD_DIR)
  });
});

router.post('/backups', (req, res) => {
  ensureBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `backup-${stamp}.db`;
  const target = path.join(BACKUP_DIR, name);
  try {
    db.raw.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } catch (err) {
    return res.status(500).json({ error: 'Не удалось создать резервную копию' });
  }
  const stat = fs.statSync(target);
  adminLog(req, 'backup_create', `backup:${name}`, { meta: { size: stat.size } });
  res.status(201).json({ ok: true, backup: { name, size: stat.size, created_at: stat.mtime.toISOString() } });
});

router.get('/backups/:name', (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^backup-[\w.-]+\.db$/.test(name)) return res.status(400).json({ error: 'Некорректное имя файла' });
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Файл не найден' });
  adminLog(req, 'backup_download', `backup:${name}`);
  res.download(file, name);
});

router.delete('/backups/:name', requireSudo, (req, res) => {
  const name = path.basename(String(req.params.name || ''));
  if (!/^backup-[\w.-]+\.db$/.test(name)) return res.status(400).json({ error: 'Некорректное имя файла' });
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Файл не найден' });
  fs.unlinkSync(file);
  adminLog(req, 'backup_delete', `backup:${name}`);
  res.json({ ok: true });
});

/* ---------- Demo data ---------- */

router.post('/seed-demo', async (req, res) => {
  try {
    const seed = require('../../db/seed');
    const stats = await seed.seedDemo({ count: clamp(toInt(req.body && req.body.count, 30), 1, 60) });
    adminLog(req, 'seed_demo', 'demo', { meta: { created: stats.created } });
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось создать демо-профили' });
  }
});

router.delete('/demo', (req, res) => {
  const seed = require('../../db/seed');
  const stats = seed.removeDemo();
  adminLog(req, 'remove_demo', 'demo', { meta: stats });
  res.json({ ok: true, ...stats });
});

/* ---------- Ownership transfer ---------- */

router.post('/transfer-owner', requireSudo, (req, res) => {
  const targetId = toInt(req.body && req.body.user_id, 0);
  const confirmWord = String((req.body && req.body.confirm) || '').trim().toUpperCase();
  const password = String((req.body && req.body.password) || '');

  if (confirmWord !== 'ПЕРЕДАТЬ') {
    return res.status(400).json({ error: 'Введите слово ПЕРЕДАТЬ для подтверждения' });
  }
  if (!bcrypt.compareSync(password, req.user.password_hash)) {
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  const target = db.get('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Вы уже владелец' });
  if (target.is_demo) return res.status(400).json({ error: 'Нельзя передать владение демо-профилю' });

  const now = nowIso();
  db.tx(() => {
    db.run('UPDATE users SET role = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', [
      'user',
      now,
      req.user.id
    ]);
    db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', ['owner', now, target.id]);
  });
  sessions.revokeAllForUser(req.user.id);
  adminLog(req, 'transfer_owner', `user:${target.id}`, { meta: { from: req.user.id, to: target.id } });
  res.json({ ok: true, new_owner: { id: target.id, username: target.username } });
});

/* ---------- Nested routers ---------- */

router.use('/universities', universityRouter);
router.use('/users', usersRouter);
router.use('/content', contentRouter);
router.use('/reports', reportsRouter);
router.use('/ads', adsRouter);
router.use('/superlikes', superlikesRouter);
router.use('/cosmetics', cosmeticsRouter);
router.use('/shop', shopRouter);
router.use('/access', accessRouter);
router.use('/groups', groupsRouter);
router.use('/design', designRouter);

/* ---------- Global content moderation ---------- */

module.exports = router;
