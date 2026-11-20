'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const sessions = require('../sessions');
const { nowIso } = require('../../utils/time');
const { adminLog } = require('../activity');

// Temporary passwords exist only in the HTTP response that creates them; the
// database keeps the bcrypt hash and a "must change password" flag.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const STATUSES = ['new', 'in_progress', 'granted', 'declined'];

function randomPassword(length = 12) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)];
  }
  return value;
}

function findUser(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return null;
  return db.get('SELECT id, username, email, display_name, role FROM users WHERE username = ? OR email = ?', [
    value,
    value
  ]);
}

function requestCount({ ip, userId }) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const byIp = db.get('SELECT COUNT(*) AS total FROM access_requests WHERE ip = ? AND created_at >= ?', [ip, since]);
  const byUser = userId
    ? db.get(
        'SELECT COUNT(*) AS total FROM access_requests WHERE user_id = ? AND created_at >= ?',
        [userId, since]
      )
    : { total: 0 };
  return Math.max(Number(byIp.total) || 0, Number(byUser.total) || 0);
}

// Always reports success so the form cannot be used to discover accounts.
function createRequest({ identifier, contact, comment, ip }) {
  const user = findUser(identifier);
  const count = requestCount({ ip, userId: user ? user.id : null });
  if (count >= 3) {
    return { ok: true, throttled: true };
  }
  const now = nowIso();
  db.run(
    `INSERT INTO access_requests
     (user_id, identifier, contact, comment, status, ip, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'new', ?, ?, ?)`,
    [
      user ? user.id : null,
      String(identifier || '').trim().slice(0, 120),
      String(contact || '').trim().slice(0, 120),
      String(comment || '').trim().slice(0, 500),
      ip,
      now,
      now
    ]
  );
  return { ok: true, throttled: false };
}

function listRequests({ status = null, limit = 50 } = {}) {
  const filters = [];
  const params = [];
  if (status && STATUSES.includes(status)) {
    filters.push('r.status = ?');
    params.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT r.*, u.username, u.display_name, u.avatar_path, u.role, u.is_banned,
       h.username AS handled_username
     FROM access_requests r
     LEFT JOIN users u ON u.id = r.user_id
     LEFT JOIN users h ON h.id = r.handled_by
     ${where}
     ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, r.created_at DESC
     LIMIT ?`,
    [...params, Math.min(200, Math.max(1, Number(limit) || 50))]
  );
  return rows;
}

function newRequestCount() {
  const row = db.get("SELECT COUNT(*) AS total FROM access_requests WHERE status IN ('new','in_progress')");
  return Number(row.total) || 0;
}

function setRequestStatus(req, requestId, status) {
  if (!STATUSES.includes(status)) return { error: 'Некорректный статус', status: 400 };
  const request = db.get('SELECT * FROM access_requests WHERE id = ?', [requestId]);
  if (!request) return { error: 'Запрос не найден', status: 404 };
  db.run('UPDATE access_requests SET status = ?, handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ?', [
    status,
    req.user.id,
    nowIso(),
    nowIso(),
    request.id
  ]);
  adminLog(req, 'access_request_status', `access_request:${request.id}`, { meta: { status } });
  return { ok: true };
}

// Owner-visible recovery card: identifiers, devices, sessions and logins.
function recoveryCard(userId) {
  const user = db.get(
    `SELECT id, username, email, display_name, role, is_banned, force_password_change,
       created_at, last_login_at, last_ip, login_count
     FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) return null;
  const activeSessions = db.all(
    `SELECT id, ip, user_agent, created_at, last_active_at FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active_at DESC`,
    [userId]
  );
  const logins = db.all(
    `SELECT identifier, success, ip, user_agent, created_at FROM login_history
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  const requests = db.all(
    'SELECT id, status, contact, comment, created_at FROM access_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
    [userId]
  );
  return {
    user,
    sessions: activeSessions.map((session) => ({
      ...session,
      device: sessions.deviceLabel(session.user_agent)
    })),
    logins: logins.map((entry) => ({ ...entry, device: sessions.deviceLabel(entry.user_agent) })),
    requests
  };
}

function issueTempPassword(req, userId) {
  const user = db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
  if (!user) return { error: 'Пользователь не найден', status: 404 };
  if (user.role === 'owner' && user.id !== req.user.id) {
    return { error: 'Нельзя менять пароль владельцу', status: 403 };
  }
  const password = randomPassword(12);
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    `UPDATE users SET password_hash = ?, force_password_change = 1,
      token_version = token_version + 1, updated_at = ? WHERE id = ?`,
    [hash, nowIso(), user.id]
  );
  sessions.revokeAllForUser(user.id);
  db.run(
    `UPDATE access_requests SET status = 'granted', handled_by = ?, handled_at = ?, updated_at = ?
     WHERE user_id = ? AND status IN ('new','in_progress')`,
    [req.user.id, nowIso(), nowIso(), user.id]
  );
  adminLog(req, 'temp_password_issued', `user:${user.id}`);
  return { ok: true, password, username: user.username };
}

function setPassword(req, userId, password) {
  const user = db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
  if (!user) return { error: 'Пользователь не найден', status: 404 };
  if (user.role === 'owner' && user.id !== req.user.id) {
    return { error: 'Нельзя менять пароль владельцу', status: 403 };
  }
  if (!password || password.length < 8 || password.length > 72) {
    return { error: 'Пароль должен быть от 8 до 72 символов', status: 400 };
  }
  db.run(
    `UPDATE users SET password_hash = ?, force_password_change = 1,
      token_version = token_version + 1, updated_at = ? WHERE id = ?`,
    [bcrypt.hashSync(password, 10), nowIso(), user.id]
  );
  sessions.revokeAllForUser(user.id);
  adminLog(req, 'password_set_manually', `user:${user.id}`);
  return { ok: true };
}

function endSessions(req, userId) {
  const user = db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return { error: 'Пользователь не найден', status: 404 };
  sessions.revokeAllForUser(user.id);
  db.run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [user.id]);
  adminLog(req, 'sessions_revoked', `user:${user.id}`);
  return { ok: true };
}

module.exports = {
  STATUSES,
  randomPassword,
  createRequest,
  listRequests,
  newRequestCount,
  setRequestStatus,
  recoveryCard,
  issueTempPassword,
  setPassword,
  endSessions,
  findUser
};
