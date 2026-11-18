'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cardView, photosFor } = require('../lib/userView');
const { matchForUser, otherId } = require('../lib/matches');
const { isBlockedBetween, hasBlocked } = require('../lib/blocks');
const { emitToUser } = require('../lib/io');
const { toInt } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

function lastMessage(matchId) {
  return db.get('SELECT * FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1', [matchId]);
}

router.get('/', (req, res) => {
  const rows = db.all(
    `SELECT * FROM matches
     WHERE is_active = 1 AND (user_a = ? OR user_b = ?)
     ORDER BY created_at DESC`,
    [req.user.id, req.user.id]
  );

  const matches = [];
  for (const match of rows) {
    const other = db.get('SELECT * FROM users WHERE id = ?', [otherId(match, req.user.id)]);
    if (!other || other.is_banned) continue;
    if (isBlockedBetween(req.user.id, other.id)) continue;

    const last = lastMessage(match.id);
    const unread = db.get(
      'SELECT COUNT(*) AS total FROM messages WHERE match_id = ? AND sender_id != ? AND read_at IS NULL',
      [match.id, req.user.id]
    );
    const started = db.get(
      "SELECT COUNT(*) AS total FROM messages WHERE match_id = ? AND type != 'system'",
      [match.id]
    );

    const photos = photosFor([other.id]).map((p) => ({ id: p.id, path: p.path, position: p.position }));

    matches.push({
      id: match.id,
      created_at: match.created_at,
      user: cardView(other, req.user, photos),
      last_message: last
        ? {
            id: last.id,
            type: last.type,
            body: last.deleted_by_sender ? '' : last.body,
            image_path: last.deleted_by_sender ? null : last.image_path,
            sender_id: last.sender_id,
            created_at: last.created_at,
            deleted: !!last.deleted_by_sender
          }
        : null,
      last_activity: last ? last.created_at : match.created_at,
      unread: unread ? unread.total : 0,
      started: started ? started.total > 0 : false
    });
  }

  matches.sort((a, b) => (a.last_activity < b.last_activity ? 1 : -1));

  res.json({
    matches,
    new_matches: matches.filter((m) => !m.started),
    total_unread: matches.reduce((sum, m) => sum + m.unread, 0)
  });
});

router.delete('/:id', (req, res) => {
  const info = matchForUser(toInt(req.params.id, 0), req.user.id);
  if (!info) return res.status(404).json({ error: 'Матч не найден' });

  db.tx(() => {
    db.run('DELETE FROM messages WHERE match_id = ?', [info.match.id]);
    db.run('UPDATE matches SET is_active = 0 WHERE id = ?', [info.match.id]);
    db.run('DELETE FROM swipes WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [
      req.user.id,
      info.other.id,
      info.other.id,
      req.user.id
    ]);
  });

  emitToUser(info.other.id, 'match:removed', { match_id: info.match.id });
  emitToUser(req.user.id, 'match:removed', { match_id: info.match.id });
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const info = matchForUser(toInt(req.params.id, 0), req.user.id);
  if (!info) return res.status(404).json({ error: 'Матч не найден' });
  if (!info.match.is_active) return res.status(404).json({ error: 'Матч больше не активен' });
  const blocked = hasBlocked(req.user.id, info.other.id) || hasBlocked(info.other.id, req.user.id);
  if (blocked) return res.status(403).json({ error: 'Диалог недоступен' });

  const photos = photosFor([info.other.id]).map((p) => ({ id: p.id, path: p.path, position: p.position }));
  res.json({
    match: {
      id: info.match.id,
      created_at: info.match.created_at,
      user: cardView(info.other, req.user, photos)
    }
  });
});

module.exports = router;
