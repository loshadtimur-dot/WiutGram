'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toInt, clamp, cleaned } = require('../middleware/validate');
const { publicUser } = require('../utils/sanitize');
const { NOT_BLOCKED_SQL } = require('../lib/blocks');
const { decorFor } = require('../lib/decor/service');
const chat = require('../lib/chat/service');

const router = express.Router();
for (const prefix of ['/people', '/chat']) router.use(prefix, requireAuth);

function userCards(rows, viewerId) {
  return rows.map((row) => {
    const decor = decorFor(row.id, viewerId);
    const online = row.last_seen && Date.now() - new Date(row.last_seen).getTime() < 5 * 60 * 1000;
    const dm = chat.findDm(viewerId, row.id);
    return {
      ...publicUser(row, { isOnline: online }),
      status: decor.status,
      banner: decor.banner,
      has_banner: !!decor.banner,
      can_message: !!dm,
      conversation_id: dm ? dm.id : null
    };
  });
}

router.get('/people', (req, res) => {
  const q = cleaned(req.query.q, 60);
  const limit = clamp(toInt(req.query.limit, 24), 1, 50);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const filters = [
    'u.is_banned = 0',
    'u.is_demo = 0',
    'u.hide_from_discovery = 0',
    'u.id != ?',
    NOT_BLOCKED_SQL
  ];
  const params = [req.user.id, req.user.id, req.user.id];
  if (q) {
    filters.push('(u.display_name LIKE ? OR u.username LIKE ? OR u.bio LIKE ? OR u.interests LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (req.query.course) {
    filters.push('u.course = ?');
    params.push(String(req.query.course));
  }
  if (req.query.university_id) {
    filters.push('u.university_id = ?');
    params.push(toInt(req.query.university_id, 0));
  }
  const ageMin = toInt(req.query.age_min, 0);
  const ageMax = toInt(req.query.age_max, 0);
  if (ageMin) {
    filters.push('(julianday(?) - julianday(u.birthdate)) / 365.25 >= ?');
    params.push(new Date().toISOString(), ageMin);
  }
  if (ageMax) {
    filters.push('(julianday(?) - julianday(u.birthdate)) / 365.25 <= ?');
    params.push(new Date().toISOString(), ageMax);
  }
  if (req.query.online === '1') {
    filters.push('u.last_seen >= ?');
    params.push(new Date(Date.now() - 5 * 60 * 1000).toISOString());
  }
  const interests = String(req.query.interests || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 5);
  for (const interest of interests) {
    filters.push('u.interests LIKE ?');
    params.push(`%${interest}%`);
  }
  const rows = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE ${filters.join(' AND ')}
     ORDER BY u.last_seen DESC, u.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit + 1, offset]
  );
  const hasMore = rows.length > limit;
  res.json({
    users: userCards(rows.slice(0, limit), req.user.id),
    has_more: hasMore,
    next_offset: offset + limit
  });
});

router.get('/people/groups', (req, res) => {
  const q = cleaned(req.query.q, 60);
  const filters = ["c.type = 'group'", 'c.deleted_at IS NULL', 'c.is_public = 1'];
  const params = [];
  if (q) {
    filters.push('(c.title LIKE ? OR c.username LIKE ? OR c.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS total
     FROM conversations c WHERE ${filters.join(' AND ')}
     ORDER BY c.members_count DESC LIMIT 30`,
    params
  );
  const groups = rows.map((row) => ({
    id: row.id,
    title: row.title,
    username: row.username,
    photo: row.photo,
    description: row.description,
    members_count: Number(row.total) || 0,
    join_mode: row.join_mode,
    is_member: !!chat.memberOf(row.id, req.user.id)
  }));
  res.json({ groups });
});

// Global search across my conversations and their messages.
router.get('/chat/search', (req, res) => {
  const q = cleaned(req.query.q, 80);
  if (q.length < 2) return res.json({ conversations: [], messages: [] });
  const conversations = db
    .all(
      `SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
       WHERE m.user_id = ? AND c.deleted_at IS NULL AND
         (c.title LIKE ? OR c.username LIKE ? OR c.description LIKE ?)
       ORDER BY c.last_message_at DESC LIMIT 20`,
      [req.user.id, `%${q}%`, `%${q}%`, `%${q}%`]
    )
    .map((row) => chat.conversationView(row, req.user.id));
  const rows = db.all(
    `SELECT msg.*, c.type AS conversation_type, c.title AS conversation_title
     FROM messages msg
     JOIN conversation_members m ON m.conversation_id = msg.conversation_id AND m.user_id = ?
     JOIN conversations c ON c.id = msg.conversation_id
     WHERE msg.deleted_for_all = 0 AND msg.body LIKE ?
     ORDER BY msg.created_at DESC LIMIT 40`,
    [req.user.id, `%${q}%`]
  );
  return res.json({
    conversations,
    messages: rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      conversation_title: row.conversation_title || (row.conversation_type === 'dm' ? 'Диалог' : 'Группа'),
      body: row.body,
      type: row.type,
      created_at: row.created_at
    }))
  });
});

module.exports = router;
