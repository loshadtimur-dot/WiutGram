'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const presence = require('../../lib/presence');
const sessionStore = require('../../lib/sessions');
const { adminLog } = require('../../lib/activity');
const { requireSudo, signToken, setAuthCookie } = require('../../middleware/auth');
const { imageUpload } = require('../../middleware/upload');
const { uploadLimiter } = require('../../middleware/rateLimit');
const {
  toInt,
  clamp,
  cleaned,
  validatePassword,
  validateEmail,
  validateUsername,
  oneOf
} = require('../../middleware/validate');
const { CITY, DISTRICTS, COURSE_VALUES } = require('../../config');
const { INTEREST_IDS, LANGUAGES, GENDERS, INTERESTED_IN, LOOKING_FOR } = require('../../utils/constants');
const { SQL_AGE, isAdult, ageFromBirthdate } = require('../../utils/age');
const { normalizeList } = require('../../utils/sanitize');
const { nowIso } = require('../../utils/time');
const { meView } = require('../../lib/userView');
const { deleteUpload } = require('../../utils/files');
const cosmeticsStore = require('../../lib/cosmetics/store');

const router = express.Router();

const UNIVERSITY_JOIN = 'LEFT JOIN universities uni ON uni.id = u.university_id';

function baseUser(id) {
  return db.get(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u ${UNIVERSITY_JOIN} WHERE u.id = ?`,
    [id]
  );
}

// Admin views may include private fields but must never expose password hashes.
function safeAdminUser(row) {
  if (!row) return row;
  const copy = { ...row };
  delete copy.password_hash;
  return copy;
}

function userCounts(id) {
  return {
    photos: db.get('SELECT COUNT(*) AS t FROM photos WHERE user_id = ?', [id]).t,
    posts: db.get('SELECT COUNT(*) AS t FROM posts WHERE user_id = ?', [id]).t,
    stories: db.get('SELECT COUNT(*) AS t FROM stories WHERE user_id = ? AND expires_at > ?', [id, nowIso()]).t,
    comments: db.get('SELECT COUNT(*) AS t FROM comments WHERE user_id = ?', [id]).t,
    likes_given: db.get("SELECT COUNT(*) AS t FROM swipes WHERE from_id = ? AND action IN ('like','super')", [id]).t,
    likes_received: db.get("SELECT COUNT(*) AS t FROM swipes WHERE to_id = ? AND action IN ('like','super')", [id]).t,
    super_likes: db.get("SELECT COUNT(*) AS t FROM swipes WHERE from_id = ? AND action = 'super'", [id]).t,
    swipes: db.get('SELECT COUNT(*) AS t FROM swipes WHERE from_id = ?', [id]).t,
    matches: db.get('SELECT COUNT(*) AS t FROM matches WHERE is_active = 1 AND (user_a = ? OR user_b = ?)', [id, id]).t,
    profile_views: db.get('SELECT COUNT(*) AS t FROM profile_views WHERE viewed_id = ?', [id]).t,
    reports: db.get("SELECT COUNT(*) AS t FROM reports WHERE reported_id = ? AND status = 'new'", [id]).t,
    unread_notifications: db.get('SELECT COUNT(*) AS t FROM notifications WHERE user_id = ? AND is_read = 0', [id]).t
  };
}

function userFiles(id) {
  const files = [];
  db.all('SELECT path FROM photos WHERE user_id = ?', [id]).forEach((row) => files.push(row.path));
  db.all('SELECT image_path FROM posts WHERE user_id = ?', [id]).forEach((row) => files.push(row.image_path));
  db.all('SELECT media_path FROM stories WHERE user_id = ?', [id]).forEach((row) => files.push(row.media_path));
  db.all('SELECT image_path FROM messages WHERE sender_id = ? AND image_path IS NOT NULL', [id]).forEach((row) =>
    files.push(row.image_path)
  );
  const user = db.get('SELECT avatar_path FROM users WHERE id = ?', [id]);
  if (user && user.avatar_path) files.push(user.avatar_path);
  return [...new Set(files.filter(Boolean))];
}

// Deletes an account with all content and files.
function deleteUserPermanently(id) {
  const files = userFiles(id);
  db.run('DELETE FROM users WHERE id = ?', [id]);
  for (const file of files) deleteUpload(file);
  return files.length;
}

/* ---------- List, export, bulk ---------- */

router.get('/export', (req, res) => {
  const format = req.query.format === 'json' ? 'json' : 'csv';
  const rows = db.all(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.created_at, u.last_login_at, u.last_ip,
       u.is_banned, u.shadow_banned, u.is_verified, u.is_demo,
       uni.short_name AS university
     FROM users u ${UNIVERSITY_JOIN} ORDER BY u.id ASC`
  );
  adminLog(req, 'export_users', 'users', { meta: { format, count: rows.length } });
  if (format === 'json') return res.json({ users: rows });
  const header = 'id,username,email,display_name,role,university,created_at,last_login_at,last_ip,is_banned,shadow_banned,is_verified,is_demo';
  const escape = (value) => `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`;
  const csv = [header]
    .concat(rows.map((row) => [
      row.id,
      row.username,
      row.email,
      row.display_name,
      row.role,
      row.university || '',
      row.created_at,
      row.last_login_at || '',
      row.last_ip || '',
      row.is_banned,
      row.shadow_banned,
      row.is_verified,
      row.is_demo
    ].map(escape).join(',')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  res.send(`\uFEFF${csv}`);
});

router.post('/bulk', requireSudo, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids)
    ? [...new Set(req.body.ids.map((id) => toInt(id, 0)).filter(Boolean))]
    : [];
  const action = String((req.body && req.body.action) || '');
  if (!ids.length || ids.length > 500) return res.status(400).json({ error: 'Выберите пользователей' });
  if (!['ban', 'unban', 'verify', 'unverify', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'Некорректное действие' });
  }
  const reason = cleaned(req.body && req.body.reason, 300) || 'Нарушение правил сообщества';
  let affected = 0;
  for (const id of ids) {
    const target = db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!target || target.role === 'owner') continue;
    if (action === 'ban') {
      db.run(
        'UPDATE users SET is_banned = 1, ban_reason = ?, ban_until = NULL, token_version = token_version + 1 WHERE id = ?',
        [reason, id]
      );
      sessionStore.revokeAllForUser(id);
    } else if (action === 'unban') {
      db.run('UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?', [id]);
    } else if (action === 'verify') {
      db.run('UPDATE users SET is_verified = 1 WHERE id = ?', [id]);
    } else if (action === 'unverify') {
      db.run('UPDATE users SET is_verified = 0 WHERE id = ?', [id]);
    } else {
      deleteUserPermanently(id);
    }
    affected += 1;
  }
  adminLog(req, `bulk_${action}`, 'users', { meta: { ids, affected, reason } });
  res.json({ ok: true, affected });
});

router.get('/', (req, res) => {
  const limit = [25, 50, 100].includes(Number(req.query.limit)) ? Number(req.query.limit) : 25;
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const filters = [];
  const params = [];

  const q = cleaned(req.query.q, 80);
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    filters.push(`(CAST(u.id AS TEXT) = ? OR ${db.textLower}(u.username) LIKE ? OR ${db.textLower}(u.email) LIKE ?
      OR ${db.textLower}(u.display_name) LIKE ? OR ${db.textLower}(uni.name) LIKE ? OR u.last_ip LIKE ?)`);
    params.push(q, like, like, like, like, like);
  }
  if (req.query.university_id) {
    filters.push('u.university_id = ?');
    params.push(toInt(req.query.university_id, 0));
  }
  if (req.query.course && COURSE_VALUES.includes(String(req.query.course))) {
    filters.push('u.course = ?');
    params.push(String(req.query.course));
  }
  if (['male', 'female', 'other'].includes(String(req.query.gender))) {
    filters.push('u.gender = ?');
    params.push(String(req.query.gender));
  }
  if (req.query.age_min) {
    filters.push(`${SQL_AGE} >= ?`);
    params.push(toInt(req.query.age_min, 18));
  }
  if (req.query.age_max) {
    filters.push(`${SQL_AGE} <= ?`);
    params.push(toInt(req.query.age_max, 99));
  }
  if (req.query.status === 'banned') filters.push('u.is_banned = 1');
  if (req.query.status === 'shadow') filters.push('u.shadow_banned = 1');
  if (req.query.status === 'active') filters.push('u.is_banned = 0');
  if (req.query.verified === '1') filters.push('u.is_verified = 1');
  if (req.query.verified === '0') filters.push('u.is_verified = 0');
  if (req.query.demo === '1') filters.push('u.is_demo = 1');
  if (req.query.demo === '0') filters.push('u.is_demo = 0');
  if (req.query.has_reports === '1') {
    filters.push("EXISTS (SELECT 1 FROM reports r WHERE r.reported_id = u.id AND r.status = 'new')");
  }
  if (req.query.registration_from) {
    filters.push('u.created_at >= ?');
    params.push(String(req.query.registration_from));
  }
  if (req.query.registration_to) {
    filters.push('u.created_at <= ?');
    params.push(`${String(req.query.registration_to)}T23:59:59.999Z`);
  }

  const sorts = {
    id: 'u.id DESC',
    id_asc: 'u.id ASC',
    username: 'u.username COLLATE NOCASE ASC',
    email: 'u.email COLLATE NOCASE ASC',
    name: 'u.display_name COLLATE NOCASE ASC',
    age: `${SQL_AGE} ASC`,
    university: 'uni.short_name COLLATE NOCASE ASC',
    course: 'u.course ASC',
    created_at: 'u.created_at DESC',
    last_seen: 'u.last_seen DESC',
    reports: 'reports_count DESC'
  };
  const order = sorts[String(req.query.sort)] || sorts.created_at;
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  let rows = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name,
       (SELECT COUNT(*) FROM reports r WHERE r.reported_id = u.id AND r.status = 'new') AS reports_count
     FROM users u ${UNIVERSITY_JOIN} ${where}
     ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (req.query.online === '1') rows = rows.filter((row) => presence.isOnline(row.id));

  const total = db.get(`SELECT COUNT(*) AS t FROM users u ${UNIVERSITY_JOIN} ${where}`, params).t;
  res.json({
    users: rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      display_name: row.display_name,
      avatar_path: row.avatar_path,
      age: ageFromBirthdate(row.birthdate),
      birthdate: row.birthdate,
      gender: row.gender,
      university_id: row.university_id,
      university: row.university_short_name ? { short_name: row.university_short_name, name: row.university_name } : null,
      course: row.course,
      district: row.district,
      role: row.role,
      is_banned: !!row.is_banned,
      ban_reason: row.ban_reason,
      ban_until: row.ban_until,
      shadow_banned: !!row.shadow_banned,
      is_verified: !!row.is_verified,
      is_demo: !!row.is_demo,
      online: presence.isOnline(row.id),
      last_ip: row.last_ip,
      last_login_at: row.last_login_at,
      login_count: row.login_count,
      created_at: row.created_at,
      reports_count: row.reports_count
    })),
    total,
    limit,
    offset
  });
});

/* ---------- User detail and profile editing ---------- */

router.get('/:id', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = baseUser(id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const photos = db.all('SELECT id, path, position FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC', [id]);
  const reports = db.all(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at,
       rep.username AS reporter_username, rep.display_name AS reporter_name
     FROM reports r JOIN users rep ON rep.id = r.reporter_id
     WHERE r.reported_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    [id]
  );
  const bans = db.all(
    `SELECT a.id, a.action, a.meta, a.created_at, a.ip
     FROM activity_log a WHERE a.target = ? AND a.action LIKE 'ban%' ORDER BY a.created_at DESC LIMIT 20`,
    [`user:${id}`]
  );
  res.json({
    user: {
      ...safeAdminUser(user),
      photos,
      online: presence.isOnline(id),
      reports_count: reports.filter((r) => r.status === 'new').length
    },
    counts: userCounts(id),
    cosmetics: cosmeticsStore.profileCosmetics(id, { self: true }),
    gifts: cosmeticsStore.giftInventory(id),
    telegram: db.getSetting('owner_telegram', ''),
    reports,
    bans
  });
});

router.put('/:id', (req, res) => {
  const id = toInt(req.params.id, 0);
  const before = baseUser(id);
  if (!before) return res.status(404).json({ error: 'Пользователь не найден' });
  const body = req.body || {};
  const updates = {};

  if (body.username !== undefined) {
    const username = validateUsername(body.username);
    if (!username) return res.status(400).json({ error: 'Некорректный username' });
    if (db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, id])) {
      return res.status(409).json({ error: 'Username занят' });
    }
    updates.username = username;
  }
  if (body.email !== undefined) {
    const email = validateEmail(body.email);
    if (!email) return res.status(400).json({ error: 'Некорректный email' });
    if (db.get('SELECT id FROM users WHERE email = ? AND id != ?', [email, id])) {
      return res.status(409).json({ error: 'Email занят' });
    }
    updates.email = email;
  }
  if (body.display_name !== undefined) {
    const name = cleaned(body.display_name, 40);
    if (name.length < 2) return res.status(400).json({ error: 'Имя слишком короткое' });
    updates.display_name = name;
  }
  if (body.birthdate !== undefined) {
    if (!isAdult(body.birthdate, 18)) {
      return res.status(400).json({ error: 'Пользователь должен быть старше 18 лет' });
    }
    updates.birthdate = String(body.birthdate);
  }
  if (body.gender !== undefined) updates.gender = oneOf(body.gender, GENDERS, before.gender);
  if (body.interested_in !== undefined) updates.interested_in = oneOf(body.interested_in, INTERESTED_IN, before.interested_in);
  if (body.looking_for !== undefined) updates.looking_for = oneOf(body.looking_for, LOOKING_FOR, before.looking_for);
  if (body.university_id !== undefined) {
    if (!body.university_id) updates.university_id = null;
    else {
      const university = db.get('SELECT id FROM universities WHERE id = ?', [toInt(body.university_id, 0)]);
      updates.university_id = university ? university.id : null;
    }
  }
  if (body.faculty !== undefined) updates.faculty = cleaned(body.faculty, 80) || null;
  if (body.course !== undefined) {
    updates.course = body.course && COURSE_VALUES.includes(String(body.course)) ? String(body.course) : null;
  }
  if (body.district !== undefined) {
    updates.district = DISTRICTS.find((d) => d.toLowerCase() === String(body.district || '').trim().toLowerCase()) || null;
  }
  if (body.bio !== undefined) updates.bio = cleaned(body.bio, Number(db.getSetting('max_bio', '500')) || 500);
  if (body.job !== undefined) updates.job = cleaned(body.job, 80);
  if (body.education !== undefined) updates.education = cleaned(body.education, 80);
  if (body.height !== undefined) {
    const height = body.height === '' || body.height === null ? null : toInt(body.height, 0);
    if (height !== null && (height < 100 || height > 250)) return res.status(400).json({ error: 'Некорректный рост' });
    updates.height = height;
  }
  if (body.interests !== undefined) {
    const interests = normalizeList(body.interests, INTEREST_IDS, 10);
    updates.interests = JSON.stringify(interests);
  }
  if (body.languages !== undefined) updates.languages = JSON.stringify(normalizeList(body.languages, LANGUAGES, 6));
  if (body.instagram_link !== undefined) {
    let link = cleaned(body.instagram_link, 200);
    if (link && !/^https?:\/\//i.test(link)) link = `https://instagram.com/${link.replace(/^@/, '')}`;
    updates.instagram_link = link;
  }
  if (body.theme !== undefined) updates.theme = oneOf(body.theme, ['light', 'dark', 'auto'], before.theme);
  if (body.owner_note !== undefined) updates.owner_note = cleaned(body.owner_note, 2000);
  if (body.super_likes_balance !== undefined) updates.super_likes_balance = clamp(toInt(body.super_likes_balance, 5), 0, 999);
  if (body.boost_until !== undefined) {
    updates.boost_until = body.boost_until ? String(body.boost_until) : null;
  }

  const boolFields = [
    'is_verified',
    'is_incognito',
    'hide_online',
    'hide_age',
    'hide_district',
    'hide_from_discovery',
    'read_receipts',
    'prefer_my_university'
  ];
  for (const field of boolFields) {
    if (body[field] !== undefined) updates[field] = body[field] ? 1 : 0;
  }
  updates.city = CITY;

  const fields = Object.keys(updates);
  if (!fields.length) return res.status(400).json({ error: 'Нет данных для обновления' });
  db.run(
    `UPDATE users SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...fields.map((field) => updates[field]), nowIso(), id]
  );
  const after = baseUser(id);
  adminLog(req, 'user_update', `user:${id}`, { before, after });
  res.json({ user: safeAdminUser(after) });
});

/* ---------- Photos ---------- */

router.post('/:id/photos', uploadLimiter, imageUpload('avatars'), (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!req.file) return res.status(400).json({ error: 'Выберите изображение' });
  const total = db.get('SELECT COUNT(*) AS t FROM photos WHERE user_id = ?', [id]).t;
  const maxPhotos = Number(db.getSetting('max_photos', '9')) || 9;
  if (total >= maxPhotos) {
    deleteUpload(`/uploads/avatars/${req.file.filename}`);
    return res.status(400).json({ error: `Максимум ${maxPhotos} фото` });
  }
  const photoPath = `/uploads/avatars/${req.file.filename}`;
  const now = nowIso();
  const result = db.run('INSERT INTO photos (user_id, path, position, created_at) VALUES (?, ?, ?, ?)', [
    id,
    photoPath,
    total,
    now
  ]);
  if (!user.avatar_path) db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [photoPath, id]);
  adminLog(req, 'user_photo_add', `user:${id}`, { meta: { photo: Number(result.lastInsertRowid) } });
  res.status(201).json({ ok: true, photo_id: Number(result.lastInsertRowid), path: photoPath });
});

router.delete('/:id/photos/:photoId', (req, res) => {
  const id = toInt(req.params.id, 0);
  const photo = db.get('SELECT * FROM photos WHERE id = ? AND user_id = ?', [toInt(req.params.photoId, 0), id]);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });
  db.run('DELETE FROM photos WHERE id = ?', [photo.id]);
  deleteUpload(photo.path);
  const remaining = db.all('SELECT * FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC', [id]);
  remaining.forEach((row, index) => db.run('UPDATE photos SET position = ? WHERE id = ?', [index, row.id]));
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (user.avatar_path === photo.path) {
    db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [remaining[0] ? remaining[0].path : null, id]);
  }
  adminLog(req, 'user_photo_delete', `user:${id}`, { before: { path: photo.path } });
  res.json({ ok: true });
});

router.put('/:id/photos/order', (req, res) => {
  const id = toInt(req.params.id, 0);
  const order = Array.isArray(req.body && req.body.order) ? req.body.order.map((photoId) => toInt(photoId, 0)) : [];
  const photos = db.all('SELECT * FROM photos WHERE user_id = ?', [id]);
  const owned = new Set(photos.map((photo) => photo.id));
  if (order.length !== photos.length || !order.every((photoId) => owned.has(photoId))) {
    return res.status(400).json({ error: 'Некорректный список фото' });
  }
  db.tx(() => {
    order.forEach((photoId, index) => db.run('UPDATE photos SET position = ? WHERE id = ?', [index, photoId]));
    const first = db.get('SELECT path FROM photos WHERE id = ?', [order[0]]);
    db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [first ? first.path : null, id]);
  });
  adminLog(req, 'user_photos_order', `user:${id}`, { meta: { order } });
  res.json({ ok: true });
});

router.put('/:id/photos/:photoId/avatar', (req, res) => {
  const id = toInt(req.params.id, 0);
  const photo = db.get('SELECT * FROM photos WHERE id = ? AND user_id = ?', [toInt(req.params.photoId, 0), id]);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });
  db.tx(() => {
    db.run('UPDATE photos SET position = position + 1 WHERE user_id = ?', [id]);
    db.run('UPDATE photos SET position = 0 WHERE id = ?', [photo.id]);
    db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [photo.path, id]);
  });
  adminLog(req, 'user_avatar_set', `user:${id}`);
  res.json({ ok: true });
});

/* ---------- Activity and moderation ---------- */

router.get('/:id/activity', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = baseUser(id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const person = (row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_path: row.avatar_path,
    university_short_name: row.university_short_name || null
  });
  const joined = `LEFT JOIN universities uni ON uni.id = u.university_id`;
  const likers = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, s.created_at AS at FROM swipes s
     JOIN users u ON u.id = s.from_id ${joined}
     WHERE s.to_id = ? AND s.action IN ('like','super') ORDER BY s.created_at DESC LIMIT 50`,
    [id]
  );
  const liked = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, s.created_at AS at FROM swipes s
     JOIN users u ON u.id = s.to_id ${joined}
     WHERE s.from_id = ? AND s.action IN ('like','super') ORDER BY s.created_at DESC LIMIT 50`,
    [id]
  );
  const matches = db.all(
    `SELECT m.id, m.created_at,
       CASE WHEN m.user_a = ? THEN ub.id ELSE ua.id END AS other_id,
       CASE WHEN m.user_a = ? THEN ub.username ELSE ua.username END AS other_username,
       CASE WHEN m.user_a = ? THEN ub.display_name ELSE ua.display_name END AS other_name
     FROM matches m
     JOIN users ua ON ua.id = m.user_a JOIN users ub ON ub.id = m.user_b
     WHERE (m.user_a = ? OR m.user_b = ?) AND m.is_active = 1
     ORDER BY m.created_at DESC LIMIT 50`,
    [id, id, id, id, id]
  );
  const viewers = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, MAX(pv.created_at) AS at
     FROM profile_views pv JOIN users u ON u.id = pv.viewer_id ${joined}
     WHERE pv.viewed_id = ? GROUP BY pv.viewer_id ORDER BY at DESC LIMIT 50`,
    [id]
  );
  res.json({
    counts: userCounts(id),
    likers: likers.map((row) => ({ user: person(row), at: row.at })),
    liked: liked.map((row) => ({ user: person(row), at: row.at })),
    matches,
    viewers: viewers.map((row) => ({ user: person(row), at: row.at }))
  });
});

router.get('/:id/chats', (req, res) => {
  const id = toInt(req.params.id, 0);
  const rows = db.all(
    `SELECT m.id, m.created_at, m.is_active,
       CASE WHEN m.user_a = ? THEN ub.id ELSE ua.id END AS other_id,
       CASE WHEN m.user_a = ? THEN ub.username ELSE ua.username END AS other_username,
       CASE WHEN m.user_a = ? THEN ub.display_name ELSE ua.display_name END AS other_name,
       (SELECT COUNT(*) FROM messages msg WHERE msg.match_id = m.id) AS messages_count,
       (SELECT created_at FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.id DESC LIMIT 1) AS last_at
     FROM matches m JOIN users ua ON ua.id = m.user_a JOIN users ub ON ub.id = m.user_b
     WHERE m.user_a = ? OR m.user_b = ?
     ORDER BY m.created_at DESC LIMIT 100`,
    [id, id, id, id, id]
  );
  res.json({ chats: rows });
});

// Opening someone else's conversation is a sensitive moderation action.
router.post('/:id/chats/:matchId/open', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const matchId = toInt(req.params.matchId, 0);
  const reason = cleaned(req.body && req.body.reason, 500);
  if (reason.length < 3) return res.status(400).json({ error: 'Укажите причину просмотра' });
  const match = db.get('SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)', [matchId, id, id]);
  if (!match) return res.status(404).json({ error: 'Диалог не найден' });
  const messages = db.all(
    `SELECT msg.*, u.username AS sender_username, u.display_name AS sender_name
     FROM messages msg JOIN users u ON u.id = msg.sender_id
     WHERE msg.match_id = ? ORDER BY msg.id ASC LIMIT 500`,
    [matchId]
  );
  adminLog(req, 'chat_view', `user:${id}`, {
    meta: { match_id: matchId, reason, messages: messages.length }
  });
  res.json({ match, messages, reason });
});

router.get('/:id/security', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = baseUser(id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const activeSessions = db.all(
    'SELECT id, ip, user_agent, created_at, last_active_at, sudo_until FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active_at DESC',
    [id]
  );
  const history = db.all(
    'SELECT id, identifier, success, ip, user_agent, created_at FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [id]
  );
  res.json({
    sessions: activeSessions.map((session) => ({
      ...session,
      device: sessionStore.deviceLabel(session.user_agent)
    })),
    history
  });
});

router.delete('/:id/sessions/:sessionId', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const sessionId = String(req.params.sessionId || '');
  const session = db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [sessionId, id]);
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  sessionStore.revokeSession(sessionId);
  adminLog(req, 'session_revoke', `user:${id}`, { meta: { session: sessionId } });
  res.json({ ok: true });
});

router.post('/:id/revoke-sessions', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  sessionStore.revokeAllForUser(id);
  db.run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id]);
  adminLog(req, 'revoke_all_sessions', `user:${id}`);
  res.json({ ok: true });
});

router.post('/:id/password', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const password = validatePassword(req.body && req.body.password);
  if (!password) return res.status(400).json({ error: 'Минимум 8 символов' });
  if (user.role === 'owner' && password.length < 10) {
    return res.status(400).json({ error: 'Пароль владельца — минимум 10 символов' });
  }
  const force = req.body && req.body.force_change ? 1 : 0;
  db.run(
    'UPDATE users SET password_hash = ?, force_password_change = ?, token_version = token_version + 1 WHERE id = ?',
    [bcrypt.hashSync(password, 10), force, id]
  );
  sessionStore.revokeAllForUser(id);
  adminLog(req, 'password_set', `user:${id}`, { meta: { force_change: !!force } });
  res.json({ ok: true, force_password_change: !!force });
});

// Generates a one-time temporary password. The plain value is returned only once.
router.post('/:id/temp-password', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.role === 'owner') return res.status(400).json({ error: 'Для владельца используйте обычную смену пароля' });
  const password = crypto.randomBytes(9).toString('base64url');
  db.run(
    'UPDATE users SET password_hash = ?, force_password_change = 1, token_version = token_version + 1 WHERE id = ?',
    [bcrypt.hashSync(password, 10), id]
  );
  sessionStore.revokeAllForUser(id);
  adminLog(req, 'password_temp', `user:${id}`);
  res.json({ ok: true, password, force_password_change: true });
});

router.put('/:id/ban', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.role === 'owner') return res.status(403).json({ error: 'Владельца нельзя заблокировать' });
  const reason = cleaned(req.body && req.body.reason, 300) || 'Нарушение правил сообщества';
  const days = [0, 1, 7, 30].includes(Number(req.body && req.body.days)) ? Number(req.body.days) : 0;
  const until = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() : null;
  db.run(
    'UPDATE users SET is_banned = 1, ban_reason = ?, ban_until = ?, token_version = token_version + 1 WHERE id = ?',
    [reason, until, id]
  );
  sessionStore.revokeAllForUser(id);
  adminLog(req, 'ban', `user:${id}`, { before: { is_banned: user.is_banned }, meta: { reason, days } });
  res.json({ ok: true });
});

router.put('/:id/unban', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  db.run('UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?', [id]);
  adminLog(req, 'unban', `user:${id}`, { before: { is_banned: user.is_banned } });
  res.json({ ok: true });
});

router.put('/:id/shadowban', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.role === 'owner') return res.status(403).json({ error: 'Владельца нельзя скрыть' });
  const value = req.body && req.body.value ? 1 : 0;
  db.run('UPDATE users SET shadow_banned = ? WHERE id = ?', [value, id]);
  adminLog(req, value ? 'shadow_ban' : 'shadow_unban', `user:${id}`);
  res.json({ ok: true, shadow_banned: !!value });
});

router.put('/:id/verify', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const value = req.body && req.body.value ? 1 : 0;
  db.run('UPDATE users SET is_verified = ?, updated_at = ? WHERE id = ?', [value, nowIso(), id]);
  adminLog(req, 'verify', `user:${id}`, { before: { is_verified: user.is_verified }, after: { is_verified: !!value } });
  res.json({ ok: true, is_verified: !!value });
});

router.put('/:id/note', (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const note = cleaned(req.body && req.body.note, 2000);
  db.run('UPDATE users SET owner_note = ? WHERE id = ?', [note, id]);
  adminLog(req, 'owner_note', `user:${id}`, { before: { note: user.owner_note }, after: { note } });
  res.json({ ok: true });
});

router.delete('/:id', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.role === 'owner') return res.status(403).json({ error: 'Владельца нельзя удалить' });
  if (String((req.body && req.body.confirm) || '') !== user.username) {
    return res.status(400).json({ error: 'Введите username для подтверждения' });
  }
  const files = deleteUserPermanently(id);
  adminLog(req, 'user_delete', `user:${id}`, { before: { username: user.username, email: user.email }, meta: { files } });
  res.json({ ok: true });
});

/* ---------- Impersonation ---------- */

router.post('/:id/impersonate', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const target = db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.role === 'owner') return res.status(403).json({ error: 'Нельзя войти как владелец' });
  if (target.is_banned) return res.status(400).json({ error: 'Пользователь заблокирован' });
  const readOnly = !(req.body && req.body.full_access);
  const sessionId = sessionStore.createSession(target.id, req, {
    impersonatorId: req.user.id,
    parentSessionId: req.session.id,
    readOnly
  });
  const token = signToken(target.id, sessionId, target.token_version || 0);
  setAuthCookie(res, token, req);
  adminLog(req, 'impersonate', `user:${target.id}`, { meta: { read_only: readOnly } });
  // The token keeps impersonation working when third-party cookies are blocked.
  res.json({ ok: true, user: meView(target), read_only: readOnly, token });
});

module.exports = router;
