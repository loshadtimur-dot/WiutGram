'use strict';

const db = require('../db');
const { nowIso } = require('../utils/time');

const SUPER_LIKES_PER_DAY = 5;
const BOOST_DURATION_MS = 30 * 60 * 1000;
const BOOST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function sameUtcDay(a, b) {
  if (!a) return false;
  return String(a).slice(0, 10) === String(b).slice(0, 10);
}

function dailyBalance(user) {
  return Math.max(0, Number(user.super_likes_balance) || 0);
}

// Purchased super likes never expire with the daily refill.
function bonusBalance(user) {
  return Math.max(0, Number(user.super_likes_bonus) || 0);
}

function totalSuperLikes(user) {
  return dailyBalance(user) + bonusBalance(user);
}

// Refills the free daily super like balance once per UTC day. Purchased ones stay.
function ensureSuperLikes(user) {
  const now = nowIso();
  if (!user.super_likes_reset_at || !sameUtcDay(user.super_likes_reset_at, now)) {
    db.run('UPDATE users SET super_likes_balance = ?, super_likes_reset_at = ? WHERE id = ?', [
      SUPER_LIKES_PER_DAY,
      now,
      user.id
    ]);
    user.super_likes_balance = SUPER_LIKES_PER_DAY;
    user.super_likes_reset_at = now;
  }
  return totalSuperLikes(user);
}

// Spends one free super like first, then a purchased one. Returns { ok, left }.
function consumeSuperLike(user) {
  const total = ensureSuperLikes(user);
  if (total < 1) return { ok: false, left: 0 };
  if (dailyBalance(user) > 0) {
    user.super_likes_balance = dailyBalance(user) - 1;
    db.run('UPDATE users SET super_likes_balance = ? WHERE id = ?', [user.super_likes_balance, user.id]);
  } else {
    user.super_likes_bonus = Math.max(0, bonusBalance(user) - 1);
    db.run('UPDATE users SET super_likes_bonus = ? WHERE id = ?', [user.super_likes_bonus, user.id]);
  }
  return { ok: true, left: totalSuperLikes(user) };
}

// Adds purchased super likes to the balance that survives the daily refill.
function grantSuperLikes(userId, quantity) {
  const amount = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!amount) return 0;
  db.run('UPDATE users SET super_likes_bonus = super_likes_bonus + ? WHERE id = ?', [amount, userId]);
  const row = db.get('SELECT super_likes_balance, super_likes_bonus FROM users WHERE id = ?', [userId]);
  return row ? totalSuperLikes(row) : amount;
}

function boostState(user) {
  const now = Date.now();
  const until = user.boost_until ? Date.parse(user.boost_until) : 0;
  const last = user.last_boost_at ? Date.parse(user.last_boost_at) : 0;
  const active = until > now;
  const nextAvailable = last ? last + BOOST_COOLDOWN_MS : 0;
  return {
    active,
    until: active ? user.boost_until : null,
    next_available_at: nextAvailable > now ? new Date(nextAvailable).toISOString() : null,
    can_boost: !active && nextAvailable <= now
  };
}

module.exports = {
  SUPER_LIKES_PER_DAY,
  BOOST_DURATION_MS,
  BOOST_COOLDOWN_MS,
  ensureSuperLikes,
  consumeSuperLike,
  grantSuperLikes,
  totalSuperLikes,
  boostState
};
