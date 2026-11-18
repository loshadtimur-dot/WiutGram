'use strict';

const db = require('../db');
const { nowIso } = require('../utils/time');

function orderedPair(a, b) {
  return Number(a) < Number(b) ? [Number(a), Number(b)] : [Number(b), Number(a)];
}

function findMatch(a, b) {
  const [userA, userB] = orderedPair(a, b);
  return db.get('SELECT * FROM matches WHERE user_a = ? AND user_b = ?', [userA, userB]);
}

function otherId(match, meId) {
  return Number(match.user_a) === Number(meId) ? match.user_b : match.user_a;
}

// Returns the match with the other participant's public row, or null when absent.
function matchForUser(matchId, userId) {
  const match = db.get('SELECT * FROM matches WHERE id = ?', [Number(matchId)]);
  if (!match) return null;
  if (match.user_a !== Number(userId) && match.user_b !== Number(userId)) return null;
  const other = db.get('SELECT * FROM users WHERE id = ?', [otherId(match, userId)]);
  if (!other) return null;
  return { match, other };
}

// Creates (or revives) a match between two users. Returns { match, created }.
function ensureMatch(a, b) {
  const [userA, userB] = orderedPair(a, b);
  const existing = db.get('SELECT * FROM matches WHERE user_a = ? AND user_b = ?', [userA, userB]);
  if (existing) {
    if (!existing.is_active) {
      db.run('UPDATE matches SET is_active = 1 WHERE id = ?', [existing.id]);
      existing.is_active = 1;
    }
    return { match: existing, created: false };
  }
  const createdAt = nowIso();
  const result = db.run(
    'INSERT INTO matches (user_a, user_b, created_at, is_active) VALUES (?, ?, ?, 1)',
    [userA, userB, createdAt]
  );
  return {
    match: {
      id: Number(result.lastInsertRowid),
      user_a: userA,
      user_b: userB,
      created_at: createdAt,
      is_active: 1
    },
    created: true
  };
}

function matchDateLabel(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = { findMatch, ensureMatch, matchForUser, otherId, orderedPair, matchDateLabel };
