'use strict';

const crypto = require('crypto');
const db = require('../../db');
const { nowIso } = require('../../utils/time');
const { notify } = require('../notify');
const { emitToUser } = require('../io');
const { isBlockedBetween } = require('../blocks');
const { decorFor } = require('../decor/service');

const DEFAULT_PERMISSIONS = {
  member: { send_messages: true, send_media: true },
  admin: {
    send_messages: true,
    send_media: true,
    add_members: true,
    delete_messages: true,
    pin_messages: true,
    change_info: true,
    manage_invites: true
  },
  owner: {
    send_messages: true,
    send_media: true,
    add_members: true,
    delete_messages: true,
    pin_messages: true,
    change_info: true,
    manage_invites: true,
    manage_admins: true
  }
};

const USER_FIELDS = 'id, username, display_name, avatar_path, is_verified, role, last_seen, hide_online';

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

function memberOf(conversationId, userId) {
  return db.get('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
    Number(conversationId) || 0,
    Number(userId) || 0
  ]);
}

function conversationById(id) {
  return db.get('SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL', [Number(id) || 0]);
}

function memberPermissions(member) {
  const defaults = DEFAULT_PERMISSIONS[member.role] || DEFAULT_PERMISSIONS.member;
  return { ...defaults, ...parseJson(member.permissions, {}) };
}

function can(member, permission) {
  if (!member) return false;
  return !!memberPermissions(member)[permission];
}

function isMemberBanned(member) {
  return !member || !!member.banned;
}

function userById(id) {
  return db.get(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [id]);
}

function peerId(conversationId, userId) {
  const row = db.get(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ? LIMIT 1',
    [conversationId, userId]
  );
  return row ? row.user_id : null;
}

function displayTitle(conversation, userId) {
  if (conversation.type === 'dm') {
    const peer = userById(peerId(conversation.id, userId));
    return peer ? peer.display_name : 'Диалог';
  }
  if (conversation.type === 'saved') return 'Избранное';
  return conversation.title || 'Группа';
}

function displayPhoto(conversation, userId) {
  if (conversation.type === 'dm') {
    const peer = userById(peerId(conversation.id, userId));
    return peer ? peer.avatar_path : null;
  }
  return conversation.photo || null;
}

function lastMessageView(conversation) {
  if (!conversation.last_message_id) return null;
  const row = db.get('SELECT * FROM messages WHERE id = ?', [conversation.last_message_id]);
  if (!row || row.deleted_for_all) {
    return {
      id: conversation.last_message_id,
      type: 'system',
      body: 'Сообщение удалено',
      sender_id: null,
      created_at: conversation.last_message_at,
      deleted: true
    };
  }
  return {
    id: row.id,
    seq: row.seq,
    type: row.type,
    body: row.type === 'image' ? 'Фото' : row.body,
    sender_id: row.sender_id,
    created_at: row.created_at,
    deleted: false
  };
}

function unreadCount(conversationId, member) {
  const row = db.get(
    `SELECT COUNT(*) AS total FROM messages
     WHERE conversation_id = ? AND seq > ? AND sender_id != ? AND deleted_for_all = 0`,
    [conversationId, Number(member.last_read_seq) || 0, member.user_id]
  );
  return Number(row.total) || 0;
}

function pendingRequest(conversationId, userId) {
  return db.get(
    "SELECT * FROM message_requests WHERE conversation_id = ? AND to_user_id = ? AND status = 'pending'",
    [conversationId, userId]
  );
}

function conversationView(conversation, userId, member = null, options = {}) {
  const own = member || memberOf(conversation.id, userId);
  const peer = conversation.type === 'dm' ? userById(peerId(conversation.id, userId)) : null;
  const decor = peer ? decorFor(peer.id, userId) : null;
  return {
    id: conversation.id,
    type: conversation.type,
    title: displayTitle(conversation, userId),
    username: conversation.username || null,
    photo: displayPhoto(conversation, userId),
    description: conversation.description || '',
    is_public: !!conversation.is_public,
    join_mode: conversation.join_mode,
    slow_mode_sec: conversation.slow_mode_sec,
    members_count: conversation.members_count,
    role: own ? own.role : null,
    permissions: own ? memberPermissions(own) : {},
    pinned: own ? !!own.is_pinned : false,
    archived: own ? !!own.is_archived : false,
    muted: own && own.muted_until ? own.muted_until > nowIso() : false,
    unread: own ? unreadCount(conversation.id, own) : 0,
    last_read_seq: own ? own.last_read_seq : 0,
    last_message: lastMessageView(conversation),
    last_message_at: conversation.last_message_at || conversation.created_at,
    created_at: conversation.created_at,
    peer,
    peer_status: decor ? decor.status : null,
    request_pending: own ? !!pendingRequest(conversation.id, userId) : false,
    can_write: own ? can(own, 'send_messages') && !own.banned : false,
    ...options
  };
}

function listConversations(userId, { filter = 'all' } = {}) {
  const filters = ['c.deleted_at IS NULL', 'm.user_id = ?', 'm.banned = 0'];
  const params = [userId];
  if (filter === 'dm') filters.push("c.type = 'dm'");
  if (filter === 'group') filters.push("c.type = 'group'");
  if (filter === 'saved') filters.push("c.type = 'saved'");
  if (filter === 'archived') {
    filters.push('m.is_archived = 1');
  } else if (filter !== 'all') {
    filters.push('m.is_archived = 0');
  }
  const rows = db.all(
    `SELECT c.* FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id
     WHERE ${filters.join(' AND ')}
     ORDER BY m.is_pinned DESC, COALESCE(c.last_message_at, c.created_at) DESC
     LIMIT 200`,
    params
  );
  const views = rows.map((row) => conversationView(row, userId, memberOf(row.id, userId)));
  if (filter === 'unread') return views.filter((view) => view.unread > 0);
  if (filter === 'requests') return views.filter((view) => view.request_pending);
  return views;
}

function touchConversation(conversationId, messageId, createdAt) {
  db.run('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?', [
    messageId,
    createdAt,
    conversationId
  ]);
}

/* ---------- Conversation creation ---------- */

function addMember(conversationId, userId, { role = 'member', addedBy = null, permissions = null } = {}) {
  const now = nowIso();
  const result = db.run(
    `INSERT OR IGNORE INTO conversation_members
     (conversation_id, user_id, role, permissions, joined_at, last_read_seq, added_by)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [conversationId, userId, role, JSON.stringify(permissions || {}), now, addedBy]
  );
  if (result.changes) {
    db.run('UPDATE conversation_members SET banned = 0 WHERE conversation_id = ? AND user_id = ?', [
      conversationId,
      userId
    ]);
    db.run(
      'UPDATE conversations SET members_count = (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?) WHERE id = ?',
      [conversationId, conversationId]
    );
  }
  return result.changes > 0;
}

function saveConversation(userId, title, photo, description) {
  const existing = db.get(
    `SELECT c.* FROM conversations c
     JOIN conversation_members m ON m.conversation_id = c.id
     WHERE c.type = 'saved' AND m.user_id = ? LIMIT 1`,
    [userId]
  );
  if (existing) return existing;
  const now = nowIso();
  const result = db.run(
    `INSERT INTO conversations (type, title, photo, description, created_by, members_count, created_at)
     VALUES ('saved', ?, ?, ?, ?, 1, ?)`,
    [title || 'Избранное', photo || null, description || '', userId, now]
  );
  const id = Number(result.lastInsertRowid);
  addMember(id, userId, { role: 'owner', addedBy: userId });
  return db.get('SELECT * FROM conversations WHERE id = ?', [id]);
}

function findDm(userA, userB) {
  return db.get(
    `SELECT c.* FROM conversations c
     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
     WHERE c.type = 'dm' AND c.deleted_at IS NULL
     ORDER BY c.id ASC LIMIT 1`,
    [userA, userB]
  );
}

function matchBetween(userA, userB) {
  return db.get(
    `SELECT * FROM matches WHERE is_active = 1
     AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))`,
    [userA, userB, userB, userA]
  );
}

// Matches open a DM immediately; strangers go through a message request unless
// the owner allows open messaging.
function startDm(userId, targetId) {
  const target = userById(targetId);
  if (!target) return { error: 'Пользователь не найден', status: 404 };
  if (target.id === userId) return { error: 'Нельзя написать самому себе', status: 400 };
  if (isBlockedBetween(userId, targetId)) return { error: 'Пользователь недоступен', status: 403 };
  const existing = findDm(userId, targetId);
  if (existing) {
    const member = memberOf(existing.id, userId);
    if (member && member.banned) return { error: 'Вы не можете писать в этот диалог', status: 403 };
    return { conversation: existing, request: !!pendingRequest(existing.id, userId) };
  }
  const now = nowIso();
  const isMatch = !!matchBetween(userId, targetId);
  const mode = db.getSetting('chat_global_mode', 'requests');
  if (!isMatch && mode === 'matches') {
    return { error: 'Писать можно только матчам. Поставьте лайк — при взаимности чат откроется.', status: 403, code: 'matches_only' };
  }
  const result = db.run(
    `INSERT INTO conversations (type, created_by, members_count, created_at)
     VALUES ('dm', ?, 2, ?)`,
    [userId, now]
  );
  const id = Number(result.lastInsertRowid);
  addMember(id, userId, { role: 'member', addedBy: userId });
  addMember(id, targetId, { role: 'member', addedBy: userId });
  const needsRequest = !isMatch && mode !== 'all';
  if (needsRequest) {
    db.run(
      `INSERT INTO message_requests (conversation_id, from_user_id, to_user_id, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
      [id, userId, targetId, now]
    );
  }
  return { conversation: db.get('SELECT * FROM conversations WHERE id = ?', [id]), request: needsRequest };
}

function createGroup(user, payload) {
  const title = String(payload.title || '').trim().slice(0, 80);
  if (title.length < 2) return { error: 'Укажите название группы', status: 400 };
  const limit = Number(db.getSetting('chat_group_limit', '500')) || 500;
  const usernames = Array.isArray(payload.usernames) ? payload.usernames.slice(0, limit - 1) : [];
  const isPublic = !!payload.is_public;
  let username = null;
  if (isPublic) {
    username = String(payload.username || '').toLowerCase().replace(/^@/, '').trim();
    if (!/^[a-z0-9._]{4,24}$/.test(username)) {
      return { error: 'Публичный адрес: 4–24 символа, латиница, цифры, точка или _', status: 400 };
    }
    if (db.get('SELECT id FROM conversations WHERE username = ?', [username])) {
      return { error: 'Этот адрес уже занят', status: 409 };
    }
  }
  const joinMode = ['open', 'approval', 'invite_only'].includes(payload.join_mode)
    ? payload.join_mode
    : 'invite_only';
  const slow = Math.max(0, Math.min(3600, Number(payload.slow_mode_sec) || 0));
  const now = nowIso();
  const result = db.run(
    `INSERT INTO conversations
     (type, title, username, description, created_by, is_public, join_mode, slow_mode_sec, members_count, created_at)
     VALUES ('group', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [title, username, String(payload.description || '').slice(0, 500), user.id, isPublic ? 1 : 0, joinMode, slow, now]
  );
  const id = Number(result.lastInsertRowid);
  addMember(id, user.id, { role: 'owner', addedBy: user.id });
  const added = [];
  for (const name of usernames) {
    const target = db.get('SELECT id FROM users WHERE username = ? AND is_banned = 0', [
      String(name || '').toLowerCase()
    ]);
    if (!target || target.id === user.id) continue;
    if (addMember(id, target.id, { role: 'member', addedBy: user.id })) {
      added.push(target.id);
      notify({ userId: target.id, type: 'group', actorId: user.id, refId: id, text: `Вас добавили в группу «${title}»` });
    }
  }
  systemMessage(id, `${user.display_name} создал(а) группу`, user.id);
  if (added.length) systemMessage(id, `Добавлены участники: ${added.length}`, user.id);
  db.run(
    'INSERT INTO group_log (conversation_id, actor_id, action, meta, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, user.id, 'create', JSON.stringify({ title, members: added.length }), now]
  );
  return { conversation: db.get('SELECT * FROM conversations WHERE id = ?', [id]), added };
}

function systemMessage(conversationId, text, actorId = null) {
  if (!actorId) return null;
  const seqRow = db.get('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE conversation_id = ?', [
    conversationId
  ]);
  const createdAt = nowIso();
  const result = db.run(
    `INSERT INTO messages (conversation_id, seq, sender_id, type, body, created_at)
     VALUES (?, ?, ?, 'system', ?, ?)`,
    [conversationId, seqRow.seq, actorId || 0, text, createdAt]
  );
  touchConversation(conversationId, Number(result.lastInsertRowid), createdAt);
  return Number(result.lastInsertRowid);
}

function membersOf(conversationId) {
  const rows = db.all(
    `SELECT m.*, u.username, u.display_name, u.avatar_path, u.role AS account_role, u.last_seen, u.hide_online
     FROM conversation_members m JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ? ORDER BY
       CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name COLLATE NOCASE`,
    [conversationId]
  );
  return rows.map((row) => ({
    user: {
      id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_path: row.avatar_path,
      is_owner: row.account_role === 'owner',
      last_seen: row.last_seen,
      hide_online: !!row.hide_online
    },
    role: row.role,
    permissions: memberPermissions(row),
    joined_at: row.joined_at,
    banned: !!row.banned,
    last_read_seq: row.last_read_seq
  }));
}

function emitToConversation(conversationId, event, payload, exceptUserId = null) {
  const rows = db.all('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND banned = 0', [
    conversationId
  ]);
  for (const row of rows) {
    if (exceptUserId && Number(row.user_id) === Number(exceptUserId)) continue;
    emitToUser(row.user_id, event, payload);
  }
}

function inviteCode() {
  return crypto.randomBytes(9).toString('base64url');
}

module.exports = {
  DEFAULT_PERMISSIONS,
  memberOf,
  conversationById,
  memberPermissions,
  can,
  isMemberBanned,
  userById,
  peerId,
  conversationView,
  listConversations,
  addMember,
  saveConversation,
  findDm,
  startDm,
  createGroup,
  systemMessage,
  membersOf,
  emitToConversation,
  touchConversation,
  pendingRequest,
  inviteCode,
  parseJson,
  displayTitle
};
