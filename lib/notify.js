'use strict';

const db = require('../db');
const { nowIso } = require('../utils/time');
const { emitToUser } = require('./io');

const ACTOR_FIELDS = 'id, username, display_name, avatar_path, is_verified, role';

// Creates a notification row and pushes it over socket.io in real time.
function notify(payload) {
  const { userId, type, actorId = null, refId = null, text = '' } = payload || {};
  if (!userId) return null;
  const recipient = Number(userId);
  if (actorId && Number(actorId) === recipient) return null;

  const createdAt = nowIso();
  const result = db.run(
    `INSERT INTO notifications (user_id, type, actor_id, ref_id, text, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [recipient, type, actorId ? Number(actorId) : null, refId, text, createdAt]
  );

  const actor = actorId
    ? db.get(`SELECT ${ACTOR_FIELDS} FROM users WHERE id = ?`, [Number(actorId)])
    : null;

  const notification = {
    id: Number(result.lastInsertRowid),
    user_id: recipient,
    type,
    actor_id: actorId ? Number(actorId) : null,
    ref_id: refId,
    text,
    is_read: 0,
    created_at: createdAt,
    actor
  };

  emitToUser(recipient, 'notification:new', notification);
  const unread = db.get(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [recipient]
  );
  emitToUser(recipient, 'notification:count', { unread: unread ? unread.total : 0 });
  return notification;
}

// Avoids spamming the same notification type from the same actor in 24 hours.
function notifyDaily(payload) {
  const { userId, type, actorId } = payload || {};
  const existing = db.get(
    `SELECT id FROM notifications
     WHERE user_id = ? AND type = ? AND actor_id = ? AND created_at > ?
     LIMIT 1`,
    [userId, type, actorId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]
  );
  if (existing) return null;
  return notify(payload);
}

function logActivity(actorId, action, target = null, meta = null) {
  db.run(
    'INSERT INTO activity_log (actor_id, action, target, meta, created_at) VALUES (?, ?, ?, ?, ?)',
    [actorId || null, action, target, meta ? JSON.stringify(meta) : null, nowIso()]
  );
}

module.exports = { notify, notifyDaily, logActivity, ACTOR_FIELDS };
