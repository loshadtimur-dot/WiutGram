'use strict';

const db = require('../../db');
const { nowIso } = require('../../utils/time');
const { deleteUpload } = require('../../utils/files');
const { GIFT_BY_ID, giftArt } = require('../design/gifts');
const { RARITY_LABEL } = require('../design');
const { emitToConversation, memberOf, can, userById, touchConversation } = require('./service');

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function safeJson(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function reactionsFor(messageIds, userId) {
  const map = new Map();
  if (!messageIds.length) return map;
  const rows = db.all(
    `SELECT message_id, emoji, COUNT(*) AS total,
       MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
     FROM message_reactions WHERE message_id IN ${db.inClause(messageIds.length)}
     GROUP BY message_id, emoji`,
    [userId, ...messageIds]
  );
  for (const row of rows) {
    if (!map.has(row.message_id)) map.set(row.message_id, []);
    map.get(row.message_id).push({ emoji: row.emoji, count: Number(row.total), mine: !!row.mine });
  }
  return map;
}

function readCounts(conversationId, senderId, seq) {
  const row = db.get(
    `SELECT COUNT(*) AS total FROM conversation_members
     WHERE conversation_id = ? AND user_id != ? AND last_read_seq >= ?`,
    [conversationId, senderId, seq]
  );
  return Number(row.total) || 0;
}

function giftPayload(body) {
  const meta = safeJson(body);
  const gift = GIFT_BY_ID.get(String(meta.gift || '').replace(/^gift-/, ''));
  if (!gift) return null;
  return {
    id: gift.id,
    name: gift.name,
    rarity: gift.rarity,
    rarity_label: RARITY_LABEL[gift.rarity],
    svg: giftArt(gift.id),
    message: meta.message || ''
  };
}

function messageView(row, userId, options = {}) {
  const mine = Number(row.sender_id) === Number(userId);
  const deleted = !!row.deleted_for_all;
  const reply = row.reply_to_id
    ? db.get('SELECT id, sender_id, type, body, deleted_for_all FROM messages WHERE id = ?', [row.reply_to_id])
    : null;
  const replySender = reply ? userById(reply.sender_id) : null;
  const meta = safeJson(row.meta_json);
  let gift = null;
  let poll = null;
  if (row.type === 'gift' && !deleted) gift = giftPayload(row.body);
  if (row.type === 'poll' && !deleted && meta.poll_id) poll = pollView(meta.poll_id, userId);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    seq: row.seq,
    sender_id: row.sender_id,
    sender: options.sender || null,
    type: row.type,
    body: deleted ? '' : row.type === 'gift' ? '' : row.body,
    image_path: deleted ? null : row.image_path,
    created_at: row.created_at,
    edited_at: row.edited_at || null,
    read_at: row.read_at || null,
    deleted,
    mine,
    reply_to: reply
      ? {
          id: reply.id,
          body: reply.deleted_for_all ? 'Сообщение удалено' : reply.body,
          type: reply.type,
          sender_name: replySender ? replySender.display_name : 'Пользователь'
        }
      : null,
    forward: row.forward_json ? safeJson(row.forward_json) : null,
    reactions: options.reactions || [],
    reader_count: options.readCount !== undefined ? options.readCount : 0,
    gift,
    poll,
    meta: row.type === 'voice' ? { duration: Number(meta.duration) || 0, mime: meta.mime || '' } : null,
    client_msg_id: row.client_msg_id || null
  };
}

function hideForViewer(row, userId) {
  return !!db.get('SELECT 1 AS ok FROM message_deletions WHERE message_id = ? AND user_id = ?', [row.id, userId]);
}

function listMessages(conversationId, userId, { beforeSeq = null, limit = 40 } = {}) {
  const count = Math.min(100, Math.max(1, Number(limit) || 40));
  const params = [conversationId];
  let cursor = '';
  if (beforeSeq) {
    cursor = 'AND seq < ?';
    params.push(Number(beforeSeq));
  }
  const rows = db.all(
    `SELECT * FROM messages WHERE conversation_id = ? ${cursor} ORDER BY seq DESC LIMIT ${count}`,
    params
  );
  const ordered = rows.reverse().filter((row) => !hideForViewer(row, userId));
  const reactions = reactionsFor(
    ordered.map((row) => row.id),
    userId
  );
  const senders = new Map();
  const messages = ordered.map((row) => {
    if (!senders.has(row.sender_id)) senders.set(row.sender_id, userById(row.sender_id));
    return messageView(row, userId, {
      sender: senders.get(row.sender_id),
      reactions: reactions.get(row.id) || [],
      readCount: readCounts(conversationId, row.sender_id, row.seq)
    });
  });
  return {
    messages,
    has_more: rows.length === count,
    next_before: ordered.length ? ordered[0].seq : null
  };
}

function sendMessage({
  conversation,
  user,
  body = '',
  type = 'text',
  imagePath = null,
  replyToId = null,
  clientMsgId = null,
  meta = null
}) {
  return db.tx(() => {
    if (clientMsgId) {
      const existing = db.get('SELECT * FROM messages WHERE conversation_id = ? AND client_msg_id = ?', [
        conversation.id,
        String(clientMsgId).slice(0, 80)
      ]);
      if (existing) return { message: existing, duplicate: true };
    }
    let reply = null;
    if (replyToId) {
      reply = db.get('SELECT id FROM messages WHERE id = ? AND conversation_id = ?', [Number(replyToId), conversation.id]);
    }
    const seqRow = db.get('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE conversation_id = ?', [
      conversation.id
    ]);
    const createdAt = nowIso();
    const result = db.run(
      `INSERT INTO messages
       (conversation_id, seq, sender_id, type, body, image_path, created_at, reply_to_id,
        client_msg_id, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation.id,
        seqRow.seq,
        user.id,
        type,
        String(body || '').slice(0, 4000),
        imagePath,
        createdAt,
        reply ? reply.id : null,
        clientMsgId ? String(clientMsgId).slice(0, 80) : null,
        meta ? JSON.stringify(meta) : null
      ]
    );
    const id = Number(result.lastInsertRowid);
    touchConversation(conversation.id, id, createdAt);
    db.run('UPDATE conversation_members SET last_read_seq = ? WHERE conversation_id = ? AND user_id = ?', [
      seqRow.seq,
      conversation.id,
      user.id
    ]);
    db.run('UPDATE conversations SET deleted_at = NULL WHERE id = ?', [conversation.id]);
    return { message: db.get('SELECT * FROM messages WHERE id = ?', [id]), duplicate: false };
  });
}

function editMessage(message, userId, body) {
  if (Number(message.sender_id) !== Number(userId)) {
    return { error: 'Можно изменять только свои сообщения', status: 403 };
  }
  if (message.deleted_for_all) return { error: 'Сообщение удалено', status: 400 };
  if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MS) {
    return { error: 'Редактировать можно в течение 48 часов', status: 400, code: 'edit_window' };
  }
  if (!String(body || '').trim()) return { error: 'Сообщение не может быть пустым', status: 400 };
  if (message.type !== 'text') return { error: 'Это сообщение нельзя изменить', status: 400 };
  const editedAt = nowIso();
  db.run('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?', [String(body).slice(0, 4000), editedAt, message.id]);
  return { message: db.get('SELECT * FROM messages WHERE id = ?', [message.id]) };
}

function deleteMessage(message, user, member, scope = 'all') {
  const mine = Number(message.sender_id) === Number(user.id);
  const isGroup = member && member.role !== undefined;
  if (scope === 'me') {
    db.run('INSERT OR IGNORE INTO message_deletions (message_id, user_id, created_at) VALUES (?, ?, ?)', [
      message.id,
      user.id,
      nowIso()
    ]);
    return { ok: true, scope: 'me' };
  }
  if (!mine && !(isGroup && can(member, 'delete_messages'))) {
    return { error: 'Нет прав на удаление', status: 403 };
  }
  if (message.image_path) deleteUpload(message.image_path);
  db.run(
    `UPDATE messages SET deleted_for_all = 1, body = '', image_path = NULL, meta_json = NULL
     WHERE id = ?`,
    [message.id]
  );
  return { ok: true, scope: 'all' };
}

function toggleReaction(message, user, emoji) {
  const value = String(emoji || '').slice(0, 16);
  if (!value) return { error: 'Пустая реакция', status: 400 };
  const existing = db.get('SELECT 1 AS ok FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [
    message.id,
    user.id,
    value
  ]);
  if (existing) {
    db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [
      message.id,
      user.id,
      value
    ]);
  } else {
    db.run('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)', [
      message.id,
      user.id,
      value,
      nowIso()
    ]);
  }
  const rows = db.all(
    `SELECT emoji, COUNT(*) AS total, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
     FROM message_reactions WHERE message_id = ? GROUP BY emoji`,
    [user.id, message.id]
  );
  return {
    ok: true,
    reactions: rows.map((row) => ({ emoji: row.emoji, count: Number(row.total), mine: !!row.mine }))
  };
}

function pinMessage(message, user, member, pinned) {
  const isGroup = member && member.role !== undefined;
  if (!isGroup) {
    const conversation = db.get('SELECT type FROM conversations WHERE id = ?', [message.conversation_id]);
    if (conversation && conversation.type === 'dm') {
      // Both sides may pin in a DM.
    }
  }
  if (isGroup && !can(member, 'pin_messages')) return { error: 'Нет прав закреплять сообщения', status: 403 };
  if (pinned) {
    db.run('INSERT OR IGNORE INTO pinned_messages (conversation_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)', [
      message.conversation_id,
      message.id,
      user.id,
      nowIso()
    ]);
  } else {
    db.run('DELETE FROM pinned_messages WHERE conversation_id = ? AND message_id = ?', [
      message.conversation_id,
      message.id
    ]);
  }
  return { ok: true, pinned: !!pinned };
}

function pinnedMessages(conversationId, userId) {
  const rows = db.all(
    `SELECT m.* FROM pinned_messages p JOIN messages m ON m.id = p.message_id
     WHERE p.conversation_id = ? ORDER BY p.pinned_at DESC`,
    [conversationId]
  );
  return rows.map((row) => messageView(row, userId, { sender: userById(row.sender_id) }));
}

function forwardMessages(messageIds, targetIds, user) {
  const created = [];
  const targets = db.all(
    `SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
     WHERE m.user_id = ? AND m.banned = 0 AND c.id IN ${db.inClause(targetIds.length)}`,
    [user.id, ...targetIds]
  );
  for (const conversation of targets) {
    for (const id of messageIds) {
      const source = db.get('SELECT * FROM messages WHERE id = ?', [id]);
      if (!source || source.deleted_for_all) continue;
      const from = userById(source.sender_id);
      const result = sendMessage({
        conversation,
        user,
        body: source.body,
        type: source.type === 'system' ? 'text' : source.type,
        imagePath: source.image_path,
        meta: source.type === 'voice' || source.type === 'gift' ? safeJson(source.meta_json) || null : null
      });
      db.run('UPDATE messages SET forward_json = ? WHERE id = ?', [
        JSON.stringify({ from_user: from ? from.display_name : 'Пользователь', from_id: source.sender_id }),
        result.message.id
      ]);
      created.push(result.message.id);
    }
  }
  return created;
}

/* ---------- Polls ---------- */

function pollView(pollId, userId) {
  const poll = db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
  if (!poll) return null;
  const options = db.all('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY position ASC', [poll.id]);
  const votes = db.all('SELECT option_id, user_id FROM poll_votes WHERE poll_id = ?', [poll.id]);
  const voters = new Set(votes.map((vote) => vote.user_id));
  const mine = new Set(votes.filter((vote) => Number(vote.user_id) === Number(userId)).map((vote) => vote.option_id));
  return {
    id: poll.id,
    question: poll.question,
    is_anonymous: !!poll.is_anonymous,
    multiple: !!poll.multiple,
    closed: !!poll.closed_at,
    total_votes: voters.size,
    my_votes: [...mine],
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      votes: votes.filter((vote) => vote.option_id === option.id).length
    }))
  };
}

function createPoll({ conversation, user, question, options, anonymous = false, multiple = false }) {
  const labels = (Array.isArray(options) ? options : [])
    .map((label) => String(label || '').trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 10);
  const text = String(question || '').trim().slice(0, 200);
  if (text.length < 2 || labels.length < 2) {
    return { error: 'Нужен вопрос и минимум два варианта', status: 400 };
  }
  const pollId = db.tx(() => {
    const now = nowIso();
    const result = db.run(
      `INSERT INTO polls (conversation_id, question, is_anonymous, multiple, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [conversation.id, text, anonymous ? 1 : 0, multiple ? 1 : 0, user.id, now]
    );
    const id = Number(result.lastInsertRowid);
    labels.forEach((label, index) => {
      db.run('INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)', [id, label, index]);
    });
    return id;
  });
  const message = sendMessage({
    conversation,
    user,
    type: 'poll',
    body: text,
    meta: { poll_id: pollId }
  });
  db.run('UPDATE polls SET message_id = ? WHERE id = ?', [message.message.id, pollId]);
  return { message: message.message, poll: pollView(pollId, user.id) };
}

function votePoll(pollId, user, optionIds) {
  const poll = db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
  if (!poll) return { error: 'Опрос не найден', status: 404 };
  if (poll.closed_at) return { error: 'Опрос закрыт', status: 400 };
  const ids = [...new Set((Array.isArray(optionIds) ? optionIds : []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) return { error: 'Выберите вариант', status: 400 };
  if (!poll.multiple && ids.length > 1) return { error: 'Можно выбрать только один вариант', status: 400 };
  const valid = db.all(
    `SELECT id FROM poll_options WHERE poll_id = ? AND id IN ${db.inClause(ids.length)}`,
    [poll.id, ...ids]
  );
  if (valid.length !== ids.length) return { error: 'Некорректный вариант', status: 400 };
  db.tx(() => {
    if (!poll.multiple) db.run('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?', [poll.id, user.id]);
    for (const id of ids) {
      db.run(
        'INSERT OR IGNORE INTO poll_votes (poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        [poll.id, id, user.id, nowIso()]
      );
    }
  });
  return { ok: true, poll: pollView(poll.id, user.id) };
}

module.exports = {
  messageView,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  pinMessage,
  pinnedMessages,
  forwardMessages,
  pollView,
  createPoll,
  votePoll,
  reactionsFor,
  readCounts,
  emitToConversation,
  memberOf
};
