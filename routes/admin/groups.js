'use strict';

const express = require('express');
const db = require('../../db');
const { adminLog } = require('../../lib/activity');
const { requireSudo } = require('../../middleware/auth');
const { toInt, cleaned, clamp } = require('../../middleware/validate');
const { nowIso } = require('../../utils/time');
const { emitToUser } = require('../../lib/io');
const { notify } = require('../../lib/notify');

const router = express.Router();

router.get('/', (req, res) => {
  const q = cleaned(req.query.q, 60);
  const filters = ["c.type = 'group'"];
  const params = [];
  if (q) {
    filters.push('(c.title LIKE ? OR c.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (req.query.blocked === '1') filters.push('c.deleted_at IS NOT NULL');
  else filters.push('c.deleted_at IS NULL');
  const rows = db.all(
    `SELECT c.*, owner.username AS owner_username, owner.display_name AS owner_name,
       (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS members,
       (SELECT COUNT(*) FROM conversation_reports r WHERE r.conversation_id = c.id AND r.status = 'new') AS reports
     FROM conversations c
     LEFT JOIN users owner ON owner.id = c.created_by
     WHERE ${filters.join(' AND ')}
     ORDER BY c.created_at DESC LIMIT ?`,
    [...params, clamp(toInt(req.query.limit, 100), 1, 200)]
  );
  res.json({
    groups: rows.map((row) => ({
      id: row.id,
      title: row.title,
      username: row.username,
      photo: row.photo,
      description: row.description,
      is_public: !!row.is_public,
      join_mode: row.join_mode,
      members: Number(row.members) || 0,
      reports: Number(row.reports) || 0,
      created_at: row.created_at,
      blocked: !!row.deleted_at,
      owner: row.owner_username
        ? { id: row.created_by, username: row.owner_username, display_name: row.owner_name }
        : null
    }))
  });
});

router.get('/reports', (req, res) => {
  const rows = db.all(
    `SELECT r.*, u.username AS reporter_username, c.title AS conversation_title,
       c.username AS conversation_username, m.body AS message_body, m.type AS message_type
     FROM conversation_reports r
     JOIN users u ON u.id = r.reporter_id
     JOIN conversations c ON c.id = r.conversation_id
     LEFT JOIN messages m ON m.id = (SELECT message_id FROM message_reports mr WHERE mr.id = r.id)
     ORDER BY CASE r.status WHEN 'new' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`
  );
  res.json({ reports: rows });
});

router.post('/reports/:id/status', (req, res) => {
  const status = ['new', 'reviewed', 'dismissed'].includes(String(req.body && req.body.status))
    ? String(req.body.status)
    : 'reviewed';
  const result = db.run(
    'UPDATE conversation_reports SET status = ?, handled_by = ? WHERE id = ?',
    [status, req.user.id, toInt(req.params.id, 0)]
  );
  if (!result.changes) return res.status(404).json({ error: 'Жалоба не найдена' });
  adminLog(req, 'group_report_status', `group_report:${req.params.id}`, { meta: { status } });
  return res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const group = db.get(
    `SELECT c.*, owner.username AS owner_username FROM conversations c
     LEFT JOIN users owner ON owner.id = c.created_by WHERE c.id = ? AND c.type = 'group'`,
    [toInt(req.params.id, 0)]
  );
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  const members = db.all(
    `SELECT m.role, m.joined_at, m.banned, u.id, u.username, u.display_name, u.avatar_path
     FROM conversation_members m JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
    [group.id]
  );
  const log = db.all(
    `SELECT g.*, u.username FROM group_log g LEFT JOIN users u ON u.id = g.actor_id
     WHERE g.conversation_id = ? ORDER BY g.id DESC LIMIT 50`,
    [group.id]
  );
  const reports = db.all(
    `SELECT r.*, u.username AS reporter_username FROM conversation_reports r
     JOIN users u ON u.id = r.reporter_id WHERE r.conversation_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    [group.id]
  );
  const stats = {
    messages: db.get('SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?', [group.id]).total,
    members: members.filter((member) => !member.banned).length
  };
  return res.json({
    group: {
      id: group.id,
      title: group.title,
      username: group.username,
      description: group.description,
      photo: group.photo,
      is_public: !!group.is_public,
      join_mode: group.join_mode,
      created_at: group.created_at,
      blocked: !!group.deleted_at,
      owner: group.owner_username
    },
    members,
    log,
    reports,
    stats
  });
});

router.post('/:id/block', requireSudo, (req, res) => {
  const group = db.get("SELECT * FROM conversations WHERE id = ? AND type = 'group'", [toInt(req.params.id, 0)]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  const reason = cleaned(req.body && req.body.reason, 300);
  const block = req.body && req.body.block !== false;
  db.run('UPDATE conversations SET deleted_at = ? WHERE id = ?', [block ? nowIso() : null, group.id]);
  const members = db.all('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [group.id]);
  for (const member of members) {
    notify({
      userId: member.user_id,
      type: 'group',
      refId: group.id,
      text: block ? `Группа «${group.title}» заблокирована модерацией${reason ? `: ${reason}` : ''}` : 'Группа снова доступна'
    });
    emitToUser(member.user_id, 'conversation:update', { conversation_id: group.id });
  }
  adminLog(req, block ? 'group_block' : 'group_unblock', `group:${group.id}`, { meta: { reason } });
  return res.json({ ok: true, blocked: block });
});

module.exports = router;
