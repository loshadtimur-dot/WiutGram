'use strict';

const db = require('../db');
const { notify } = require('./notify');

// Owner accounts get extra login protection: failed attempts are counted
// per account and per IP, with a temporary lock and a passive delay.

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function windowStartIso() {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
}

function recentFailures(userId) {
  return db.get(
    `SELECT COUNT(*) AS total FROM login_history
     WHERE success = 0 AND created_at >= ?
       AND (user_id = ? OR user_id IS NULL AND identifier = (SELECT lower(email) FROM users WHERE id = ?))`,
    [windowStartIso(), userId, userId]
  ).total;
}

function lastFailure(userId) {
  return db.get(
    `SELECT created_at, ip FROM login_history
     WHERE success = 0 AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
}

// Returns the lock state for an owner account.
function lockStatus(userId) {
  const failures = recentFailures(userId);
  if (failures < MAX_ATTEMPTS) {
    return { locked: false, failures, max_attempts: MAX_ATTEMPTS, remaining: MAX_ATTEMPTS - failures };
  }
  const last = lastFailure(userId);
  const lastAt = last ? Date.parse(last.created_at) : 0;
  const unlockAt = lastAt + LOCK_MINUTES * 60 * 1000;
  const remainingMs = unlockAt - Date.now();
  if (remainingMs <= 0) {
    return { locked: false, failures, max_attempts: MAX_ATTEMPTS, remaining: MAX_ATTEMPTS };
  }
  return {
    locked: true,
    failures,
    max_attempts: MAX_ATTEMPTS,
    retry_after_minutes: Math.max(1, Math.ceil(remainingMs / 60000))
  };
}

// Small progressively growing delay before responding to a failed attempt.
async function progressiveDelay(failures) {
  const delay = Math.min(2500, Math.max(0, failures - 1) * 400);
  if (delay <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// Alerts the owner when repeated failures target the account (once per hour).
function alertFailures(user) {
  if (!user || user.role !== 'owner') return;
  const failures = recentFailures(user.id);
  if (failures < 3) return;
  const recentAlert = db.get(
    `SELECT id FROM notifications
     WHERE user_id = ? AND type = 'security' AND created_at > ?
     LIMIT 1`,
    [user.id, new Date(Date.now() - 60 * 60 * 1000).toISOString()]
  );
  if (recentAlert) return;
  const ips = db.all(
    `SELECT ip, MAX(created_at) AS at, COUNT(*) AS total FROM login_history
     WHERE success = 0 AND user_id = ? AND created_at > ?
     GROUP BY ip ORDER BY at DESC LIMIT 5`,
    [user.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]
  );
  const summary = ips.map((row) => `${row.ip || 'неизвестный IP'} (${row.total})`).join(', ');
  notify({
    userId: user.id,
    type: 'security',
    text: `Неудачные попытки входа в ваш аккаунт: ${failures} за 15 минут. ${summary}`
  });
}

module.exports = {
  WINDOW_MINUTES,
  MAX_ATTEMPTS,
  LOCK_MINUTES,
  recentFailures,
  lockStatus,
  progressiveDelay,
  alertFailures
};
