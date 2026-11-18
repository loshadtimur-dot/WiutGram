'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { isBlockedBetween } = require('../lib/blocks');
const { notifyDaily } = require('../lib/notify');
const { emitToUser } = require('../lib/io');
const { toInt, clamp, cleaned } = require('../middleware/validate');
const { nowIso, isoPlusHours } = require('../utils/time');
const { deleteUpload } = require('../utils/files');
const { publicUser } = require('../utils/sanitize');

const router = express.Router();
router.use(requireAuth);

// Active story rails grouped by author.
router.get('/stories', (req, res) => {
  const now = nowIso();
  const rows = db.all(
    `SELECT s.*,
       u.username, u.display_name, u.avatar_path, u.is_verified, u.role, u.is_banned,
       u.hide_from_discovery,
       (SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.viewer_id = ?) AS viewed
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > ? AND u.is_banned = 0
       AND NOT EXISTS (
         SELECT 1 FROM blocks bl
         WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
            OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
       )
     ORDER BY s.created_at ASC`,
    [req.user.id, now, req.user.id, req.user.id]
  );

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.user_id)) {
      groups.set(row.user_id, {
        user: {
          id: row.user_id,
          username: row.username,
          display_name: row.display_name,
          avatar_path: row.avatar_path,
          is_verified: !!row.is_verified,
          role: row.role
        },
        stories: [],
        all_viewed: true,
        latest: row.created_at
      });
    }
    const group = groups.get(row.user_id);
    if (!row.viewed) group.all_viewed = false;
    if (row.created_at > group.latest) group.latest = row.created_at;
    group.stories.push({
      id: row.id,
      media_path: row.media_path,
      caption: row.caption,
      created_at: row.created_at,
      expires_at: row.expires_at,
      viewed: !!row.viewed,
      is_mine: row.user_id === req.user.id
    });
  }

  const feeds = [...groups.values()];
  feeds.sort((a, b) => {
    if (a.user.id === req.user.id) return -1;
    if (b.user.id === req.user.id) return 1;
    if (a.all_viewed !== b.all_viewed) return a.all_viewed ? 1 : -1;
    return a.latest < b.latest ? 1 : -1;
  });

  res.json({ feeds });
});

router.post('/stories', uploadLimiter, imageUpload('stories'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Добавьте изображение' });
  const active = db.get('SELECT COUNT(*) AS t FROM stories WHERE user_id = ? AND expires_at > ?', [
    req.user.id,
    nowIso()
  ]).t;
  if (active >= 15) {
    deleteUpload(`/uploads/stories/${req.file.filename}`);
    return res.status(400).json({ error: 'Слишком много активных историй' });
  }
  const createdAt = nowIso();
  const mediaPath = `/uploads/stories/${req.file.filename}`;
  const caption = cleaned(req.body?.caption, 200);
  const result = db.run(
    'INSERT INTO stories (user_id, media_path, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, mediaPath, caption, createdAt, isoPlusHours(24)]
  );
  const story = db.get('SELECT * FROM stories WHERE id = ?', [Number(result.lastInsertRowid)]);
  res.status(201).json({
    story: {
      id: story.id,
      user_id: story.user_id,
      media_path: story.media_path,
      caption: story.caption,
      created_at: story.created_at,
      expires_at: story.expires_at,
      viewed: false,
      is_mine: true
    }
  });
});

router.delete('/stories/:id', (req, res) => {
  const story = db.get('SELECT * FROM stories WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!story) return res.status(404).json({ error: 'История не найдена' });
  const isStaff = req.user.role === 'owner' || req.user.role === 'admin';
  if (story.user_id !== req.user.id && !isStaff) {
    return res.status(403).json({ error: 'Нельзя удалить чужую историю' });
  }
  db.run('DELETE FROM stories WHERE id = ?', [story.id]);
  deleteUpload(story.media_path);
  res.json({ ok: true });
});

router.post('/stories/:id/view', (req, res) => {
  const story = db.get('SELECT * FROM stories WHERE id = ? AND expires_at > ?', [
    toInt(req.params.id, 0),
    nowIso()
  ]);
  if (!story) return res.status(404).json({ error: 'История не найдена' });
  if (isBlockedBetween(req.user.id, story.user_id)) {
    return res.status(403).json({ error: 'История недоступна' });
  }

  const existing = db.get('SELECT 1 AS x FROM story_views WHERE story_id = ? AND viewer_id = ?', [
    story.id,
    req.user.id
  ]);
  if (!existing && story.user_id !== req.user.id) {
    db.run('INSERT INTO story_views (story_id, viewer_id, created_at) VALUES (?, ?, ?)', [
      story.id,
      req.user.id,
      nowIso()
    ]);
    notifyDaily({
      userId: story.user_id,
      type: 'story_view',
      actorId: req.user.id,
      refId: story.id,
      text: 'Кто-то посмотрел вашу историю'
    });
    const count = db.get('SELECT COUNT(*) AS t FROM story_views WHERE story_id = ?', [story.id]).t;
    emitToUser(story.user_id, 'story:views', { story_id: story.id, views: count });
  }
  const views = db.get('SELECT COUNT(*) AS t FROM story_views WHERE story_id = ?', [story.id]).t;
  res.json({ ok: true, viewed: true, views });
});

router.get('/stories/:id/viewers', (req, res) => {
  const story = db.get('SELECT * FROM stories WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!story) return res.status(404).json({ error: 'История не найдена' });
  if (story.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Список зрителей доступен только автору' });
  }
  const rows = db.all(
    `SELECT u.*, sv.created_at AS viewed_at FROM story_views sv
     JOIN users u ON u.id = sv.viewer_id
     WHERE sv.story_id = ? ORDER BY sv.created_at DESC`,
    [story.id]
  );
  res.json({
    viewers: rows.map((row) => ({
      user: publicUser(row, { isOnline: false }),
      viewed_at: row.viewed_at
    }))
  });
});

// Story highlights (collections).
router.get('/highlights', (req, res) => {
  const username = req.query.username ? String(req.query.username).toLowerCase() : null;
  let userId = req.user.id;
  if (username) {
    const owner = db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (!owner) return res.status(404).json({ error: 'Профиль не найден' });
    userId = owner.id;
  }
  const rows = db.all(
    `SELECT h.*, (SELECT COUNT(*) FROM highlight_items hi WHERE hi.highlight_id = h.id) AS items
     FROM highlights h WHERE h.user_id = ? ORDER BY h.created_at ASC`,
    [userId]
  );
  const items = db.all(
    `SELECT hi.highlight_id, s.id, s.media_path, s.caption, s.created_at
     FROM highlight_items hi JOIN stories s ON s.id = hi.story_id
     WHERE hi.highlight_id IN (SELECT id FROM highlights WHERE user_id = ?)
     ORDER BY s.created_at ASC`,
    [userId]
  );
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.highlight_id)) grouped.set(item.highlight_id, []);
    grouped.get(item.highlight_id).push({
      id: item.id,
      media_path: item.media_path,
      caption: item.caption,
      created_at: item.created_at
    });
  }
  res.json({
    highlights: rows.map((row) => ({
      id: row.id,
      title: row.title,
      cover_path: row.cover_path,
      created_at: row.created_at,
      items: grouped.get(row.id) || []
    }))
  });
});

router.post('/highlights', (req, res) => {
  const title = cleaned(req.body?.title, 30);
  if (title.length < 1) return res.status(400).json({ error: 'Введите название подборки' });
  const storyIds = Array.isArray(req.body?.story_ids)
    ? req.body.story_ids.map((id) => toInt(id, 0)).filter(Boolean)
    : [];
  if (!storyIds.length) return res.status(400).json({ error: 'Выберите хотя бы одну историю' });

  const owned = db.all(
    `SELECT * FROM stories WHERE user_id = ? AND id IN ${db.inClause(storyIds.length)}`,
    [req.user.id, ...storyIds]
  );
  if (!owned.length) return res.status(400).json({ error: 'Истории не найдены' });

  const createdAt = nowIso();
  const result = db.run('INSERT INTO highlights (user_id, title, cover_path, created_at) VALUES (?, ?, ?, ?)', [
    req.user.id,
    title,
    owned[0].media_path,
    createdAt
  ]);
  const highlightId = Number(result.lastInsertRowid);
  for (const story of owned) {
    db.run('INSERT OR IGNORE INTO highlight_items (highlight_id, story_id) VALUES (?, ?)', [
      highlightId,
      story.id
    ]);
  }
  res.status(201).json({ highlight: { id: highlightId, title, cover_path: owned[0].media_path, items: owned.map((s) => ({ id: s.id, media_path: s.media_path, caption: s.caption, created_at: s.created_at })) } });
});

router.delete('/highlights/:id', (req, res) => {
  const highlight = db.get('SELECT * FROM highlights WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!highlight) return res.status(404).json({ error: 'Подборка не найдена' });
  if (highlight.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Нельзя удалить чужую подборку' });
  }
  db.run('DELETE FROM highlights WHERE id = ?', [highlight.id]);
  res.json({ ok: true });
});

router.get('/stories/mine', (req, res) => {
  const rows = db.all(
    'SELECT * FROM stories WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC',
    [req.user.id, nowIso()]
  );
  res.json({ stories: rows });
});

module.exports = router;
