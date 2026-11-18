'use strict';

const crypto = require('crypto');
const db = require('../db');
const { nowIso } = require('../utils/time');

const SUDO_MINUTES = 10;

function clientIp(req) {
  if (!req) return null;
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  const raw = forwarded ? String(forwarded).split(',')[0].trim() : req.ip || req.socket?.remoteAddress;
  return raw ? String(raw).slice(0, 64) : null;
}

function userAgent(req) {
  if (!req || !req.headers) return null;
  return String(req.headers['user-agent'] || '').slice(0, 300) || null;
}

function createSession(userId, req, options = {}) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = nowIso();
  db.run(
    `INSERT INTO sessions
     (id, user_id, ip, user_agent, created_at, last_active_at, revoked_at, sudo_until,
      impersonator_id, parent_session_id, read_only)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    [
      id,
      userId,
      clientIp(req),
      userAgent(req),
      now,
      now,
      options.impersonatorId || null,
      options.parentSessionId || null,
      options.readOnly ? 1 : 0
    ]
  );
  return id;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  return db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
}

function touchSession(sessionId) {
  db.run('UPDATE sessions SET last_active_at = ? WHERE id = ? AND revoked_at IS NULL', [
    nowIso(),
    sessionId
  ]);
}

function revokeSession(sessionId) {
  db.run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [
    nowIso(),
    sessionId
  ]);
}

function revokeAllForUser(userId) {
  db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [
    nowIso(),
    userId
  ]);
}

function grantSudo(sessionId) {
  const until = new Date(Date.now() + SUDO_MINUTES * 60 * 1000).toISOString();
  db.run('UPDATE sessions SET sudo_until = ? WHERE id = ?', [until, sessionId]);
  return until;
}

function hasSudo(session) {
  if (!session || !session.sudo_until) return false;
  return session.sudo_until > nowIso();
}

function recordLogin({ userId, identifier, success, req }) {
  db.run(
    `INSERT INTO login_history (user_id, identifier, success, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId || null, String(identifier || '').slice(0, 120), success ? 1 : 0, clientIp(req), userAgent(req), nowIso()]
  );
}

function deviceLabel(userAgentString) {
  const ua = String(userAgentString || '');
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Браузер';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Устройство';
  return `${browser} · ${os}`;
}

module.exports = {
  SUDO_MINUTES,
  clientIp,
  userAgent,
  createSession,
  getSession,
  touchSession,
  revokeSession,
  revokeAllForUser,
  grantSudo,
  hasSudo,
  recordLogin,
  deviceLabel
};
