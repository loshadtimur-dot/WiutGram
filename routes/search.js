'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cardsFor } = require('../lib/userView');
const { clamp, toInt, cleaned } = require('../middleware/validate');
const { ageFromBirthdate } = require('../utils/age');
const { INTERESTS } = require('../utils/constants');
const { COURSE_VALUES } = require('../config');

const router = express.Router();
router.use(requireAuth);

const INTEREST_LABELS = new Map(INTERESTS.map((i) => [i.id, i.label.toLowerCase()]));
const foldLike = (value) => `%${String(value).toLowerCase()}%`;
const VISIBLE = 'u.is_banned = 0 AND COALESCE(u.shadow_banned, 0) = 0 AND u.hide_from_discovery = 0';
const NOT_BLOCKED = `NOT EXISTS (
  SELECT 1 FROM blocks bl
  WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
     OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
)`;

// Users matching a free text query (name, username, university, interests).
router.get('/', (req, res) => {
  const query = cleaned(req.query.q, 60).trim();
  const limit = clamp(toInt(req.query.limit, 20), 1, 50);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const universityId = req.query.university_id ? toInt(req.query.university_id, 0) : null;
  const course = req.query.course && COURSE_VALUES.includes(String(req.query.course))
    ? String(req.query.course)
    : null;
  if (query.length < 1 && !universityId && !course) return res.json({ users: [], total: 0 });

  const like = foldLike(query);
  const filters = [
    'u.id != ?',
    VISIBLE,
    NOT_BLOCKED,
    '(? IS NULL OR u.university_id = ?)',
    '(? IS NULL OR u.course = ?)'
  ];
  const params = [req.user.id, req.user.id, req.user.id, universityId, universityId, course, course];
  if (query.length >= 1) {
    filters.push(
      `(${db.textLower}(u.display_name) LIKE ? OR ${db.textLower}(u.username) LIKE ?
        OR ${db.textLower}(COALESCE(u.interests, '')) LIKE ? OR ${db.textLower}(uni.name) LIKE ?
        OR ${db.textLower}(uni.short_name) LIKE ?)`
    );
    params.push(like, like, like, like, like);
  }

  const rows = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE ${filters.join(' AND ')}
     ORDER BY u.is_verified DESC, u.last_seen DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = db.get(
    `SELECT COUNT(*) AS total FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE ${filters.join(' AND ')}`,
    params
  );

  res.json({ users: cardsFor(rows, req.user), total: total ? total.total : 0 });
});

// Lightweight suggestions for the search dropdown.
router.get('/suggest', (req, res) => {
  const query = cleaned(req.query.q, 40).trim();
  if (query.length < 1) return res.json({ suggestions: [] });
  const like = foldLike(query);
  const rows = db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar_path, u.is_verified, u.university_id,
       uni.short_name AS university_short_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE u.id != ? AND ${VISIBLE}
       AND (${db.textLower}(u.display_name) LIKE ? OR ${db.textLower}(u.username) LIKE ?
            OR ${db.textLower}(uni.name) LIKE ? OR ${db.textLower}(uni.short_name) LIKE ?)
     ORDER BY u.is_verified DESC, u.last_seen DESC
     LIMIT 6`,
    [req.user.id, like, like, like, like]
  );
  const interests = INTERESTS.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 3)
    .map((i) => ({ type: 'interest', id: i.id, label: i.label }));

  const universities = db.all(
    `SELECT id, short_name, name FROM universities
     WHERE is_active = 1 AND (${db.textLower}(name) LIKE ? OR ${db.textLower}(short_name) LIKE ?)
     LIMIT 3`,
    [like, like]
  );

  res.json({
    suggestions: [
      ...rows.map((u) => ({
        type: 'user',
        ...u,
        title: u.display_name,
        subtitle: `@${u.username}${u.university_short_name ? ` · ${u.university_short_name}` : ''}`
      })),
      ...universities.map((u) => ({
        type: 'university',
        id: u.id,
        label: `${u.short_name} — ${u.name}`
      })),
      ...interests
    ]
  });
});

// People suggestions shown on the explore screen.
router.get('/people', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 12), 1, 40);
  const rows = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE u.id != ? AND ${VISIBLE} AND ${NOT_BLOCKED}
     ORDER BY (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) DESC, RANDOM()
     LIMIT ?`,
    [req.user.id, req.user.id, req.user.id, limit]
  );
  const cards = cardsFor(rows, req.user);
  const withAge = cards.map((card, index) => ({
    ...card,
    age: card.age || ageFromBirthdate(rows[index].birthdate)
  }));
  res.json({ users: withAge });
});

module.exports = router;
module.exports.INTEREST_LABELS = INTEREST_LABELS;
