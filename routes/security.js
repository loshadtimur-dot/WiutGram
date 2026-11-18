'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../db');
const totp = require('../lib/totp');
const sessions = require('../lib/sessions');
const ownerSecurity = require('../lib/ownerSecurity');
const { adminLog } = require('../lib/activity');
const { requireOwner, noStore } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimit');
const { nowIso } = require('../utils/time');

const router = express.Router();
// Every route here is owner-only; everyone else sees 404 like the rest of /admin.
router.use(requireOwner, noStore, adminLimiter);

function parseBackupCodes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function activeSessions(userId, currentSessionId) {
  const rows = db.all(
    `SELECT id, ip, user_agent, created_at, last_active_at, sudo_until
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL
     ORDER BY last_active_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id.slice(0, 8),
    session_ref: row.id,
    device: sessions.deviceLabel(row.user_agent),
    ip: row.ip,
    created_at: row.created_at,
    last_active_at: row.last_active_at,
    current: row.id === currentSessionId
  }));
}

router.get('/overview', (req, res) => {
  const user = req.user;
  const logins = db.all(
    `SELECT success, ip, user_agent, created_at FROM login_history
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`,
    [user.id]
  );
  const failures = db.all(
    `SELECT ip, user_agent, created_at FROM login_history
     WHERE success = 0 AND (user_id = ? OR identifier = ?) ORDER BY created_at DESC LIMIT 25`,
    [user.id, String(user.email).toLowerCase()]
  );
  res.json({
    two_factor: {
      enabled: !!user.totp_enabled,
      enabled_at: user.totp_enabled_at,
      backup_codes_left: parseBackupCodes(user.totp_backup_codes).length
    },
    lock: ownerSecurity.lockStatus(user.id),
    sessions: activeSessions(user.id, req.session ? req.session.id : null),
    logins: logins.map((row) => ({
      success: !!row.success,
      ip: row.ip,
      device: sessions.deviceLabel(row.user_agent),
      created_at: row.created_at
    })),
    failures: failures.map((row) => ({
      ip: row.ip,
      device: sessions.deviceLabel(row.user_agent),
      created_at: row.created_at
    })),
    limits: {
      window_minutes: ownerSecurity.WINDOW_MINUTES,
      max_attempts: ownerSecurity.MAX_ATTEMPTS,
      lock_minutes: ownerSecurity.LOCK_MINUTES
    }
  });
});

/* ---------- Sessions ---------- */

router.post('/sessions/revoke-others', (req, res) => {
  const currentId = req.session ? req.session.id : null;
  db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?', [
    nowIso(),
    req.user.id,
    currentId || ''
  ]);
  adminLog(req, 'owner_sessions_revoke_others', `user:${req.user.id}`);
  res.json({ ok: true });
});

router.post('/sessions/:id/revoke', (req, res) => {
  const ref = String(req.params.id || '');
  const row = db.get('SELECT id, user_id FROM sessions WHERE id = ? AND revoked_at IS NULL', [ref]);
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'Сессия не найдена' });
  if (req.session && req.session.id === row.id) {
    return res.status(400).json({ error: 'Это текущая сессия. Используйте выход.' });
  }
  sessions.revokeSession(row.id);
  adminLog(req, 'owner_session_revoke', `session:${row.id.slice(0, 8)}`);
  res.json({ ok: true });
});

/* ---------- Two-factor authentication ---------- */

router.post('/2fa/setup', async (req, res) => {
  if (req.user.totp_enabled) {
    return res.status(400).json({ error: 'Двухфакторная аутентификация уже включена' });
  }
  const secret = totp.generateSecret();
  db.run('UPDATE users SET totp_pending_secret = ?, updated_at = ? WHERE id = ?', [
    totp.encryptSecret(secret),
    nowIso(),
    req.user.id
  ]);
  const url = totp.otpauthUrl({ secret, account: req.user.email, issuer: 'UNI Lovers' });
  let qr = '';
  try {
    qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#1d1e22', light: '#ffffff' } });
  } catch (err) {
    qr = '';
  }
  adminLog(req, 'owner_2fa_setup_started', `user:${req.user.id}`);
  res.json({ secret, otpauth: url, qr });
});

router.post('/2fa/enable', (req, res) => {
  const code = String((req.body && req.body.code) || '');
  const pending = totp.decryptSecret(req.user.totp_pending_secret);
  if (!pending) return res.status(400).json({ error: 'Сначала начните настройку заново' });
  if (!totp.verifyTotp(pending, code)) {
    return res.status(400).json({ error: 'Код неверен. Проверьте время на устройстве.' });
  }
  const backupCodes = totp.generateBackupCodes(10);
  db.run(
    `UPDATE users SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 1,
       totp_enabled_at = ?, totp_backup_codes = ?, updated_at = ? WHERE id = ?`,
    [
      totp.encryptSecret(pending),
      nowIso(),
      JSON.stringify(totp.hashBackupCodes(backupCodes)),
      nowIso(),
      req.user.id
    ]
  );
  adminLog(req, 'owner_2fa_enabled', `user:${req.user.id}`);
  res.json({ ok: true, backup_codes: backupCodes });
});

// Accepts either a TOTP code or a one-time backup code.
router.post('/2fa/disable', (req, res) => {
  const body = req.body || {};
  const password = String(body.password || '');
  const code = String(body.code || '');
  if (!password || !bcrypt.compareSync(password, req.user.password_hash)) {
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  if (!req.user.totp_enabled) return res.status(400).json({ error: '2FA не включена' });
  const secret = totp.decryptSecret(req.user.totp_secret);
  const stored = parseBackupCodes(req.user.totp_backup_codes);
  const backupLeft = totp.consumeBackupCode(stored, code);
  const validTotp = totp.verifyTotp(secret, code);
  if (!validTotp && backupLeft === null) {
    return res.status(400).json({ error: 'Код или резервный код неверен' });
  }
  db.run(
    `UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_pending_secret = NULL,
       totp_enabled_at = NULL, totp_backup_codes = NULL, updated_at = ? WHERE id = ?`,
    [nowIso(), req.user.id]
  );
  adminLog(req, 'owner_2fa_disabled', `user:${req.user.id}`);
  res.json({ ok: true });
});

router.post('/2fa/backup-codes', (req, res) => {
  const password = String((req.body && req.body.password) || '');
  if (!password || !bcrypt.compareSync(password, req.user.password_hash)) {
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  if (!req.user.totp_enabled) return res.status(400).json({ error: '2FA не включена' });
  const codes = totp.generateBackupCodes(10);
  db.run('UPDATE users SET totp_backup_codes = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(totp.hashBackupCodes(codes)),
    nowIso(),
    req.user.id
  ]);
  adminLog(req, 'owner_2fa_backup_codes', `user:${req.user.id}`);
  res.json({ ok: true, backup_codes: codes });
});

module.exports = router;
