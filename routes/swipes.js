'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { swipeLimiter } = require('../middleware/rateLimit');
const { cardsFor, photosFor, groupPhotos, cardView } = require('../lib/userView');
const { ensureMatch, matchDateLabel } = require('../lib/matches');
const { isBlockedBetween } = require('../lib/blocks');
const { ensureSuperLikes, consumeSuperLike, SUPER_LIKES_PER_DAY } = require('../lib/limits');
const { notify } = require('../lib/notify');
const { emitToUser } = require('../lib/io');
const { toInt, oneOf, clamp, cleaned } = require('../middleware/validate');
const { nowIso } = require('../utils/time');

const router = express.Router();
router.use(requireAuth);

const ACTIONS = ['like', 'nope', 'super'];

router.post('/', swipeLimiter, (req, res) => {
  const me = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const toId = toInt(req.body?.to_id, 0);
  const action = oneOf(req.body?.action, ACTIONS, null);
  if (!action) return res.status(400).json({ error: 'Некорректное действие' });
  if (!toId || toId === me.id) return res.status(400).json({ error: 'Некорректный пользователь' });

  const target = db.get('SELECT * FROM users WHERE id = ?', [toId]);
  if (!target || target.is_banned) return res.status(404).json({ error: 'Профиль недоступен' });
  if (isBlockedBetween(me.id, target.id)) {
    return res.status(403).json({ error: 'Действие недоступно' });
  }

  const existing = db.get('SELECT * FROM swipes WHERE from_id = ? AND to_id = ?', [
    me.id,
    target.id
  ]);
  if (existing) {
    return res.status(409).json({ error: 'Вы уже отреагировали на этот профиль', action: existing.action });
  }

  let superLikesLeft = ensureSuperLikes(me);
  if (action === 'super') {
    const spent = consumeSuperLike(me);
    if (!spent.ok) {
      return res.status(400).json({
        error: 'Суперлайки закончились. Новые появятся завтра или купите пакет в профиле.',
        code: 'no_super_likes',
        super_likes_left: 0
      });
    }
    superLikesLeft = spent.left;
  }

  const createdAt = nowIso();
  db.run('INSERT INTO swipes (from_id, to_id, action, created_at) VALUES (?, ?, ?, ?)', [
    me.id,
    target.id,
    action,
    createdAt
  ]);

  let matchPayload = null;

  if (action === 'like' || action === 'super') {
    const reciprocal = db.get('SELECT action FROM swipes WHERE from_id = ? AND to_id = ?', [
      target.id,
      me.id
    ]);

    if (reciprocal && (reciprocal.action === 'like' || reciprocal.action === 'super')) {
      const { match, created } = ensureMatch(me.id, target.id);
      if (created) {
        db.run(
          `INSERT INTO messages (match_id, sender_id, type, body, created_at)
           VALUES (?, ?, 'system', ?, ?)`,
          [
            match.id,
            me.id,
            `Вы лайкнули друг друга ${matchDateLabel(match.created_at)}`,
            match.created_at
          ]
        );
      }
      const myCard = cardView(me, target, photosFor([me.id]).map((p) => ({
        id: p.id,
        path: p.path,
        position: p.position
      })));
      const theirCard = cardView(target, me, photosFor([target.id]).map((p) => ({
        id: p.id,
        path: p.path,
        position: p.position
      })));
      matchPayload = {
        id: match.id,
        created_at: match.created_at,
        user: theirCard,
        me: myCard
      };

      notify({
        userId: target.id,
        type: 'match',
        actorId: me.id,
        refId: match.id,
        text: 'Это взаимно! У вас новый матч'
      });
      notify({
        userId: me.id,
        type: 'match',
        actorId: target.id,
        refId: match.id,
        text: 'Это взаимно! У вас новый матч'
      });
      emitToUser(target.id, 'match:new', { match: matchPayload });
      emitToUser(me.id, 'match:new', { match: matchPayload });
    } else {
      notify({
        userId: target.id,
        type: action === 'super' ? 'super_like' : 'like',
        actorId: me.id,
        refId: me.id,
        text:
          action === 'super'
            ? 'Кто-то отправил вам суперлайк ⭐'
            : 'Кому-то вы понравились ❤️'
      });
    }
    const likesCount = db.get(
      `SELECT COUNT(*) AS total FROM swipes s
       WHERE s.to_id = ? AND s.action IN ('like', 'super')
         AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.from_id = ? AND mine.to_id = s.from_id)`,
      [target.id, target.id]
    );
    emitToUser(target.id, 'likes:count', { likes: likesCount ? likesCount.total : 0 });
  }

  return res.json({
    ok: true,
    action,
    is_match: !!matchPayload,
    match: matchPayload,
    super_likes_left: superLikesLeft,
    super_likes_max: SUPER_LIKES_PER_DAY
  });
});

router.post('/rewind', (req, res) => {
  const last = db.get('SELECT * FROM swipes WHERE from_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [
    req.user.id
  ]);
  if (!last) return res.status(400).json({ error: 'Нечего возвращать' });

  const match = db.get(
    `SELECT * FROM matches WHERE is_active = 1
     AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))`,
    [req.user.id, last.to_id, last.to_id, req.user.id]
  );
  if (match) {
    return res.status(400).json({ error: 'Нельзя вернуть свайп, который создал матч' });
  }

  const target = db.get('SELECT * FROM users WHERE id = ?', [last.to_id]);
  db.run('DELETE FROM swipes WHERE id = ?', [last.id]);
  db.run('DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type IN (?, ?)', [
    last.to_id,
    req.user.id,
    'like',
    'super_like'
  ]);

  const photos = target
    ? photosFor([target.id]).map((p) => ({ id: p.id, path: p.path, position: p.position }))
    : [];

  res.json({
    ok: true,
    card: target ? cardView(target, req.user, photos) : null
  });
});

// People who liked me and are not yet swiped by me.
router.get('/likes-me', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 24), 1, 100);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const rows = db.all(
    `SELECT u.*, s.action AS swipe_action, s.created_at AS swiped_at
     FROM swipes s
     JOIN users u ON u.id = s.from_id
     WHERE s.to_id = ? AND s.action IN ('like', 'super')
       AND u.is_banned = 0
       AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.from_id = ? AND mine.to_id = s.from_id)
       AND NOT EXISTS (
         SELECT 1 FROM blocks bl
         WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
            OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
       )
     ORDER BY CASE WHEN s.action = 'super' THEN 0 ELSE 1 END, s.created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, limit, offset]
  );

  const cards = cardsFor(rows, req.user).map((card, index) => ({
    ...card,
    is_super: rows[index].swipe_action === 'super',
    swiped_at: rows[index].swiped_at
  }));

  const totals = db.get(
    `SELECT
       SUM(CASE WHEN action = 'super' THEN 1 ELSE 0 END) AS supers,
       COUNT(*) AS total
     FROM swipes s
     WHERE s.to_id = ? AND s.action IN ('like', 'super')
       AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.from_id = ? AND mine.to_id = s.from_id)`,
    [req.user.id, req.user.id]
  );

  res.json({
    users: cards,
    total: totals && totals.total ? totals.total : 0,
    super_count: totals && totals.supers ? totals.supers : 0
  });
});

// People I liked.
router.get('/my-likes', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 24), 1, 100);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const rows = db.all(
    `SELECT u.*, s.action AS swipe_action, s.created_at AS swiped_at,
       (SELECT 1 FROM swipes back WHERE back.from_id = u.id AND back.to_id = ? AND back.action IN ('like','super')) AS likes_me
     FROM swipes s
     JOIN users u ON u.id = s.to_id
     WHERE s.from_id = ? AND s.action IN ('like', 'super') AND u.is_banned = 0
       AND NOT EXISTS (
         SELECT 1 FROM blocks bl
         WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
            OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
       )
     ORDER BY s.created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, limit, offset]
  );

  const cards = cardsFor(rows, req.user).map((card, index) => ({
    ...card,
    is_super: rows[index].swipe_action === 'super',
    mutual: !!rows[index].likes_me,
    swiped_at: rows[index].swiped_at
  }));

  res.json({ users: cards });
});

// Incoming super likes only.
router.get('/super', (req, res) => {
  const rows = db.all(
    `SELECT u.*, s.created_at AS swiped_at
     FROM swipes s
     JOIN users u ON u.id = s.from_id
     WHERE s.to_id = ? AND s.action = 'super' AND u.is_banned = 0
       AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.from_id = ? AND mine.to_id = s.from_id)
       AND NOT EXISTS (
         SELECT 1 FROM blocks bl
         WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
            OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
       )
     ORDER BY s.created_at DESC LIMIT 60`,
    [req.user.id, req.user.id, req.user.id, req.user.id]
  );
  const cards = cardsFor(rows, req.user).map((card, index) => ({
    ...card,
    is_super: true,
    swiped_at: rows[index].swiped_at
  }));
  res.json({ users: cards, total: cards.length });
});

// Daily super like state for the counter in the UI.
router.get('/super-status', (req, res) => {
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const balance = ensureSuperLikes(user);
  res.json({ super_likes_left: balance, super_likes_max: SUPER_LIKES_PER_DAY });
});

module.exports = router;
