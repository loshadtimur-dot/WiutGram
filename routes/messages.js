'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { matchForUser } = require('../lib/matches');
const { isBlockedBetween, hasBlocked } = require('../lib/blocks');
const { notify } = require('../lib/notify');
const { emitToUser } = require('../lib/io');
const { toInt, clamp, cleaned } = require('../middleware/validate');
const { nowIso } = require('../utils/time');
const { deleteUpload } = require('../utils/files');

const router = express.Router();
router.use(requireAuth);

// Validates that the current user can access the match conversation.
function resolveMatch(req, res) {
  const info = matchForUser(toInt(req.params.id, 0), req.user.id);
  if (!info) {
    res.status(404).json({ error: 'Матч не найден' });
    return null;
  }
  if (!info.match.is_active) {
    res.status(404).json({ error: 'Матч больше не активен' });
    return null;
  }
  if (isBlockedBetween(req.user.id, info.other.id)) {
    res.status(403).json({ error: 'Диалог недоступен' });
    return null;
  }
  if (info.other.is_banned) {
    res.status(403).json({ error: 'Пользователь заблокирован' });
    return null;
  }
  return info;
}

function messageView(row, userId) {
  const mine = row.sender_id === Number(userId);
  const deleted = !!row.deleted_by_sender;
  return {
    id: row.id,
    match_id: row.match_id,
    sender_id: row.sender_id,
    type: row.type,
    body: deleted ? '' : row.body,
    image_path: deleted ? null : row.image_path,
    created_at: row.created_at,
    read_at: row.read_at,
    reaction: row.reaction || null,
    deleted,
    mine
  };
}

router.get('/matches/:id/messages', (req, res) => {
  const info = resolveMatch(req, res);
  if (!info) return undefined;

  const limit = clamp(toInt(req.query.limit, 30), 1, 100);
  const before = toInt(req.query.before, 0);

  const rows = before
    ? db.all(
        'SELECT * FROM messages WHERE match_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
        [info.match.id, before, limit]
      )
    : db.all('SELECT * FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT ?', [
        info.match.id,
        limit
      ]);

  const ordered = rows.slice().reverse();
  return res.json({
    messages: ordered.map((row) => messageView(row, req.user.id)),
    has_more: rows.length === limit
  });
});

function sendMessage(req, res, payload) {
  const info = resolveMatch(req, res);
  if (!info) return undefined;

  const createdAt = nowIso();
  const result = db.run(
    `INSERT INTO messages (match_id, sender_id, type, body, image_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [info.match.id, req.user.id, payload.type, payload.body, payload.image_path, createdAt]
  );

  const row = db.get('SELECT * FROM messages WHERE id = ?', [Number(result.lastInsertRowid)]);
  const view = messageView(row, req.user.id);
  const otherView = messageView(row, info.other.id);

  emitToUser(req.user.id, 'message:new', { message: view, match_id: info.match.id });
  emitToUser(info.other.id, 'message:new', { message: otherView, match_id: info.match.id });

  const preview =
    payload.type === 'image' ? '📷 Фото' : payload.body.length > 80 ? `${payload.body.slice(0, 80)}…` : payload.body;
  notify({
    userId: info.other.id,
    type: 'message',
    actorId: req.user.id,
    refId: info.match.id,
    text: preview
  });

  return res.status(201).json({ message: view });
}

router.post('/matches/:id/messages', (req, res) => {
  const body = cleaned(req.body?.body, 2000);
  if (!body) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  return sendMessage(req, res, { type: 'text', body, image_path: null });
});

router.post('/matches/:id/messages/image', uploadLimiter, imageUpload('chat'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Выберите изображение' });
  const path = `/uploads/chat/${req.file.filename}`;
  const caption = cleaned(req.body?.body, 500);
  return sendMessage(req, res, { type: 'image', body: caption, image_path: path });
});

router.delete('/messages/:id', (req, res) => {
  const message = db.get('SELECT * FROM messages WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (message.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Можно удалять только свои сообщения' });
  }
  const info = matchForUser(message.match_id, req.user.id);
  if (!info) return res.status(404).json({ error: 'Матч не найден' });

  db.run(
    "UPDATE messages SET deleted_by_sender = 1, body = '', image_path = NULL, reaction = NULL WHERE id = ?",
    [message.id]
  );
  if (message.image_path) deleteUpload(message.image_path);

  const payload = { id: message.id, match_id: message.match_id };
  emitToUser(req.user.id, 'message:deleted', payload);
  emitToUser(info.other.id, 'message:deleted', payload);
  return res.json({ ok: true });
});

router.post('/matches/:id/read', (req, res) => {
  const info = resolveMatch(req, res);
  if (!info) return undefined;

  const readAt = nowIso();
  const result = db.run(
    'UPDATE messages SET read_at = ? WHERE match_id = ? AND sender_id != ? AND read_at IS NULL',
    [readAt, info.match.id, req.user.id]
  );

  if (result.changes > 0) {
    const payload = {
      match_id: info.match.id,
      reader_id: req.user.id,
      read_at: readAt
    };
    emitToUser(info.other.id, 'message:read', payload);
    emitToUser(req.user.id, 'message:read', payload);
  }
  return res.json({ ok: true, updated: result.changes });
});

router.post('/messages/:id/react', (req, res) => {
  const message = db.get('SELECT * FROM messages WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });
  const info = matchForUser(message.match_id, req.user.id);
  if (!info) return res.status(403).json({ error: 'Нет доступа к сообщению' });
  if (message.deleted_by_sender) return res.status(400).json({ error: 'Сообщение удалено' });

  const reaction = req.body?.reaction === 'heart' ? 'heart' : null;
  db.run('UPDATE messages SET reaction = ? WHERE id = ?', [reaction, message.id]);
  const payload = {
    id: message.id,
    match_id: message.match_id,
    reaction
  };
  emitToUser(req.user.id, 'message:reaction', payload);
  emitToUser(info.other.id, 'message:reaction', payload);
  return res.json({ ok: true, reaction });
});

router.get('/matches/:id/unread', (req, res) => {
  const info = matchForUser(toInt(req.params.id, 0), req.user.id);
  if (!info) return res.status(404).json({ error: 'Матч не найден' });
  const row = db.get(
    'SELECT COUNT(*) AS total FROM messages WHERE match_id = ? AND sender_id != ? AND read_at IS NULL',
    [info.match.id, req.user.id]
  );
  res.json({ unread: row ? row.total : 0 });
});

module.exports = router;
