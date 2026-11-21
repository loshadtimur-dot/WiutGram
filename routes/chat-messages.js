'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { imageUpload, audioUpload, videoUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { toInt, cleaned } = require('../middleware/validate');
const chat = require('../lib/chat/service');
const messages = require('../lib/chat/messages');
const decor = require('../lib/decor/service');
const { nowIso } = require('../utils/time');
const { notify } = require('../lib/notify');

const router = express.Router();
for (const prefix of ['/conversations', '/messages', '/chat']) router.use(prefix, requireAuth);

function guard(req, res, id) {
  const conversation = chat.conversationById(id);
  if (!conversation) {
    res.status(404).json({ error: 'Беседа не найдена' });
    return null;
  }
  const member = chat.memberOf(conversation.id, req.user.id);
  if (!member || member.banned) {
    res.status(403).json({ error: 'Нет доступа к беседе' });
    return null;
  }
  return { conversation, member };
}

function writeGuard(req, res, conversation, member) {
  if (!chat.can(member, 'send_messages')) {
    res.status(403).json({ error: 'Отправка сообщений отключена' });
    return false;
  }
  if (conversation.slow_mode_sec > 0 && member.role === 'member') {
    const last = db.get(
      'SELECT created_at FROM messages WHERE conversation_id = ? AND sender_id = ? ORDER BY seq DESC LIMIT 1',
      [conversation.id, req.user.id]
    );
    if (last && Date.now() - new Date(last.created_at).getTime() < conversation.slow_mode_sec * 1000) {
      res.status(429).json({ error: 'Медленный режим: подождите немного' });
      return false;
    }
  }
  if (conversation.type === 'dm') {
    const request = db.get(
      "SELECT * FROM message_requests WHERE conversation_id = ? AND from_user_id = ? AND status = 'pending'",
      [conversation.id, req.user.id]
    );
    if (request) {
      const sent = db.get('SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ? AND sender_id = ?', [
        conversation.id,
        req.user.id
      ]);
      if (Number(sent.total) >= 1) {
        res.status(403).json({
          error: 'Запрос на переписку ещё не принят. Можно отправить только одно сообщение.',
          code: 'request_pending'
        });
        return false;
      }
    }
  }
  return true;
}

function deliver(conversation, row, user) {
  const sender = chat.userById(user.id);
  const view = messages.messageView(row, user.id, { sender, reactions: [], readCount: 0 });
  const members = db.all('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND banned = 0', [
    conversation.id
  ]);
  for (const entry of members) {
    if (Number(entry.user_id) === Number(user.id)) continue;
    const otherView = { ...view, mine: false };
    const io = require('../lib/io');
    io.emitToUser(entry.user_id, 'message:new', { message: otherView, conversation_id: conversation.id });
    const pending = db.get(
      "SELECT 1 AS ok FROM message_requests WHERE conversation_id = ? AND to_user_id = ? AND status = 'pending'",
      [conversation.id, entry.user_id]
    );
    if (!pending) {
      const preview =
        row.type === 'image'
          ? 'Фото'
          : row.type === 'voice'
            ? 'Голосовое сообщение'
            : row.type === 'video'
              ? 'Видео'
              : row.type === 'post'
                ? 'Пост'
                : row.type === 'gift'
                  ? 'Подарок'
                  : row.type === 'poll'
                    ? 'Опрос'
                    : String(row.body || '').slice(0, 80);
      notify({
        userId: entry.user_id,
        type: 'message',
        actorId: user.id,
        refId: conversation.id,
        text: conversation.type === 'group' ? `${conversation.title}: ${preview}` : preview
      });
    }
  }
  return view;
}

router.get('/conversations/:id/messages', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const beforeSeq = toInt(req.query.before_seq, 0) || null;
  const limit = toInt(req.query.limit, 40);
  return res.json(messages.listMessages(found.conversation.id, req.user.id, { beforeSeq, limit }));
});

router.post('/conversations/:id/messages', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!writeGuard(req, res, found.conversation, found.member)) return undefined;
  const body = cleaned(req.body && req.body.body, 4000);
  if (!body) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  const result = messages.sendMessage({
    conversation: found.conversation,
    user: req.user,
    body,
    replyToId: toInt(req.body && req.body.reply_to_id, 0) || null,
    clientMsgId: cleaned(req.body && req.body.client_msg_id, 80) || null
  });
  const view = deliver(found.conversation, result.message, req.user);
  return res.status(201).json({ message: { ...view, mine: true }, duplicate: result.duplicate });
});

router.post('/conversations/:id/messages/image', uploadLimiter, imageUpload('chat'), (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'send_media')) return res.status(403).json({ error: 'Медиа отключены' });
  if (!req.file) return res.status(400).json({ error: 'Выберите изображение' });
  const result = messages.sendMessage({
    conversation: found.conversation,
    user: req.user,
    type: 'image',
    body: cleaned(req.body && req.body.body, 500),
    imagePath: `/uploads/chat/${req.file.filename}`,
    replyToId: toInt(req.body && req.body.reply_to_id, 0) || null,
    clientMsgId: cleaned(req.body && req.body.client_msg_id, 80) || null
  });
  const view = deliver(found.conversation, result.message, req.user);
  return res.status(201).json({ message: { ...view, mine: true } });
});

// The composer posts the recording as the "voice" field, so the multer field must match it.
router.post('/conversations/:id/messages/voice', uploadLimiter, audioUpload('voice', 'voice'), (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'send_media')) return res.status(403).json({ error: 'Медиа отключены' });
  if (!req.file) return res.status(400).json({ error: 'Запишите голосовое' });
  const duration = Math.min(120, Math.max(0, toInt(req.body && req.body.duration, 0)));
  const result = messages.sendMessage({
    conversation: found.conversation,
    user: req.user,
    type: 'voice',
    imagePath: `/uploads/voice/${req.file.filename}`,
    meta: { duration, mime: req.file.mimetype },
    replyToId: toInt(req.body && req.body.reply_to_id, 0) || null
  });
  const view = deliver(found.conversation, result.message, req.user);
  return res.status(201).json({ message: { ...view, mine: true } });
});

router.post('/conversations/:id/messages/video', uploadLimiter, videoUpload('video', 'video'), (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'send_media')) return res.status(403).json({ error: 'Медиа отключены' });
  if (!req.file) return res.status(400).json({ error: 'Выберите видео' });
  const duration = Math.min(600, Math.max(0, toInt(req.body && req.body.duration, 0)));
  const result = messages.sendMessage({
    conversation: found.conversation,
    user: req.user,
    type: 'video',
    imagePath: `/uploads/video/${req.file.filename}`,
    meta: { duration, mime: req.file.mimetype },
    replyToId: toInt(req.body && req.body.reply_to_id, 0) || null
  });
  const view = deliver(found.conversation, result.message, req.user);
  return res.status(201).json({ message: { ...view, mine: true } });
});

// Shares a feed post into a conversation as a tappable card.
router.post('/conversations/:id/messages/post', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!writeGuard(req, res, found.conversation, found.member)) return undefined;
  const post = db.get(
    'SELECT p.*, u.username, u.display_name FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?',
    [toInt(req.body && req.body.post_id, 0)]
  );
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (Number(post.user_id) !== Number(req.user.id)) {
    const author = db.get('SELECT is_banned, shadow_banned FROM users WHERE id = ?', [post.user_id]);
    if (!author || author.is_banned || author.shadow_banned) {
      return res.status(404).json({ error: 'Пост недоступен' });
    }
  }
  const result = messages.sendMessage({
    conversation: found.conversation,
    user: req.user,
    type: 'post',
    body: cleaned(req.body && req.body.caption, 300),
    meta: { post_id: Number(post.id) },
    replyToId: toInt(req.body && req.body.reply_to_id, 0) || null
  });
  const view = deliver(found.conversation, result.message, req.user);
  return res.status(201).json({ message: { ...view, mine: true } });
});

function loadMessage(req, res) {
  const message = db.get('SELECT * FROM messages WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!message) {
    res.status(404).json({ error: 'Сообщение не найдено' });
    return null;
  }
  const member = chat.memberOf(message.conversation_id, req.user.id);
  if (!member || member.banned) {
    res.status(403).json({ error: 'Нет доступа' });
    return null;
  }
  return { message, member };
}

router.patch('/messages/:id', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return undefined;
  const result = messages.editMessage(found.message, req.user.id, cleaned(req.body && req.body.body, 4000));
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  chat.emitToConversation(found.message.conversation_id, 'message:edited', {
    conversation_id: found.message.conversation_id,
    message: messages.messageView(result.message, req.user.id, { sender: chat.userById(req.user.id) })
  });
  return res.json({ message: messages.messageView(result.message, req.user.id, { sender: chat.userById(req.user.id) }) });
});

router.delete('/messages/:id', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return undefined;
  const scope = req.query.scope === 'me' ? 'me' : 'all';
  const result = messages.deleteMessage(found.message, req.user, found.member, scope);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  chat.emitToConversation(found.message.conversation_id, 'message:deleted', {
    conversation_id: found.message.conversation_id,
    id: found.message.id,
    scope
  });
  return res.json(result);
});

router.post('/messages/:id/reactions', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return undefined;
  const result = messages.toggleReaction(found.message, req.user, req.body && req.body.emoji);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  chat.emitToConversation(found.message.conversation_id, 'message:reaction', {
    conversation_id: found.message.conversation_id,
    id: found.message.id,
    reactions: result.reactions
  });
  return res.json(result);
});

router.post('/messages/:id/pin', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return undefined;
  const pinned = !!(req.body && req.body.pinned);
  const result = messages.pinMessage(found.message, req.user, found.member, pinned);
  if (result.error) return res.status(result.status || 403).json({ error: result.error });
  chat.emitToConversation(found.message.conversation_id, 'message:pin', {
    conversation_id: found.message.conversation_id,
    id: found.message.id,
    pinned
  });
  return res.json({ ...result, pinned_messages: messages.pinnedMessages(found.message.conversation_id, req.user.id) });
});

router.post('/messages/forward', (req, res) => {
  const ids = (Array.isArray(req.body && req.body.message_ids) ? req.body.message_ids : [])
    .map((id) => toInt(id, 0))
    .filter(Boolean)
    .slice(0, 20);
  const targets = (Array.isArray(req.body && req.body.conversation_ids) ? req.body.conversation_ids : [])
    .map((id) => toInt(id, 0))
    .filter(Boolean)
    .slice(0, 10);
  if (!ids.length || !targets.length) return res.status(400).json({ error: 'Выберите сообщения и беседы' });
  const created = messages.forwardMessages(ids, targets, req.user);
  return res.json({ ok: true, forwarded: created.length });
});

// Sends one of the user's own gifts into a conversation as a gift card.
router.post('/conversations/:id/gifts', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (found.conversation.type !== 'dm') return res.status(400).json({ error: 'Подарки отправляются в личных чатах' });
  const peer = chat.userById(chat.peerId(found.conversation.id, req.user.id));
  if (!peer) return res.status(404).json({ error: 'Собеседник не найден' });
  const giftRow = db.get('SELECT * FROM user_gifts WHERE id = ? AND user_id = ?', [
    toInt(req.body && req.body.gift_id, 0),
    req.user.id
  ]);
  if (!giftRow) return res.status(404).json({ error: 'Подарок не найден в коллекции' });
  const result = decor.regift(req.user.id, giftRow.id, peer.username);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  const item = giftRow.item_id
    ? db.get('SELECT * FROM shop_items WHERE id = ?', [giftRow.item_id])
    : db.get("SELECT * FROM shop_items WHERE asset_key = ?", [`gift-${giftRow.gift_id}`]);
  const message = messages.sendMessage({
    conversation: found.conversation,
    user: req.user,
    type: 'gift',
    body: JSON.stringify({ item_id: item ? item.id : null, gift: `gift-${giftRow.gift_id}`, message: '' }),
    meta: { item_id: item ? item.id : null, gift: `gift-${giftRow.gift_id}` }
  });
  const view = deliver(found.conversation, message.message, req.user);
  db.run('UPDATE messages SET meta_json = ? WHERE id = ?', [message.message.body, message.message.id]);
  return res.status(201).json({ message: { ...view, mine: true } });
});

router.get('/chat/wallpapers', (req, res) => {
  const row = db.get('SELECT wallpaper FROM chat_wallpapers WHERE user_id = ?', [req.user.id]);
  res.json({ wallpaper: row ? row.wallpaper : 'paper', updated_at: nowIso() });
});

module.exports = router;
