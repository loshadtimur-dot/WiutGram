'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const sessions = require('../lib/sessions');
const { adminLog } = require('../lib/activity');
const {
  requireAuth,
  signToken,
  setAuthCookie,
  clearAuthCookie
} = require('../middleware/auth');

const router = express.Router();

// Leaves the impersonation session and returns to the owner account.
router.post('/stop', requireAuth, (req, res) => {
  if (!req.impersonation) return res.status(400).json({ error: 'Вы не в режиме просмотра' });
  const session = req.session;
  const ownerId = session.impersonator_id;
  const parent = session.parent_session_id ? sessions.getSession(session.parent_session_id) : null;
  sessions.revokeSession(session.id);

  const owner = ownerId ? db.get('SELECT * FROM users WHERE id = ?', [ownerId]) : null;
  if (!owner || owner.role !== 'owner' || !parent || parent.revoked_at || parent.user_id !== owner.id) {
    clearAuthCookie(res, req);
    return res.json({ ok: true, logged_out: true });
  }

  const token = signToken(owner.id, parent.id, owner.token_version);
  setAuthCookie(res, token, req);
  sessions.touchSession(parent.id);
  adminLog({ user: owner, ip: req.ip }, 'impersonate_stop', `user:${req.user.id}`);
  return res.json({ ok: true, user: owner.username, token });
});

// The owner can switch the current impersonation session to full access.
router.post('/enable-write', requireAuth, (req, res) => {
  if (!req.impersonation) return res.status(400).json({ error: 'Вы не в режиме просмотра' });
  const owner = db.get('SELECT * FROM users WHERE id = ?', [req.impersonation.ownerId]);
  if (!owner || owner.role !== 'owner') return res.status(403).json({ error: 'Недостаточно прав' });
  const password = String((req.body && req.body.password) || '');
  if (!password || !bcrypt.compareSync(password, owner.password_hash)) {
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  db.run('UPDATE sessions SET read_only = 0 WHERE id = ?', [req.session.id]);
  adminLog({ user: owner, ip: req.ip }, 'impersonate_write', `user:${req.user.id}`);
  res.json({ ok: true });
});

module.exports = router;
