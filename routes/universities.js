'use strict';

const express = require('express');
const db = require('../db');
const { attachUser } = require('../middleware/auth');
const { universityView } = require('../lib/universities');
const { CITY, DISTRICTS, COURSES } = require('../config');
const { cleaned } = require('../middleware/validate');
const { nowIso } = require('../utils/time');

const router = express.Router();

// Public university list. Needed before registration, so no auth required.
router.get('/', (req, res) => {
  const includeHidden = req.query.include_hidden === '1' && req.user && req.user.role === 'owner';
  const rows = db.all(
    `SELECT * FROM universities ${includeHidden ? '' : 'WHERE is_active = 1'}
     ORDER BY sort_order ASC, name COLLATE NOCASE ASC`
  );
  res.json({
    universities: rows.map(universityView),
    city: CITY,
    districts: DISTRICTS,
    courses: COURSES
  });
});

// A user without a university (after an owner deleted theirs) can request a new one.
router.post('/requests', attachUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
  if (db.getSetting('allow_university_requests', '0') !== '1') {
    return res.status(403).json({ error: 'Заявки на университеты отключены' });
  }
  const name = cleaned(req.body && req.body.name, 120);
  if (name.length < 3) return res.status(400).json({ error: 'Укажите название университета' });
  const duplicate = db.get('SELECT id FROM universities WHERE name = ? COLLATE NOCASE', [name]);
  if (duplicate) return res.status(409).json({ error: 'Такой университет уже есть в списке' });
  const pending = db.get(
    "SELECT id FROM university_requests WHERE user_id = ? AND status = 'new' AND name = ? COLLATE NOCASE",
    [req.user.id, name]
  );
  if (pending) return res.status(409).json({ error: 'Такая заявка уже отправлена' });
  db.run(
    'INSERT INTO university_requests (user_id, name, status, created_at) VALUES (?, ?, ?, ?)',
    [req.user.id, name, 'new', nowIso()]
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
