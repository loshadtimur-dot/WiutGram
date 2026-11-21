'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { postMediaUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { POST_FIELDS, mapPost, COMMENT_FIELDS, mapComment } = require('../lib/postView');
const { isBlockedBetween } = require('../lib/blocks');
const { notify } = require('../lib/notify');
const { emitToUser } = require('../lib/io');
const { toInt, clamp, cleaned } = require('../middleware/validate');
const { SQL_AGE } = require('../utils/age');
const { nowIso } = require('../utils/time');
const { deleteUpload } = require('../utils/files');

const router = express.Router();
router.use(requireAuth);

const VISIBLE_AUTHOR = 'u.is_banned = 0 AND u.hide_from_discovery = 0 AND COALESCE(u.shadow_banned, 0) = 0';
const NOT_BLOCKED = `NOT EXISTS (
  SELECT 1 FROM blocks bl
  WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
     OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
)`;

function loadPost(postId, viewerId) {
  const row = db.get(`SELECT ${POST_FIELDS} FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`, [
    viewerId,
    postId
  ]);
  return row ? mapPost(row) : null;
}

function canSeePost(post, viewerId) {
  const author = db.get('SELECT * FROM users WHERE id = ?', [post.user_id]);
  if (!author || author.is_banned || author.shadow_banned) return false;
  if (isBlockedBetween(viewerId, author.id)) return false;
  return true;
}

// Unified feed: newest posts, optionally filtered by author.
router.get('/feed', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 12), 1, 30);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const username = req.query.username ? String(req.query.username).toLowerCase() : null;

  let authorId = null;
  if (username) {
    const author = db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!author) return res.status(404).json({ error: 'Профиль не найден' });
    if (author.is_banned) return res.status(404).json({ error: 'Профиль недоступен' });
    if (isBlockedBetween(req.user.id, author.id)) {
      return res.status(403).json({ error: 'Профиль недоступен' });
    }
    authorId = author.id;
  }

  const filters = [];
  const filterParams = [];
  if (authorId) {
    filters.push('p.user_id = ?');
    filterParams.push(authorId);
  } else {
    filters.push(VISIBLE_AUTHOR);
    filters.push(NOT_BLOCKED);
    filterParams.push(req.user.id, req.user.id);
  }

  const city = req.query.city ? String(req.query.city) : null;
  const q = req.query.q ? `%${String(req.query.q).trim()}%` : null;
  const interest = req.query.interest ? `%${String(req.query.interest)}%` : null;
  const minAge = clamp(toInt(req.query.min_age, 16), 16, 99);
  const maxAge = clamp(toInt(req.query.max_age, 99), 18, 99);

  if (city) {
    filters.push(`(${db.textLower}(COALESCE(p.location, '')) LIKE ${db.textLower}(?) OR u.city = ?)`);
    filterParams.push(`%${city}%`, city);
  }
  if (q) {
    filters.push(`(${db.textLower}(p.caption) LIKE ? OR ${db.textLower}(u.display_name) LIKE ? OR ${db.textLower}(u.username) LIKE ?)`);
    filterParams.push(q, q, q);
  }
  if (interest) {
    filters.push(`${db.textLower}(u.interests) LIKE ?`);
    filterParams.push(interest);
  }
  if (minAge > 18 || maxAge < 99) {
    filters.push(`${SQL_AGE} BETWEEN ? AND ?`);
    filterParams.push(minAge, maxAge);
  }

  const rows = db.all(
    `SELECT ${POST_FIELDS} FROM posts p JOIN users u ON u.id = p.user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [req.user.id, ...filterParams, limit, offset]
  );

  const total = authorId
    ? db.get('SELECT COUNT(*) AS t FROM posts WHERE user_id = ?', [authorId]).t
    : null;

  return res.json({
    posts: rows.map(mapPost),
    has_more: rows.length === limit,
    total
  });
});

router.post('/posts', uploadLimiter, postMediaUpload('posts'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Добавьте фото или видео' });
  const caption = cleaned(req.body?.caption, 2200);
  const location = cleaned(req.body?.location, 100);
  const path = `/uploads/posts/${req.file.filename}`;
  const kind = String(req.file.mimetype || '').startsWith('video/') ? 'video' : 'image';
  const createdAt = nowIso();
  const result = db.run(
    'INSERT INTO posts (user_id, image_path, caption, location, created_at, views_count, post_kind) VALUES (?, ?, ?, ?, ?, 0, ?)',
    [req.user.id, path, caption, location, createdAt, kind]
  );
  const post = loadPost(Number(result.lastInsertRowid), req.user.id);
  res.status(201).json({ post });
});

router.get('/posts/:id', (req, res) => {
  const post = loadPost(toInt(req.params.id, 0), req.user.id);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (!canSeePost(post, req.user.id)) return res.status(404).json({ error: 'Пост недоступен' });
  res.json({ post });
});

router.delete('/posts/:id', (req, res) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  const isStaff = req.user.role === 'owner' || req.user.role === 'admin';
  if (post.user_id !== req.user.id && !isStaff) {
    return res.status(403).json({ error: 'Нельзя удалить чужой пост' });
  }
  db.run('DELETE FROM posts WHERE id = ?', [post.id]);
  deleteUpload(post.image_path);
  res.json({ ok: true });
});

router.post('/posts/:id/like', (req, res) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (!canSeePost(post, req.user.id)) return res.status(404).json({ error: 'Пост недоступен' });

  const existing = db.get('SELECT 1 AS x FROM post_likes WHERE post_id = ? AND user_id = ?', [
    post.id,
    req.user.id
  ]);
  if (!existing) {
    db.run('INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)', [
      post.id,
      req.user.id,
      nowIso()
    ]);
    notify({
      userId: post.user_id,
      type: 'post_like',
      actorId: req.user.id,
      refId: post.id,
      text: 'Вашему посту поставили лайк ❤️'
    });
  }
  const count = db.get('SELECT COUNT(*) AS t FROM post_likes WHERE post_id = ?', [post.id]).t;
  res.json({ ok: true, liked: true, likes: count });
});

router.delete('/posts/:id/like', (req, res) => {
  const postId = toInt(req.params.id, 0);
  db.run('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
  const count = db.get('SELECT COUNT(*) AS t FROM post_likes WHERE post_id = ?', [postId]).t;
  res.json({ ok: true, liked: false, likes: count });
});

router.post('/posts/:id/view', (req, res) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (!canSeePost(post, req.user.id)) return res.status(404).json({ error: 'Пост недоступен' });

  const existing = db.get('SELECT 1 AS x FROM post_views WHERE post_id = ? AND viewer_id = ?', [
    post.id,
    req.user.id
  ]);
  if (!existing) {
    db.run('INSERT INTO post_views (post_id, viewer_id, created_at) VALUES (?, ?, ?)', [
      post.id,
      req.user.id,
      nowIso()
    ]);
    db.run('UPDATE posts SET views_count = views_count + 1 WHERE id = ?', [post.id]);
  }
  const views = db.get('SELECT views_count FROM posts WHERE id = ?', [post.id]).views_count;
  res.json({ ok: true, views });
});

function commentsForPost(postId, viewerId) {
  const rows = db.all(
    `SELECT ${COMMENT_FIELDS} FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 300`,
    [viewerId, postId]
  );
  return rows.map(mapComment);
}

router.get('/posts/:id/comments', (req, res) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (!canSeePost(post, req.user.id)) return res.status(404).json({ error: 'Пост недоступен' });
  res.json({ comments: commentsForPost(post.id, req.user.id) });
});

router.post('/posts/:id/comments', (req, res) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (!canSeePost(post, req.user.id)) return res.status(404).json({ error: 'Пост недоступен' });

  const body = cleaned(req.body?.body, 500);
  if (!body) return res.status(400).json({ error: 'Комментарий не может быть пустым' });

  let parentId = null;
  if (req.body?.parent_id) {
    const parent = db.get('SELECT * FROM comments WHERE id = ? AND post_id = ?', [
      toInt(req.body.parent_id, 0),
      post.id
    ]);
    if (!parent) return res.status(400).json({ error: 'Комментарий не найден' });
    parentId = parent.id;
  }

  const result = db.run(
    'INSERT INTO comments (post_id, user_id, body, parent_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [post.id, req.user.id, body, parentId, nowIso()]
  );

  notify({
    userId: post.user_id,
    type: 'comment',
    actorId: req.user.id,
    refId: post.id,
    text: 'Новый комментарий к вашему посту'
  });

  if (parentId) {
    const parent = db.get('SELECT * FROM comments WHERE id = ?', [parentId]);
    if (parent && parent.user_id !== post.user_id) {
      notify({
        userId: parent.user_id,
        type: 'comment',
        actorId: req.user.id,
        refId: post.id,
        text: 'Ответ на ваш комментарий'
      });
    }
  }

  const row = db.get(
    `SELECT ${COMMENT_FIELDS} FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [req.user.id, Number(result.lastInsertRowid)]
  );
  const comment = mapComment(row);
  emitToUser(post.user_id, 'comment:new', { comment, post_id: post.id });
  res.status(201).json({ comment });
});

router.delete('/comments/:id', (req, res) => {
  const comment = db.get('SELECT * FROM comments WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
  const post = db.get('SELECT * FROM posts WHERE id = ?', [comment.post_id]);
  const isStaff = req.user.role === 'owner' || req.user.role === 'admin';
  const isPostAuthor = post && post.user_id === req.user.id;
  if (comment.user_id !== req.user.id && !isPostAuthor && !isStaff) {
    return res.status(403).json({ error: 'Нельзя удалить этот комментарий' });
  }
  db.run('DELETE FROM comments WHERE id = ?', [comment.id]);
  res.json({ ok: true });
});

router.post('/comments/:id/like', (req, res) => {
  const commentId = toInt(req.params.id, 0);
  const comment = db.get('SELECT * FROM comments WHERE id = ?', [commentId]);
  if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });

  const existing = db.get('SELECT 1 AS x FROM comment_likes WHERE comment_id = ? AND user_id = ?', [
    commentId,
    req.user.id
  ]);
  if (existing) {
    db.run('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]);
  } else {
    db.run('INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)', [
      commentId,
      req.user.id,
      nowIso()
    ]);
  }
  const count = db.get('SELECT COUNT(*) AS t FROM comment_likes WHERE comment_id = ?', [commentId]).t;
  res.json({ ok: true, liked: !existing, likes: count });
});

module.exports = router;
