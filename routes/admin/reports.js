'use strict';

const express = require('express');
const db = require('../../db');
const { toInt, cleaned, oneOf } = require('../../middleware/validate');
const { nowIso } = require('../../utils/time');
const { adminLog } = require('../../lib/activity');

const router = express.Router();

const STATUSES = ['new', 'in_progress', 'closed'];

router.get('/', (req, res) => {
  const status = oneOf(req.query.status, STATUSES, 'new');
  const q = cleaned(req.query.q, 80);
  const params = [];
  let where = 'WHERE r.status = ?';
  params.push(status);
  if (q) {
    where += ' AND (u.username LIKE ? OR rep.username LIKE ? OR r.reason LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const rows = db.all(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at, r.post_id,
       u.id AS reported_id, u.username AS reported_username, u.display_name AS reported_name,
       rep.id AS reporter_id, rep.username AS reporter_username
     FROM reports r
     JOIN users u ON u.id = r.reported_id
     JOIN users rep ON rep.id = r.reporter_id
     ${where}
     ORDER BY r.created_at DESC LIMIT 100`,
    params
  );
  const counts = {};
  for (const item of db.all('SELECT status, COUNT(*) AS total FROM reports GROUP BY status')) {
    counts[item.status] = item.total;
  }
  res.json({ reports: rows, counts });
});

router.get('/:id', (req, res) => {
  const id = toInt(req.params.id, 0);
  const report = db.get(
    `SELECT r.*, u.username AS reported_username, u.display_name AS reported_name,
       rep.username AS reporter_username
     FROM reports r JOIN users u ON u.id = r.reported_id JOIN users rep ON rep.id = r.reporter_id
     WHERE r.id = ?`,
    [id]
  );
  if (!report) return res.status(404).json({ error: 'Жалоба не найдена' });
  const post = report.post_id
    ? db.get('SELECT id, image_path, caption, is_hidden, created_at FROM posts WHERE id = ?', [report.post_id])
    : null;
  res.json({ report, post });
});

router.post('/:id/resolve', (req, res) => {
  const id = toInt(req.params.id, 0);
  const report = db.get('SELECT * FROM reports WHERE id = ?', [id]);
  if (!report) return res.status(404).json({ error: 'Жалоба не найдена' });
  const action = oneOf(req.body && req.body.action, ['hide_post', 'warn', 'ban', 'dismiss'], null);
  const note = cleaned(req.body && req.body.note, 500);
  const days = toInt(req.body && req.body.ban_days, 0);
  if (!action) return res.status(400).json({ error: 'Выберите решение' });

  const now = nowIso();
  if (action === 'hide_post' && report.post_id) {
    db.run('UPDATE posts SET is_hidden = 1 WHERE id = ?', [report.post_id]);
  }
  if (action === 'warn') {
    db.run(
      `INSERT INTO notifications (user_id, type, actor_id, ref_id, text, created_at, is_read)
       VALUES (?, 'system', NULL, NULL, ?, ?, 0)`,
      [report.reported_id, note || 'Предупреждение от модерации: соблюдайте правила сообщества.', now]
    );
  }
  if (action === 'ban') {
    const until = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
    db.run(
      `UPDATE users SET is_banned = 1, ban_reason = ?, ban_until = ?, banned_at = ?, token_version = token_version + 1, updated_at = ?
       WHERE id = ?`,
      [note || 'Нарушение правил сообщества', until, now, now, report.reported_id]
    );
    db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [now, report.reported_id]);
  }
  const status = action === 'dismiss' ? 'closed' : 'closed';
  db.run('UPDATE reports SET status = ?, handled_by = ? WHERE id = ?', [status, req.user.id, id]);
  if (report.post_id && action !== 'hide_post') {
    db.run("UPDATE reports SET status = 'closed' WHERE post_id = ? AND id != ?", [report.post_id, id]);
  }
  adminLog(req, `report_${action}`, `user:${report.reported_id}`, {
    meta: { report_id: id, note, ban_days: days }
  });
  res.json({ ok: true });
});

module.exports = router;
