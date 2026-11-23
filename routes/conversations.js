'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toInt, cleaned } = require('../middleware/validate');
const chat = require('../lib/chat/service');
const messages = require('../lib/chat/messages');
const { nowIso } = require('../utils/time');
const { notify } = require('../lib/notify');

const router = express.Router();
for (const prefix of ['/conversations', '/invites', '/polls']) router.use(prefix, requireAuth);

const WALLPAPERS = ['paper', 'dunes', 'mint', 'ocean', 'dusk', 'night'];

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

function logGroup(conversationId, actorId, action, meta = null, targetUserId = null) {
  db.run(
    'INSERT INTO group_log (conversation_id, actor_id, action, target_user_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [conversationId, actorId, action, targetUserId, meta ? JSON.stringify(meta) : null, nowIso()]
  );
}

/* ---------- Lists and requests ---------- */

router.get('/conversations', (req, res) => {
  const filter = String(req.query.filter || 'all');
  const list = chat.listConversations(req.user.id, { filter });
  // People who follow each other but have no chat yet are shown above the list,
  // so a mutual follow turns into a conversation instead of staying invisible.
  const mutuals = filter === 'all'
    ? db.all(
        `SELECT u.id, u.username, u.display_name, u.avatar_path
         FROM follows f1
         JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
         JOIN users u ON u.id = f1.following_id
         WHERE f1.follower_id = ? AND u.is_banned = 0 AND u.is_demo = 0
           AND NOT EXISTS (
             SELECT 1 FROM conversations c
             JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
             JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = u.id
             WHERE c.type = 'dm' AND c.deleted_at IS NULL
           )
         ORDER BY f1.created_at DESC
         LIMIT 20`,
        [req.user.id, req.user.id]
      )
    : [];
  const settings = db.get('SELECT wallpaper FROM chat_wallpapers WHERE user_id = ?', [req.user.id]);
  res.json({
    conversations: list,
    mutuals,
    requests: chat.listConversations(req.user.id, { filter: 'requests' }).length,
    wallpaper: settings ? settings.wallpaper : 'paper',
    global_mode: db.getSetting('chat_global_mode', 'requests')
  });
});

router.get('/conversations/requests', (req, res) => {
  const rows = db.all(
    `SELECT mr.*, c.title, u.username, u.display_name, u.avatar_path,
       (SELECT body FROM messages m WHERE m.conversation_id = mr.conversation_id ORDER BY seq ASC LIMIT 1) AS first_message
     FROM message_requests mr
     JOIN conversations c ON c.id = mr.conversation_id
     JOIN users u ON u.id = mr.from_user_id
     WHERE mr.to_user_id = ? AND mr.status = 'pending'
     ORDER BY mr.created_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json({ requests: rows });
});

function requestFor(req) {
  return db.get(
    `SELECT * FROM message_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'`,
    [toInt(req.params.id, 0), req.user.id]
  );
}

router.post('/conversations/requests/:id/accept', (req, res) => {
  const request = requestFor(req);
  if (!request) return res.status(404).json({ error: 'Запрос не найден' });
  db.run("UPDATE message_requests SET status = 'accepted', handled_at = ? WHERE id = ?", [nowIso(), request.id]);
  db.run('UPDATE conversation_members SET last_read_seq = 0 WHERE conversation_id = ? AND user_id = ?', [
    request.conversation_id,
    req.user.id
  ]);
  chat.systemMessage(request.conversation_id, 'Запрос на переписку принят', req.user.id);
  notify({
    userId: request.from_user_id,
    type: 'chat',
    actorId: req.user.id,
    refId: request.conversation_id,
    text: 'принял(а) запрос на переписку'
  });
  return res.json({ ok: true });
});

router.post('/conversations/requests/:id/decline', (req, res) => {
  const request = requestFor(req);
  if (!request) return res.status(404).json({ error: 'Запрос не найден' });
  db.run("UPDATE message_requests SET status = 'declined', handled_at = ? WHERE id = ?", [nowIso(), request.id]);
  return res.json({ ok: true });
});

router.post('/conversations/requests/:id/block', (req, res) => {
  const request = requestFor(req);
  if (!request) return res.status(404).json({ error: 'Запрос не найден' });
  db.run("UPDATE message_requests SET status = 'declined', handled_at = ? WHERE id = ?", [nowIso(), request.id]);
  db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', [
    req.user.id,
    request.from_user_id,
    nowIso()
  ]);
  return res.json({ ok: true, blocked: true });
});

/* ---------- Settings and creation ---------- */

router.get('/conversations/settings', (req, res) => {
  const saved = db.get(
    `SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
     WHERE c.type = 'saved' AND m.user_id = ?`,
    [req.user.id]
  );
  const wallpaper = db.get('SELECT wallpaper FROM chat_wallpapers WHERE user_id = ?', [req.user.id]);
  res.json({
    wallpapers: WALLPAPERS,
    wallpaper: wallpaper ? wallpaper.wallpaper : 'paper',
    saved_id: saved ? saved.id : null,
    group_limit: Number(db.getSetting('chat_group_limit', '500')) || 500,
    requests_per_day: Number(db.getSetting('chat_requests_per_day', '5')) || 5,
    global_mode: db.getSetting('chat_global_mode', 'requests')
  });
});

// A member can report a group; the owner and the admin panel see the report.
const GROUP_REPORT_REASONS = ['spam', 'harassment', 'scam', 'fake', 'other'];
const GROUP_REPORT_LABELS = {
  spam: 'спам или реклама',
  harassment: 'оскорбления и травля',
  scam: 'мошенничество',
  fake: 'фейковая группа',
  other: 'другое'
};

router.post('/conversations/:id/report', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const conversation = found.conversation;
  if (conversation.type !== 'group') return res.status(400).json({ error: 'Пожаловаться можно только на группу' });
  const reason = String((req.body && req.body.reason) || '');
  if (!GROUP_REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Выберите причину жалобы' });
  const details = cleaned(req.body && req.body.details, 1000);
  const duplicate = db.get(
    `SELECT id FROM conversation_reports
     WHERE conversation_id = ? AND reporter_id = ? AND status = 'new' AND created_at > ?`,
    [conversation.id, req.user.id, new Date(Date.now() - 24 * 3600 * 1000).toISOString()]
  );
  if (duplicate) return res.status(409).json({ error: 'Жалоба на эту группу уже отправлена' });
  db.run(
    `INSERT INTO conversation_reports (conversation_id, reporter_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, 'new', ?)`,
    [conversation.id, req.user.id, reason, details, nowIso()]
  );
  if (conversation.created_by && conversation.created_by !== req.user.id) {
    notify({
      userId: conversation.created_by,
      type: 'group',
      actorId: req.user.id,
      refId: conversation.id,
      text: `Жалоба на группу «${conversation.title}»: ${GROUP_REPORT_LABELS[reason]}`
    });
  }
  return res.status(201).json({ ok: true, message: 'Жалоба отправлена модераторам' });
});

router.post('/conversations', (req, res) => {
  const result = chat.createGroup(req.user, req.body || {});
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.status(201).json({
    conversation: chat.conversationView(result.conversation, req.user.id, chat.memberOf(result.conversation.id, req.user.id)),
    added: result.added.length
  });
});

router.post('/conversations/dm', (req, res) => {
  const username = cleaned(req.body && req.body.username, 24).toLowerCase().replace(/^@/, '');
  const target = db.get('SELECT id, is_banned, is_demo FROM users WHERE username = ?', [username]);
  if (!target || target.is_banned) return res.status(404).json({ error: 'Пользователь не найден' });
  const result = chat.startDm(req.user.id, target.id);
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  return res.json({
    conversation: chat.conversationView(result.conversation, req.user.id),
    request: result.request
  });
});

router.post('/conversations/saved', (req, res) => {
  const conversation = chat.saveConversation(req.user.id);
  res.json({ conversation: chat.conversationView(conversation, req.user.id) });
});

router.post('/conversations/:id/read', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const seq = Math.max(0, toInt(req.body && req.body.seq, 0));
  const next = seq || Number(db.get('SELECT COALESCE(MAX(seq),0) AS seq FROM messages WHERE conversation_id = ?', [found.conversation.id]).seq);
  db.run('UPDATE conversation_members SET last_read_seq = MAX(last_read_seq, ?) WHERE conversation_id = ? AND user_id = ?', [
    next,
    found.conversation.id,
    req.user.id
  ]);
  chat.emitToConversation(
    found.conversation.id,
    'conversation:read',
    { conversation_id: found.conversation.id, reader_id: req.user.id, seq: next },
    req.user.id
  );
  return res.json({ ok: true, seq: next });
});

router.patch('/conversations/:id/member', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const body = req.body || {};
  const fields = [];
  const params = [];
  if (body.is_pinned !== undefined) {
    const pinned = body.is_pinned ? 1 : 0;
    if (pinned) {
      const total = db.get(
        'SELECT COUNT(*) AS total FROM conversation_members WHERE user_id = ? AND is_pinned = 1',
        [req.user.id]
      ).total;
      if (Number(total) >= 5) return res.status(400).json({ error: 'Можно закрепить не больше 5 чатов' });
    }
    fields.push('is_pinned = ?');
    params.push(pinned);
  }
  if (body.is_archived !== undefined) {
    fields.push('is_archived = ?', 'is_pinned = 0');
    params.push(body.is_archived ? 1 : 0);
  }
  if (body.muted_until !== undefined) {
    fields.push('muted_until = ?');
    params.push(body.muted_until || null);
  }
  if (!fields.length) return res.status(400).json({ error: 'Нет изменений' });
  params.push(found.conversation.id, req.user.id);
  db.run(`UPDATE conversation_members SET ${fields.join(', ')} WHERE conversation_id = ? AND user_id = ?`, params);
  return res.json({ ok: true });
});

router.post('/conversations/:id/pin', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const pinned = !!(req.body && req.body.pinned);
  if (pinned) {
    const total = db.get('SELECT COUNT(*) AS total FROM conversation_members WHERE user_id = ? AND is_pinned = 1', [
      req.user.id
    ]).total;
    if (Number(total) >= 5) return res.status(400).json({ error: 'Можно закрепить не больше 5 чатов' });
  }
  db.run('UPDATE conversation_members SET is_pinned = ? WHERE conversation_id = ? AND user_id = ?', [
    pinned ? 1 : 0,
    found.conversation.id,
    req.user.id
  ]);
  return res.json({ ok: true, pinned });
});

router.post('/conversations/:id/archive', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const archived = req.body && req.body.archived !== undefined ? !!req.body.archived : true;
  db.run('UPDATE conversation_members SET is_archived = ?, is_pinned = 0 WHERE conversation_id = ? AND user_id = ?', [
    archived ? 1 : 0,
    found.conversation.id,
    req.user.id
  ]);
  return res.json({ ok: true, archived });
});

router.post('/conversations/:id/mute', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const hours = Math.max(0, Math.min(24 * 365, toInt(req.body && req.body.hours, 24)));
  const until = hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
  db.run('UPDATE conversation_members SET muted_until = ? WHERE conversation_id = ? AND user_id = ?', [
    until,
    found.conversation.id,
    req.user.id
  ]);
  return res.json({ ok: true, muted_until: until });
});

router.get('/conversations/:id', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  return res.json({
    conversation: chat.conversationView(found.conversation, req.user.id, found.member),
    members: chat.membersOf(found.conversation.id),
    pinned: messages.pinnedMessages(found.conversation.id, req.user.id)
  });
});

router.patch('/conversations/:id', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (found.conversation.type !== 'group') return res.status(400).json({ error: 'Это не группа' });
  if (!chat.can(found.member, 'change_info')) return res.status(403).json({ error: 'Нет прав менять информацию' });
  const body = req.body || {};
  const fields = [];
  const params = [];
  if (body.title !== undefined) {
    const title = cleaned(body.title, 80);
    if (title.length < 2) return res.status(400).json({ error: 'Название слишком короткое' });
    fields.push('title = ?');
    params.push(title);
  }
  if (body.description !== undefined) {
    fields.push('description = ?');
    params.push(cleaned(body.description, 500));
  }
  if (body.photo !== undefined) {
    fields.push('photo = ?');
    params.push(body.photo && String(body.photo).startsWith('/uploads/') ? String(body.photo) : null);
  }
  if (body.slow_mode_sec !== undefined) {
    fields.push('slow_mode_sec = ?');
    params.push(Math.max(0, Math.min(3600, toInt(body.slow_mode_sec, 0))));
  }
  if (body.join_mode !== undefined && ['open', 'approval', 'invite_only'].includes(body.join_mode)) {
    fields.push('join_mode = ?');
    params.push(body.join_mode);
  }
  if (body.username !== undefined) {
    const username = String(body.username || '').toLowerCase().replace(/^@/, '');
    if (username && !/^[a-z0-9._]{4,24}$/.test(username)) {
      return res.status(400).json({ error: 'Адрес: 4–24 символа, латиница, цифры, точка или _' });
    }
    if (username && db.get('SELECT id FROM conversations WHERE username = ? AND id != ?', [username, found.conversation.id])) {
      return res.status(409).json({ error: 'Этот адрес занят' });
    }
    fields.push('username = ?', 'is_public = ?');
    params.push(username || null, username ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: 'Нет изменений' });
  params.push(found.conversation.id);
  db.run(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, params);
  logGroup(found.conversation.id, req.user.id, 'update_info');
  chat.systemMessage(found.conversation.id, `${req.user.display_name} обновил(а) информацию группы`, req.user.id);
  chat.emitToConversation(found.conversation.id, 'conversation:update', { conversation_id: found.conversation.id });
  const updated = chat.conversationById(found.conversation.id);
  return res.json({ conversation: chat.conversationView(updated, req.user.id) });
});

router.delete('/conversations/:id', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (found.conversation.type === 'saved') {
    db.run('DELETE FROM conversations WHERE id = ?', [found.conversation.id]);
    return res.json({ ok: true });
  }
  if (found.conversation.type === 'dm') {
    db.run('UPDATE conversation_members SET is_archived = 1 WHERE conversation_id = ? AND user_id = ?', [
      found.conversation.id,
      req.user.id
    ]);
    return res.json({ ok: true, archived: true });
  }
  db.run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
    found.conversation.id,
    req.user.id
  ]);
  db.run(
    'UPDATE conversations SET members_count = (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?) WHERE id = ?',
    [found.conversation.id, found.conversation.id]
  );
  chat.systemMessage(found.conversation.id, `${req.user.display_name} вышел(ла) из группы`, req.user.id);
  if (found.member.role === 'owner') {
    const next = db.get(
      `SELECT user_id FROM conversation_members WHERE conversation_id = ? AND banned = 0
       ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at ASC LIMIT 1`,
      [found.conversation.id]
    );
    if (next) {
      db.run('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?', [
        'owner',
        found.conversation.id,
        next.user_id
      ]);
    } else {
      db.run('UPDATE conversations SET deleted_at = ? WHERE id = ?', [nowIso(), found.conversation.id]);
    }
  }
  logGroup(found.conversation.id, req.user.id, 'leave');
  return res.json({ ok: true, left: true });
});

/* ---------- Members ---------- */

router.get('/conversations/:id/members', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  return res.json({ members: chat.membersOf(found.conversation.id) });
});

router.post('/conversations/:id/members', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (found.conversation.type !== 'group') return res.status(400).json({ error: 'Это не группа' });
  if (!chat.can(found.member, 'add_members')) return res.status(403).json({ error: 'Нет прав добавлять участников' });
  const limit = Number(db.getSetting('chat_group_limit', '500')) || 500;
  if (found.conversation.members_count >= limit) return res.status(400).json({ error: 'Группа заполнена' });
  const usernames = Array.isArray(req.body && req.body.usernames) ? req.body.usernames.slice(0, 50) : [];
  const added = [];
  for (const name of usernames) {
    const target = db.get('SELECT id, display_name FROM users WHERE username = ? AND is_banned = 0', [
      String(name || '').toLowerCase().replace(/^@/, '')
    ]);
    if (!target) continue;
    if (chat.addMember(found.conversation.id, target.id, { addedBy: req.user.id })) {
      added.push(target.display_name);
      notify({
        userId: target.id,
        type: 'group',
        actorId: req.user.id,
        refId: found.conversation.id,
        text: `Вас добавили в группу «${found.conversation.title}»`
      });
    }
  }
  if (added.length) {
    chat.systemMessage(found.conversation.id, `Добавлены: ${added.join(', ')}`, req.user.id);
    logGroup(found.conversation.id, req.user.id, 'add_members', { count: added.length });
    chat.emitToConversation(found.conversation.id, 'conversation:update', {
      conversation_id: found.conversation.id
    });
  }
  return res.json({ ok: true, added: added.length });
});

router.patch('/conversations/:id/members/:userId', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const targetId = toInt(req.params.userId, 0);
  const isSelf = targetId === req.user.id;
  if (!isSelf && found.member.role !== 'owner' && !(found.member.role === 'admin' && found.member.permissions)) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  const target = chat.memberOf(found.conversation.id, targetId);
  if (!target) return res.status(404).json({ error: 'Участник не найден' });
  const body = req.body || {};
  if (body.muted_until !== undefined && isSelf) {
    db.run('UPDATE conversation_members SET muted_until = ? WHERE conversation_id = ? AND user_id = ?', [
      body.muted_until || null,
      found.conversation.id,
      targetId
    ]);
  }
  if (body.role && !isSelf) {
    if (found.member.role !== 'owner') return res.status(403).json({ error: 'Только владелец группы меняет роли' });
    if (!['admin', 'member'].includes(body.role)) return res.status(400).json({ error: 'Некорректная роль' });
    db.run('UPDATE conversation_members SET role = ?, permissions = ? WHERE conversation_id = ? AND user_id = ?', [
      body.role,
      JSON.stringify(body.permissions || {}),
      found.conversation.id,
      targetId
    ]);
    logGroup(found.conversation.id, req.user.id, 'role', { role: body.role }, targetId);
    notify({ userId: targetId, type: 'group', refId: found.conversation.id, text: `Ваша роль в группе изменена` });
  }
  if (body.permissions && !body.role && !isSelf && found.member.role === 'owner') {
    db.run('UPDATE conversation_members SET permissions = ? WHERE conversation_id = ? AND user_id = ?', [
      JSON.stringify(body.permissions),
      found.conversation.id,
      targetId
    ]);
  }
  return res.json({ ok: true });
});

router.delete('/conversations/:id/members/:userId', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const targetId = toInt(req.params.userId, 0);
  const target = chat.memberOf(found.conversation.id, targetId);
  if (!target) return res.status(404).json({ error: 'Участник не найден' });
  const self = targetId === req.user.id;
  if (!self && found.member.role === 'member') return res.status(403).json({ error: 'Нет прав' });
  if (!self && target.role === 'owner') return res.status(403).json({ error: 'Нельзя исключить владельца' });
  if (self) {
    db.run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
      found.conversation.id,
      req.user.id
    ]);
    db.run(
      'UPDATE conversations SET members_count = (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?) WHERE id = ?',
      [found.conversation.id, found.conversation.id]
    );
    chat.systemMessage(found.conversation.id, `${req.user.display_name} вышел(ла) из группы`, req.user.id);
    return res.json({ ok: true, left: true });
  }
  const ban = !!req.body && !!req.body.ban;
  if (ban) {
    db.run('UPDATE conversation_members SET banned = 1 WHERE conversation_id = ? AND user_id = ?', [
      found.conversation.id,
      targetId
    ]);
  } else {
    db.run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [
      found.conversation.id,
      targetId
    ]);
  }
  db.run(
    'UPDATE conversations SET members_count = (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?) WHERE id = ?',
    [found.conversation.id, found.conversation.id]
  );
  chat.systemMessage(
    found.conversation.id,
    ban ? `${req.user.display_name} заблокировал(а) участника` : `${req.user.display_name} исключил(а) участника`,
    req.user.id
  );
  logGroup(found.conversation.id, req.user.id, ban ? 'ban' : 'kick', null, targetId);
  return res.json({ ok: true });
});

/* ---------- Invites and joining ---------- */

router.post('/conversations/:id/invites', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (found.conversation.type !== 'group') return res.status(400).json({ error: 'Это не группа' });
  if (!chat.can(found.member, 'manage_invites')) return res.status(403).json({ error: 'Нет прав' });
  const days = Math.max(1, Math.min(30, toInt(req.body && req.body.expires_in_days, 7)));
  const maxUses = Math.max(1, Math.min(500, toInt(req.body && req.body.max_uses, 50)));
  const code = chat.inviteCode();
  db.run(
    `INSERT INTO group_invites (code, conversation_id, created_by, expires_at, max_uses, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      code,
      found.conversation.id,
      req.user.id,
      new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
      maxUses,
      nowIso()
    ]
  );
  return res.json({ invite: { code, link: `/join/${code}`, expires_in_days: days, max_uses: maxUses } });
});

router.post('/invites/:code/join', (req, res) => {
  const invite = db.get('SELECT * FROM group_invites WHERE code = ?', [String(req.params.code || '')]);
  if (!invite || invite.revoked) return res.status(404).json({ error: 'Приглашение недействительно' });
  if (invite.expires_at && invite.expires_at <= nowIso()) return res.status(400).json({ error: 'Срок приглашения истёк' });
  if (invite.max_uses && invite.uses >= invite.max_uses) return res.status(400).json({ error: 'Лимит приглашения исчерпан' });
  const conversation = chat.conversationById(invite.conversation_id);
  if (!conversation) return res.status(404).json({ error: 'Группа не найдена' });
  const existing = chat.memberOf(conversation.id, req.user.id);
  if (existing && existing.banned) return res.status(403).json({ error: 'Вы заблокированы в группе' });
  if (!existing) {
    chat.addMember(conversation.id, req.user.id, { addedBy: invite.created_by });
    db.run('UPDATE group_invites SET uses = uses + 1 WHERE id = ?', [invite.id]);
    chat.systemMessage(conversation.id, `${req.user.display_name} присоединился(ась) по ссылке`, req.user.id);
  }
  return res.json({ ok: true, conversation_id: conversation.id });
});

router.post('/conversations/:id/join', (req, res) => {
  const conversation = chat.conversationById(req.params.id);
  if (!conversation || conversation.type !== 'group') return res.status(404).json({ error: 'Группа не найдена' });
  const existing = chat.memberOf(conversation.id, req.user.id);
  if (existing && existing.banned) return res.status(403).json({ error: 'Вы заблокированы в группе' });
  if (existing) return res.json({ ok: true, conversation_id: conversation.id });
  if (conversation.join_mode === 'open') {
    chat.addMember(conversation.id, req.user.id, { addedBy: conversation.created_by });
    chat.systemMessage(conversation.id, `${req.user.display_name} присоединился(ась) к группе`, req.user.id);
    return res.json({ ok: true, joined: true, conversation_id: conversation.id });
  }
  if (conversation.join_mode === 'approval') {
    db.run(
      `INSERT INTO join_requests (conversation_id, user_id, status, created_at) VALUES (?, ?, 'new', ?)
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET status = 'new', created_at = excluded.created_at`,
      [conversation.id, req.user.id, nowIso()]
    );
    if (conversation.created_by) {
      notify({
        userId: conversation.created_by,
        type: 'group',
        actorId: req.user.id,
        refId: conversation.id,
        text: `просит вступить в «${conversation.title}»`
      });
    }
    return res.json({ ok: true, pending: true });
  }
  return res.status(403).json({ error: 'В группу можно попасть только по приглашению' });
});

router.get('/conversations/:id/join-requests', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'add_members')) return res.status(403).json({ error: 'Нет прав' });
  const rows = db.all(
    `SELECT jr.*, u.username, u.display_name, u.avatar_path FROM join_requests jr
     JOIN users u ON u.id = jr.user_id
     WHERE jr.conversation_id = ? AND jr.status = 'new' ORDER BY jr.created_at ASC`,
    [found.conversation.id]
  );
  return res.json({ requests: rows });
});

router.post('/conversations/:id/join-requests/:userId/approve', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'add_members')) return res.status(403).json({ error: 'Нет прав' });
  const userId = toInt(req.params.userId, 0);
  db.run(
    "UPDATE join_requests SET status = 'approved', handled_by = ?, handled_at = ? WHERE conversation_id = ? AND user_id = ?",
    [req.user.id, nowIso(), found.conversation.id, userId]
  );
  chat.addMember(found.conversation.id, userId, { addedBy: req.user.id });
  chat.systemMessage(found.conversation.id, 'Заявка одобрена', req.user.id);
  notify({ userId, type: 'group', refId: found.conversation.id, text: 'Ваша заявка в группу одобрена' });
  return res.json({ ok: true });
});

router.post('/conversations/:id/join-requests/:userId/decline', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'add_members')) return res.status(403).json({ error: 'Нет прав' });
  db.run(
    "UPDATE join_requests SET status = 'declined', handled_by = ?, handled_at = ? WHERE conversation_id = ? AND user_id = ?",
    [req.user.id, nowIso(), found.conversation.id, toInt(req.params.userId, 0)]
  );
  return res.json({ ok: true });
});

/* ---------- Search, polls, wallpaper ---------- */

router.get('/conversations/:id/search', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const q = cleaned(req.query.q, 80);
  if (q.length < 2) return res.json({ messages: [] });
  const rows = db.all(
    `SELECT m.*, u.display_name AS sender_name FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? AND m.deleted_for_all = 0 AND m.body LIKE ?
     ORDER BY m.seq DESC LIMIT 50`,
    [found.conversation.id, `%${q}%`]
  );
  return res.json({
    messages: rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      body: row.body,
      type: row.type,
      created_at: row.created_at,
      sender_name: row.sender_name || ''
    }))
  });
});

router.post('/conversations/:id/polls', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  if (!chat.can(found.member, 'send_messages')) return res.status(403).json({ error: 'Нет прав писать' });
  const result = messages.createPoll({
    conversation: found.conversation,
    user: req.user,
    question: req.body && req.body.question,
    options: req.body && req.body.options,
    anonymous: !!(req.body && req.body.anonymous),
    multiple: !!(req.body && req.body.multiple)
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.status(201).json(result);
});

router.post('/polls/:id/vote', (req, res) => {
  const poll = db.get('SELECT * FROM polls WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!poll) return res.status(404).json({ error: 'Опрос не найден' });
  const member = chat.memberOf(poll.conversation_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Нет доступа' });
  const result = messages.votePoll(poll.id, req.user, req.body && req.body.option_ids);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  chat.emitToConversation(poll.conversation_id, 'poll:update', {
    conversation_id: poll.conversation_id,
    poll: result.poll
  });
  return res.json(result);
});

router.post('/conversations/:id/wallpaper', (req, res) => {
  const wallpaper = String((req.body && req.body.wallpaper) || 'paper');
  if (!WALLPAPERS.includes(wallpaper)) return res.status(400).json({ error: 'Неизвестные обои' });
  db.run(
    `INSERT INTO chat_wallpapers (user_id, wallpaper, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET wallpaper = excluded.wallpaper, updated_at = excluded.updated_at`,
    [req.user.id, wallpaper, nowIso()]
  );
  return res.json({ ok: true, wallpaper });
});

router.post('/conversations/:id/draft', (req, res) => {
  const found = guard(req, res, req.params.id);
  if (!found) return undefined;
  const body = cleaned(req.body && req.body.body, 2000);
  if (!body) {
    db.run('DELETE FROM drafts WHERE user_id = ? AND conversation_id = ?', [req.user.id, found.conversation.id]);
  } else {
    db.run(
      `INSERT INTO drafts (user_id, conversation_id, body, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, conversation_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      [req.user.id, found.conversation.id, body, nowIso()]
    );
  }
  return res.json({ ok: true });
});

module.exports = router;
