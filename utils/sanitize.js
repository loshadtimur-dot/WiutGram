'use strict';

const { ageFromBirthdate } = require('./age');
const { CITY, COURSE_LABELS } = require('../config');

function safeJsonArray(value) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch (err) {
    return [];
  }
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

// Public representation of a user row, safe to return to other users.
function publicUser(row, options = {}) {
  if (!row) return null;
  const { isOnline = false, photos = [], includePrivate = false } = options;

  const age = ageFromBirthdate(row.birthdate);
  const user = {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    avatar_path: row.avatar_path,
    gender: row.gender,
    interested_in: row.interested_in,
    looking_for: row.looking_for,
    city: CITY,
    bio: row.bio || '',
    job: row.job || '',
    education: row.education || '',
    height: row.height || null,
    interests: safeJsonArray(row.interests),
    languages: safeJsonArray(row.languages),
    instagram_link: row.instagram_link || '',
    is_verified: !!row.is_verified,
    is_demo: !!row.is_demo,
    age: row.hide_age ? null : age,
    online: row.hide_online ? false : !!isOnline,
    last_seen: row.hide_online ? null : row.last_seen || null,
    distance_km: null,
    university_id: row.university_id || null,
    university: row.university_short_name
      ? { id: row.university_id, short_name: row.university_short_name, name: row.university_name || '' }
      : null,
    faculty: row.faculty || '',
    course: row.course || null,
    course_label: COURSE_LABELS[row.course] || null,
    district: row.hide_district ? null : row.district || null,
    photos: photos
  };

  if (includePrivate) {
    Object.assign(user, {
      email: row.email,
      birthdate: row.birthdate,
      is_incognito: !!row.is_incognito,
      hide_online: !!row.hide_online,
      hide_age: !!row.hide_age,
      hide_distance: !!row.hide_distance,
      hide_district: !!row.hide_district,
      hide_from_discovery: !!row.hide_from_discovery,
      read_receipts: !!row.read_receipts,
      theme: row.theme,
      university_id: row.university_id || null,
      faculty: row.faculty || '',
      course: row.course || null,
      district: row.district || null,
      filter_university_id: row.filter_university_id || null,
      filter_course: row.filter_course || null,
      prefer_my_university: row.prefer_my_university === undefined ? true : !!row.prefer_my_university,
      shadow_banned: !!row.shadow_banned,
      force_password_change: !!row.force_password_change,
      last_ip: row.last_ip || null,
      last_login_at: row.last_login_at || null,
      login_count: row.login_count || 0,
      owner_note: row.owner_note || '',
      token_version: row.token_version || 0,
      ban_until: row.ban_until || null,
      boost_until: row.boost_until,
      last_boost_at: row.last_boost_at,
      super_likes_balance: row.super_likes_balance,
      super_likes_bonus: row.super_likes_bonus || 0,
      super_likes_reset_at: row.super_likes_reset_at,
      filter_age_min: row.filter_age_min,
      filter_age_max: row.filter_age_max,
      filter_distance: row.filter_distance,
      filter_city: row.filter_city,
      created_at: row.created_at,
      onboarding_done: !!row.onboarding_done,
      is_banned: !!row.is_banned,
      ban_reason: row.ban_reason,
      is_demo: !!row.is_demo
    });
  }

  return user;
}

function photoPaths(rows) {
  return rows.map((p) => p.path);
}

function attachPhotos(users, photoRows) {
  const byUser = new Map();
  for (const row of photoRows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push({ id: row.id, path: row.path, position: row.position });
  }
  return users.map((u) => {
    const photos = byUser.get(u.id) || [];
    return publicUser(u, {
      isOnline: u._online,
      distance: u._distance,
      photos,
      includePrivate: u._private
    });
  });
}

// Removes characters that could break markup when text is rendered client-side.
function cleanText(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  // Control characters are stripped on purpose; they break markup and terminal output.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, maxLength).trim();
}

function normalizeList(value, allowed, max) {
  const list = safeJsonArray(value)
    .map((v) => String(v).trim())
    .filter((v) => v && allowed.includes(v));
  const unique = [...new Set(list)];
  return unique.slice(0, max);
}

module.exports = { safeJsonArray, publicUser, photoPaths, attachPhotos, cleanText, normalizeList, pick };
