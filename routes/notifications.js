'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { pagination, toInt } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

const ACTOR_FIELDS = 'u.id AS actor_id, u.username AS actor_username, u.display_name AS actor_name, u.avatar_path AS actor_avatar';

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    ref_id: row.ref_id,
    text: row.text,
    is_read: !!row.is_read,
    created_at: row.created_at,
    actor: row.actor_username
      ? {
          id: row.actor_id,
          username: row.actor_username,
          display_name: row.actor_name,
          avatar_path: row.actor_avatar
        }
      : null
  };
}

router.get('/', (req, res) => {
  const { limit, offset } = pagination(req.query, 30, 100);
  const rows = db.all(
    `SELECT n.*, ${ACTOR_FIELDS} FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset]
  );
  const total = db.get('SELECT COUNT(*) AS t FROM notifications WHERE user_id = ?', [req.user.id]).t;
  const unread = db.get(
    'SELECT COUNT(*) AS t FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  ).t;
  res.json({ notifications: rows.map(mapNotification), total, unread, has_more: offset + rows.length < total });
});

router.get('/unread-count', (req, res) => {
  const row = db.get('SELECT COUNT(*) AS t FROM notifications WHERE user_id = ? AND is_read = 0', [
    req.user.id
  ]);
  res.json({ unread: row ? row.t : 0 });
});

router.post('/read-all', (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true });
});

router.post('/:id/read', (req, res) => {
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
    toInt(req.params.id, 0),
    req.user.id
  ]);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [
    toInt(req.params.id, 0),
    req.user.id
  ]);
  res.json({ ok: true });
});

module.exports = router;
