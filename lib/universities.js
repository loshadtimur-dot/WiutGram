'use strict';

const db = require('../db');
const { CITY, COURSE_LABELS } = require('../config');

// Public shape of a university row.
function universityView(row) {
  if (!row) return null;
  return {
    id: row.id,
    short_name: row.short_name,
    name: row.name,
    name_en: row.name_en || '',
    sort_order: row.sort_order,
    is_active: !!row.is_active,
    is_system: !!row.is_system
  };
}

function userUniversityView(row) {
  if (!row || !row.university_id) return null;
  return {
    id: row.university_id,
    short_name: row.university_short_name || null,
    name: row.university_name || null
  };
}

function getUniversity(id) {
  if (!id) return null;
  return db.get('SELECT * FROM universities WHERE id = ?', [id]);
}

function isActiveUniversity(id) {
  if (!id) return false;
  const row = db.get('SELECT id FROM universities WHERE id = ? AND is_active = 1', [id]);
  return !!row;
}

// A public university chip label, e.g. "WIUT · 2 курс".
function universityChip(user) {
  if (!user) return '';
  const short = user.university_short_name || user.university_short || '';
  const course = COURSE_LABELS[user.course] || '';
  if (!short) return '';
  return course ? `${short} · ${course}` : short;
}

function locationLabel(user) {
  if (!user) return CITY;
  if (!user.district || user.hide_district) return CITY;
  return `${CITY}, ${user.district}`;
}

// Select fields that join the university for a user row (alias `u`).
const UNIVERSITY_JOIN = 'LEFT JOIN universities uni ON uni.id = u.university_id';
const UNIVERSITY_FIELDS =
  'uni.short_name AS university_short_name, uni.name AS university_name, uni.is_active AS university_active';

module.exports = {
  universityView,
  userUniversityView,
  getUniversity,
  isActiveUniversity,
  universityChip,
  locationLabel,
  UNIVERSITY_JOIN,
  UNIVERSITY_FIELDS
};
