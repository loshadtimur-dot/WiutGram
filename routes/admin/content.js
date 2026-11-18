'use strict';

const express = require('express');
const db = require('../../db');
const { adminLog } = require('../../lib/activity');
const { requireSudo } = require('../../middleware/auth');
const { toInt, clamp, cleaned } = require('../../middleware/validate');
const { POST_FIELDS, mapPost, COMMENT_FIELDS, mapComment } = require('../../lib/postView');
const { deleteUpload } = require('../../utils/files');
const { nowIso } = require('../../utils/time');

const router = express.Router();

/* ---------- Posts ---------- */

router.get('/posts', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 24), 1, 100);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const q = cleaned(req.query.q, 80);
  const filters = ['1=1'];
  const params = [];
  if (req.query.author_id) {
    filters.push('p.user_id = ?');
    params.push(toInt(req.query.author_id, 0));
  }
  if (req.query.university_id) {
    filters.push('u.university_id = ?');
    params.push(toInt(req.query.university_id, 0));
  }
  if (q) {
    filters.push(`(${db.textLower}(p.caption) LIKE ? OR ${db.textLower}(u.username) LIKE ? OR ${db.textLower}(u.display_name) LIKE ?)`);
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  const rows = db.all(
    `SELECT ${POST_FIELDS}, uni.short_name AS author_university
     FROM posts p JOIN users u ON u.id = p.user_id
     LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE ${filters.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [req.user.id, ...params, limit, offset]
  );
  const total = db.get(
    `SELECT COUNT(*) AS t FROM posts p JOIN users u ON u.id = p.user_id WHERE ${filters.join(' AND ')}`,
    params
  ).t;
  res.json({
    posts: rows.map((row) => ({
      ...mapPost(row),
      author_university: row.author_university || null,
      author_is_demo: !!row.author_demo
    })),
    total,
    limit,
    offset
  });
});

router.delete('/posts/:id', (req, res) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  db.run('DELETE FROM posts WHERE id = ?', [post.id]);
  deleteUpload(post.image_path);
  adminLog(req, 'content_post_delete', `post:${post.id}`, { before: { user_id: post.user_id, caption: post.caption } });
  res.json({ ok: true });
});

/* ---------- Stories ---------- */

router.get('/stories', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 30), 1, 100);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const filters = ['1=1'];
  const params = [];
  if (req.query.author_id) {
    filters.push('s.user_id = ?');
    params.push(toInt(req.query.author_id, 0));
  }
  if (req.query.active === '1') {
    filters.push('s.expires_at > ?');
    params.push(nowIso());
  }
  if (req.query.university_id) {
    filters.push('u.university_id = ?');
    params.push(toInt(req.query.university_id, 0));
  }
  const rows = db.all(
    `SELECT s.*, u.username, u.display_name, u.avatar_path, uni.short_name AS university_short_name,
       (SELECT COUNT(*) FROM story_views sv WHERE sv.story_id = s.id) AS views
     FROM stories s JOIN users u ON u.id = s.user_id
     LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE ${filters.join(' AND ')}
     ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = db.get(
    `SELECT COUNT(*) AS t FROM stories s JOIN users u ON u.id = s.user_id WHERE ${filters.join(' AND ')}`,
    params
  ).t;
  res.json({ stories: rows, total, limit, offset });
});

router.delete('/stories/:id', (req, res) => {
  const story = db.get('SELECT * FROM stories WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!story) return res.status(404).json({ error: 'История не найдена' });
  db.run('DELETE FROM stories WHERE id = ?', [story.id]);
  deleteUpload(story.media_path);
  adminLog(req, 'content_story_delete', `story:${story.id}`, { before: { user_id: story.user_id } });
  res.json({ ok: true });
});

/* ---------- Comments ---------- */

router.get('/comments', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 40), 1, 100);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const q = cleaned(req.query.q, 80);
  const filters = ['1=1'];
  const params = [req.user.id];
  if (req.query.author_id) {
    filters.push('c.user_id = ?');
    params.push(toInt(req.query.author_id, 0));
  }
  if (q) {
    filters.push(`${db.textLower}(c.body) LIKE ?`);
    params.push(`%${q.toLowerCase()}%`);
  }
  const rows = db.all(
    `SELECT ${COMMENT_FIELDS}, p.image_path AS post_image
     FROM comments c JOIN users u ON u.id = c.user_id
     LEFT JOIN posts p ON p.id = c.post_id
     WHERE ${filters.join(' AND ')}
     ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = db.get(
    `SELECT COUNT(*) AS t FROM comments c JOIN users u ON u.id = c.user_id WHERE ${filters.join(' AND ')}`,
    params.slice(1)
  ).t;
  res.json({ comments: rows.map(mapComment), total, limit, offset });
});

router.delete('/comments/:id', (req, res) => {
  const comment = db.get('SELECT * FROM comments WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
  db.run('DELETE FROM comments WHERE id = ?', [comment.id]);
  adminLog(req, 'content_comment_delete', `comment:${comment.id}`, { before: { user_id: comment.user_id } });
  res.json({ ok: true });
});

/* ---------- Remove everything published by one author ---------- */

router.delete('/users/:id', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const user = db.get('SELECT id, username FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const files = [];
  db.all('SELECT image_path FROM posts WHERE user_id = ?', [id]).forEach((row) => files.push(row.image_path));
  db.all('SELECT media_path FROM stories WHERE user_id = ?', [id]).forEach((row) => files.push(row.media_path));
  const posts = db.run('DELETE FROM posts WHERE user_id = ?', [id]).changes;
  const stories = db.run('DELETE FROM stories WHERE user_id = ?', [id]).changes;
  const comments = db.run('DELETE FROM comments WHERE user_id = ?', [id]).changes;
  for (const file of files) deleteUpload(file);
  adminLog(req, 'content_author_purge', `user:${id}`, {
    meta: { username: user.username, posts, stories, comments }
  });
  res.json({ ok: true, posts, stories, comments });
});

module.exports = router;
