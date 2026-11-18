'use strict';

const db = require('../db');
const { publicUser } = require('../utils/sanitize');
const presence = require('./presence');
const { universityChip, locationLabel } = require('./universities');

// Loads photo rows for a set of users in one query.
function photosFor(userIds) {
  if (!userIds.length) return [];
  return db.all(
    `SELECT id, user_id, path, position FROM photos
     WHERE user_id IN ${db.inClause(userIds.length)}
     ORDER BY position ASC, id ASC`,
    userIds
  );
}

function groupPhotos(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push({ id: row.id, path: row.path, position: row.position });
  }
  return map;
}

// Loads a user together with the university name.
function joinedUser(userId) {
  return db.get(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE u.id = ?`,
    [userId]
  );
}

// Full representation of the signed-in user.
function meView(user) {
  const row = joinedUser(user.id) || user;
  const photos = photosFor([row.id]).map((p) => ({ id: p.id, path: p.path, position: p.position }));
  const view = publicUser(row, {
    photos,
    isOnline: presence.isOnline(row.id),
    includePrivate: true
  });
  view.avatar_path = row.avatar_path || (photos[0] ? photos[0].path : null);
  view.university_chip = universityChip(row);
  view.location = locationLabel(row);
  return view;
}

// Public profile representation for a viewer.
function profileView(target, viewer, photos) {
  const row = target.university_short_name !== undefined || !target.id ? target : joinedUser(target.id) || target;
  const view = publicUser(row, {
    isOnline: presence.isOnline(row.id),
    photos: photos || []
  });
  view.avatar_path = row.avatar_path || (photos && photos[0] ? photos[0].path : null);
  view.university_chip = universityChip(row);
  view.location = locationLabel(row);
  return view;
}

// Compact card used by the swipe deck and like grids.
function cardView(target, viewer, photos) {
  const view = profileView(target, viewer, photos);
  return {
    id: view.id,
    username: view.username,
    display_name: view.display_name,
    age: view.age,
    gender: view.gender,
    city: view.city,
    district: view.district,
    location: view.location,
    university: view.university,
    university_id: view.university_id,
    university_chip: view.university_chip,
    faculty: view.faculty,
    course: view.course,
    course_label: view.course_label,
    bio: view.bio,
    job: view.job,
    education: view.education,
    height: view.height,
    interests: view.interests,
    languages: view.languages,
    looking_for: view.looking_for,
    is_verified: view.is_verified,
    online: view.online,
    last_seen: view.last_seen,
    role: view.role,
    is_demo: view.is_demo,
    photos: view.photos
  };
}

// Joins university columns into a plain user row.
const USER_WITH_UNIVERSITY = `u.*, uni.short_name AS university_short_name, uni.name AS university_name`;

function withUniversity(rows) {
  if (!rows.length) return [];
  return db.all(
    `SELECT u.*, uni.short_name AS university_short_name, uni.name AS university_name
     FROM users u LEFT JOIN universities uni ON uni.id = u.university_id
     WHERE u.id IN ${db.inClause(rows.length)}`,
    rows.map((row) => row.id)
  );
}

function cardsFor(rows, viewer) {
  const enriched = withUniversity(rows);
  const byId = new Map(enriched.map((row) => [row.id, row]));
  const ordered = rows.map((row) => byId.get(row.id) || row);
  const photoMap = groupPhotos(photosFor(ordered.map((r) => r.id)));
  return ordered.map((row) => cardView(row, viewer, photoMap.get(row.id) || []));
}

module.exports = {
  photosFor,
  groupPhotos,
  joinedUser,
  meView,
  profileView,
  cardView,
  cardsFor,
  withUniversity,
  USER_WITH_UNIVERSITY
};
