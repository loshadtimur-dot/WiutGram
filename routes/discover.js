'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cardsFor } = require('../lib/userView');
const { POST_FIELDS, mapPost } = require('../lib/postView');
const { clamp, toInt } = require('../middleware/validate');
const { SQL_AGE } = require('../utils/age');
const { COURSE_VALUES } = require('../config');
const { nowIso } = require('../utils/time');

const router = express.Router();
router.use(requireAuth);

const VISIBLE = `u.is_banned = 0 AND COALESCE(u.shadow_banned, 0) = 0 AND u.hide_from_discovery = 0`;
const NOT_BLOCKED = `NOT EXISTS (
  SELECT 1 FROM blocks bl
  WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
     OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
)`;

// Candidate deck for the swipe screen.
router.get('/', (req, res) => {
  const me = req.user;
  const limit = clamp(toInt(req.query.limit, 10), 1, 20);
  const genderFilter = me.interested_in === 'everyone' ? null : me.interested_in;
  const universityFilter = req.query.university_id !== undefined
    ? toInt(req.query.university_id, 0) || null
    : me.filter_university_id || null;
  const courseFilter = req.query.course !== undefined
    ? String(req.query.course || '') || null
    : me.filter_course || null;
  const validCourse = courseFilter && COURSE_VALUES.includes(courseFilter) ? courseFilter : null;

  const rows = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name,
       ${SQL_AGE} AS computed_age
     FROM users u
     LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE u.id != ?
       AND ${VISIBLE}
       AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.from_id = ? AND s.to_id = u.id)
       AND ${NOT_BLOCKED}
       AND (? IS NULL OR u.gender = ?)
       AND (u.interested_in = 'everyone' OR u.interested_in = ?)
       AND ${SQL_AGE} BETWEEN ? AND ?
       AND ${SQL_AGE} BETWEEN u.filter_age_min AND u.filter_age_max
       AND (? IS NULL OR u.university_id = ?)
       AND (? IS NULL OR u.course = ?)
     ORDER BY
       CASE WHEN u.boost_until IS NOT NULL AND u.boost_until > ? THEN 0 ELSE 1 END,
       CASE WHEN EXISTS (
         SELECT 1 FROM swipes s2 WHERE s2.from_id = u.id AND s2.to_id = ?
           AND s2.action IN ('like', 'super')
       ) THEN 0 ELSE 1 END,
       CASE WHEN ? = 1 AND ? IS NOT NULL AND u.university_id = ? THEN 0 ELSE 1 END,
       u.last_seen DESC,
       RANDOM()
     LIMIT ?`,
    [
      me.id,
      me.id,
      me.id,
      me.id,
      genderFilter,
      genderFilter,
      me.gender,
      me.filter_age_min || 18,
      me.filter_age_max || 99,
      universityFilter,
      universityFilter,
      validCourse,
      validCourse,
      nowIso(),
      me.id,
      me.prefer_my_university ? 1 : 0,
      me.university_id || null,
      me.university_id || null,
      limit
    ]
  );

  const cards = cardsFor(rows, me).map((card) => {
    const source = rows.find((row) => row.id === card.id);
    return {
      ...card,
      boosted: !!(source && source.boost_until && source.boost_until > nowIso()),
      liked_me: false
    };
  });

  res.json({
    cards,
    filters: {
      age_min: me.filter_age_min,
      age_max: me.filter_age_max,
      university_id: me.filter_university_id || null,
      course: me.filter_course || null,
      interested_in: me.interested_in,
      prefer_my_university: !!me.prefer_my_university
    }
  });
});

// Explore: popular posts and people with optional filters.
router.get('/explore', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 24), 1, 48);
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const q = req.query.q ? `%${String(req.query.q).trim().toLowerCase()}%` : null;
  const interest = req.query.interest ? `%${String(req.query.interest)}%` : null;
  const minAge = clamp(toInt(req.query.min_age, 18), 18, 99);
  const maxAge = clamp(toInt(req.query.max_age, 99), 18, 99);
  const universityFilter = req.query.university_id ? toInt(req.query.university_id, 0) : null;
  const courseFilter = req.query.course && COURSE_VALUES.includes(String(req.query.course))
    ? String(req.query.course)
    : null;

  const filters = [
    VISIBLE,
    NOT_BLOCKED,
    '(? IS NULL OR u.university_id = ?)',
    '(? IS NULL OR u.course = ?)'
  ];
  const params = [req.user.id, req.user.id, universityFilter, universityFilter, courseFilter, courseFilter];

  if (q) {
    filters.push(
      `(${db.textLower}(p.caption) LIKE ? OR ${db.textLower}(u.display_name) LIKE ? OR ${db.textLower}(u.username) LIKE ? OR ${db.textLower}(uni.name) LIKE ?)`
    );
    params.push(q, q, q, q);
  }
  if (interest) {
    filters.push(`${db.textLower}(u.interests) LIKE ?`);
    params.push(interest);
  }
  if (minAge > 18 || maxAge < 99) {
    filters.push(`${SQL_AGE} BETWEEN ? AND ?`);
    params.push(minAge, maxAge);
  }

  const rows = db.all(
    `SELECT ${POST_FIELDS} FROM posts p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE ${filters.join(' AND ')}
     ORDER BY (
       (SELECT COUNT(*) FROM post_likes pl3 WHERE pl3.post_id = p.id) * 3 + p.views_count
     ) DESC, p.created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, ...params, limit, offset]
  );

  const people = db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u
     LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE u.id != ? AND ${VISIBLE} AND ${NOT_BLOCKED}
     ORDER BY (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) DESC,
              (SELECT COUNT(*) FROM swipes s WHERE s.to_id = u.id) DESC
     LIMIT 12`,
    [req.user.id, req.user.id, req.user.id]
  );

  res.json({
    posts: rows.map(mapPost),
    people: cardsFor(people, req.user),
    has_more: rows.length === limit
  });
});

module.exports = router;
