'use strict';

const express = require('express');
const db = require('../db');
const { CITY, DISTRICTS, COURSES } = require('../config');
const { INTERESTS, LANGUAGES } = require('../utils/constants');

const router = express.Router();

// Public bootstrap settings used by the client shell.
router.get('/site', (req, res) => {
  const settings = db.listSettings();
  res.json({
    site_name: settings.site_name || 'Wiutgram',
    registration_open: settings.registration_open === '1',
    maintenance_mode: settings.maintenance_mode === '1',
    welcome_message: settings.welcome_message || '',
    min_age: 16,
    city: CITY,
    allow_university_requests: false,
    owner_telegram: settings.owner_telegram || '',
    gifts_enabled: settings.gifts_enabled !== '0',
    badges_enabled: settings.badges_enabled !== '0',
    banners_enabled: settings.banners_enabled !== '0',
    max_photos: Number(settings.max_photos) || 9,
    max_bio: Number(settings.max_bio) || 500
  });
});

router.get('/reference', (req, res) => {
  const universities = db.all(
    'SELECT id, short_name, name, name_en, is_system FROM universities WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
  );
  res.json({
    city: CITY,
    districts: DISTRICTS,
    courses: COURSES,
    universities,
    interests: INTERESTS,
    languages: LANGUAGES
  });
});

module.exports = router;
