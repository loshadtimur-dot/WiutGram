'use strict';

const express = require('express');
const db = require('../db');
const { attachUser } = require('../middleware/auth');
const { universityView } = require('../lib/universities');
const { CITY, DISTRICTS, COURSES } = require('../config');

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

// Wiutgram belongs to a single campus, so new university requests are closed.
router.post('/requests', attachUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
  return res.status(403).json({
    error: 'Wiutgram создан только для студентов WIUT, заявки на другие университеты закрыты'
  });
});

module.exports = router;
