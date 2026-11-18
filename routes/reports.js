'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toInt, oneOf, cleaned } = require('../middleware/validate');
const { nowIso } = require('../utils/time');
const { logActivity } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

const REASONS = ['spam', 'nudity', 'harassment', 'scam', 'fake', 'underage', 'other'];

router.post('/', (req, res) => {
  const reportedId = toInt(req.body?.reported_id, 0);
  const reason = oneOf(req.body?.reason, REASONS, null);
  const postId = req.body?.post_id ? toInt(req.body.post_id, 0) : null;
  const details = cleaned(req.body?.details, 1000);

  if (!reportedId || reportedId === req.user.id) {
    return res.status(400).json({ error: 'Некорректный пользователь' });
  }
  if (!reason) return res.status(400).json({ error: 'Выберите причину жалобы' });

  const target = db.get('SELECT id FROM users WHERE id = ?', [reportedId]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  if (postId) {
    const post = db.get('SELECT id FROM posts WHERE id = ? AND user_id = ?', [postId, reportedId]);
    if (!post) return res.status(400).json({ error: 'Пост не найден' });
  }

  const duplicate = db.get(
    `SELECT id FROM reports WHERE reporter_id = ? AND reported_id = ? AND status = 'new'
     AND created_at > ? LIMIT 1`,
    [req.user.id, reportedId, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()]
  );
  if (duplicate) {
    return res.status(409).json({ error: 'Жалоба уже отправлена. Мы проверим её в ближайшее время.' });
  }

  db.run(
    `INSERT INTO reports (reporter_id, reported_id, post_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`,
    [req.user.id, reportedId, postId, reason, details, nowIso()]
  );
  logActivity(req.user.id, 'report', `user:${reportedId}`, { reason });
  res.status(201).json({ ok: true, message: 'Жалоба отправлена модераторам' });
});

module.exports = router;
