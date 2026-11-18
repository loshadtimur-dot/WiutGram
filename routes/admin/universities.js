'use strict';

const express = require('express');
const db = require('../../db');
const { adminLog } = require('../../lib/activity');
const { requireSudo } = require('../../middleware/auth');
const { cleaned, toInt } = require('../../middleware/validate');
const { notify } = require('../../lib/notify');
const { nowIso } = require('../../utils/time');
const { reject } = require('../../middleware/validate');

const router = express.Router();

function listWithCounts(includeHidden = true) {
  return db.all(
    `SELECT uni.*,
       (SELECT COUNT(*) FROM users u WHERE u.university_id = uni.id) AS users_count
     FROM universities uni
     ${includeHidden ? '' : 'WHERE uni.is_active = 1'}
     ORDER BY uni.sort_order ASC, uni.name COLLATE NOCASE ASC`
  );
}

function normalizePayload(body) {
  return {
    short_name: cleaned(body.short_name, 12),
    name: cleaned(body.name, 120),
    name_en: cleaned(body.name_en, 120),
    is_active: body.is_active === undefined ? true : !!body.is_active
  };
}

router.get('/', (req, res) => {
  res.json({ universities: listWithCounts(true) });
});

router.post('/', (req, res) => {
  const payload = normalizePayload(req.body || {});
  if (payload.short_name.length < 1 || payload.name.length < 2) {
    return res.status(400).json({ error: 'Укажите аббревиатуру и название' });
  }
  const duplicate = db.get(
    'SELECT id FROM universities WHERE short_name = ? COLLATE NOCASE OR name = ? COLLATE NOCASE',
    [payload.short_name, payload.name]
  );
  if (duplicate) return res.status(409).json({ error: 'Такой университет уже есть' });

  const maxOrder = db.get('SELECT COALESCE(MAX(sort_order), 0) AS t FROM universities').t;
  const now = nowIso();
  const result = db.run(
    `INSERT INTO universities (short_name, name, name_en, sort_order, is_active, is_system, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [payload.short_name, payload.name, payload.name_en, maxOrder + 10, payload.is_active ? 1 : 0, req.user.id, now, now]
  );
  adminLog(req, 'university_create', `university:${result.lastInsertRowid}`, { after: payload });
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.put('/order', (req, res) => {
  const order = Array.isArray(req.body && req.body.order) ? req.body.order.map((id) => toInt(id, 0)) : [];
  const existing = db.all('SELECT id FROM universities');
  const owned = new Set(existing.map((row) => row.id));
  if (order.length !== existing.length || !order.every((id) => owned.has(id))) {
    return res.status(400).json({ error: 'Некорректный список университетов' });
  }
  db.tx(() => {
    order.forEach((id, index) => {
      db.run('UPDATE universities SET sort_order = ?, updated_at = ? WHERE id = ?', [(index + 1) * 10, nowIso(), id]);
    });
  });
  adminLog(req, 'university_order', 'universities', { meta: { order } });
  res.json({ ok: true });
});

router.put('/:id', (req, res) => {
  const id = toInt(req.params.id, 0);
  const current = db.get('SELECT * FROM universities WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'Университет не найден' });
  const payload = normalizePayload(req.body || {});
  if (payload.short_name.length < 1 || payload.name.length < 2) {
    return res.status(400).json({ error: 'Укажите аббревиатуру и название' });
  }
  const duplicate = db.get(
    'SELECT id FROM universities WHERE id != ? AND (short_name = ? COLLATE NOCASE OR name = ? COLLATE NOCASE)',
    [id, payload.short_name, payload.name]
  );
  if (duplicate) return res.status(409).json({ error: 'Такой университет уже есть' });

  db.run(
    'UPDATE universities SET short_name = ?, name = ?, name_en = ?, is_active = ?, updated_at = ? WHERE id = ?',
    [payload.short_name, payload.name, payload.name_en, payload.is_active ? 1 : 0, nowIso(), id]
  );
  const after = db.get('SELECT * FROM universities WHERE id = ?', [id]);
  adminLog(req, 'university_update', `university:${id}`, { before: current, after });
  res.json({ ok: true });
});

router.delete('/:id', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const current = db.get('SELECT * FROM universities WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'Университет не найден' });
  if (current.is_system) return res.status(400).json({ error: 'Служебный пункт нельзя удалить' });

  const usersCount = db.get('SELECT COUNT(*) AS t FROM users WHERE university_id = ?', [id]).t;
  const transferTo = toInt(req.body && req.body.transfer_to, 0) || null;
  if (usersCount > 0 && transferTo === null && !(req.body && req.body.keep_users_without_university)) {
    return res.status(400).json({
      error: 'Выберите, куда перенести студентов',
      users_count: usersCount,
      options: ['transfer', 'keep']
    });
  }
  let target = null;
  if (transferTo) {
    target = db.get('SELECT * FROM universities WHERE id = ?', [transferTo]);
    if (!target || target.id === id) return res.status(400).json({ error: 'Некорректный университет для переноса' });
  }

  db.tx(() => {
    if (transferTo) {
      db.run('UPDATE users SET university_id = ?, updated_at = ? WHERE university_id = ?', [transferTo, nowIso(), id]);
    } else {
      db.run('UPDATE users SET university_id = NULL, updated_at = ? WHERE university_id = ?', [nowIso(), id]);
    }
    db.run('DELETE FROM universities WHERE id = ?', [id]);
  });

  for (const user of db.all('SELECT id FROM users WHERE university_id = ?', [transferTo || 0])) {
    notify({
      userId: user.id,
      type: 'system',
      text: transferTo
        ? `Ваш университет был объединён с «${target.name}». Профиль обновлён.`
        : 'Ваш университет был удалён. Выберите новый университет в профиле.'
    });
  }

  adminLog(req, 'university_delete', `university:${id}`, {
    before: current,
    meta: { users_count: usersCount, transfer_to: transferTo }
  });
  res.json({ ok: true, users_moved: usersCount });
});

router.post('/merge', requireSudo, (req, res) => {
  const fromId = toInt(req.body && req.body.from_id, 0);
  const intoId = toInt(req.body && req.body.into_id, 0);
  if (!fromId || !intoId || fromId === intoId) {
    return res.status(400).json({ error: 'Выберите два разных университета' });
  }
  const from = db.get('SELECT * FROM universities WHERE id = ?', [fromId]);
  const into = db.get('SELECT * FROM universities WHERE id = ?', [intoId]);
  if (!from || !into) return res.status(404).json({ error: 'Университет не найден' });
  if (from.is_system) return res.status(400).json({ error: 'Служебный пункт нельзя объединить' });

  const moved = db.get('SELECT COUNT(*) AS t FROM users WHERE university_id = ?', [fromId]).t;
  db.tx(() => {
    db.run('UPDATE users SET university_id = ?, updated_at = ? WHERE university_id = ?', [intoId, nowIso(), fromId]);
    db.run('UPDATE university_requests SET handled_by = ? WHERE id IN (SELECT id FROM university_requests WHERE status = ?)', [
      req.user.id,
      'new'
    ]);
    db.run('DELETE FROM universities WHERE id = ?', [fromId]);
  });
  for (const user of db.all('SELECT id FROM users WHERE university_id = ?', [intoId])) {
    notify({ userId: user.id, type: 'system', text: `Университеты объединены: «${from.name}» → «${into.name}».` });
  }
  adminLog(req, 'university_merge', `university:${intoId}`, { before: from, meta: { moved, into: intoId } });
  res.json({ ok: true, users_moved: moved });
});

/* ---------- Requests for new universities ---------- */

router.get('/requests', (req, res) => {
  const status = ['new', 'approved', 'rejected', 'all'].includes(String(req.query.status))
    ? String(req.query.status)
    : 'new';
  const params = [];
  let where = '';
  if (status !== 'all') {
    where = 'WHERE r.status = ?';
    params.push(status);
  }
  const rows = db.all(
    `SELECT r.*, u.username, u.display_name, u.avatar_path, u.university_id
     FROM university_requests r JOIN users u ON u.id = r.user_id
     ${where} ORDER BY r.created_at DESC LIMIT 200`,
    params
  );
  res.json({ requests: rows });
});

router.post('/requests/:id', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const request = db.get('SELECT * FROM university_requests WHERE id = ?', [id]);
  if (!request) return res.status(404).json({ error: 'Заявка не найдена' });
  if (request.status !== 'new') return res.status(400).json({ error: 'Заявка уже обработана' });

  const decision = String((req.body && req.body.decision) || '');
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Некорректное решение' });
  }

  if (decision === 'reject') {
    db.run('UPDATE university_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?', [
      'rejected',
      req.user.id,
      nowIso(),
      id
    ]);
    notify({ userId: request.user_id, type: 'system', text: `Заявка на университет «${request.name}» отклонена.` });
    adminLog(req, 'university_request_reject', `university_request:${id}`);
    return res.json({ ok: true });
  }

  let shortName = cleaned(req.body && req.body.short_name, 12);
  if (!shortName) shortName = request.name.replace(/[^A-Za-zА-Яа-я0-9]/g, '').slice(0, 8).toUpperCase() || 'UNI';
  let name = cleaned(req.body && req.body.name, 120) || request.name;
  let suffix = 1;
  while (db.get('SELECT id FROM universities WHERE short_name = ? COLLATE NOCASE OR name = ? COLLATE NOCASE', [shortName, name])) {
    suffix += 1;
    shortName = `${shortName.slice(0, 10)}${suffix}`;
  }
  const maxOrder = db.get('SELECT COALESCE(MAX(sort_order), 0) AS t FROM universities').t;
  const now = nowIso();
  const result = db.run(
    `INSERT INTO universities (short_name, name, name_en, sort_order, is_active, is_system, created_by, created_at, updated_at)
     VALUES (?, ?, '', ?, 1, 0, ?, ?, ?)`,
    [shortName, name, maxOrder + 10, req.user.id, now, now]
  );
  const universityId = Number(result.lastInsertRowid);
  db.run('UPDATE users SET university_id = ?, updated_at = ? WHERE id = ?', [universityId, now, request.user_id]);
  db.run('UPDATE university_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?', [
    'approved',
    req.user.id,
    now,
    id
  ]);
  notify({ userId: request.user_id, type: 'system', text: `Университет «${name}» добавлен, профиль обновлён.` });
  adminLog(req, 'university_request_approve', `university:${universityId}`, { meta: { request: id, name } });
  res.json({ ok: true, university_id: universityId });
});

// Import a plain text list: one line = "SHORT | Full name".
router.post('/import', (req, res) => {
  const text = String((req.body && req.body.text) || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let created = 0;
  let skipped = 0;
  const now = nowIso();
  let maxOrder = db.get('SELECT COALESCE(MAX(sort_order), 0) AS t FROM universities').t;
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 2) {
      skipped += 1;
      continue;
    }
    const shortName = cleaned(parts[0], 12);
    const name = cleaned(parts.slice(1).join('|'), 120);
    if (!shortName || name.length < 2) {
      skipped += 1;
      continue;
    }
    if (db.get('SELECT id FROM universities WHERE short_name = ? COLLATE NOCASE OR name = ? COLLATE NOCASE', [shortName, name])) {
      skipped += 1;
      continue;
    }
    maxOrder += 10;
    db.run(
      `INSERT INTO universities (short_name, name, name_en, sort_order, is_active, is_system, created_by, created_at, updated_at)
       VALUES (?, ?, '', ?, 1, 0, ?, ?, ?)`,
      [shortName, name, maxOrder, req.user.id, now, now]
    );
    created += 1;
  }
  adminLog(req, 'university_import', 'universities', { meta: { created, skipped } });
  res.json({ ok: true, created, skipped });
});

router.get('/export', (req, res) => {
  const rows = db.all('SELECT short_name, name FROM universities ORDER BY sort_order ASC');
  res.json({ text: rows.map((row) => `${row.short_name} | ${row.name}`).join('\n') });
});

module.exports = router;
