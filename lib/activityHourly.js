'use strict';

const db = require('../db');
const { nowHourStart } = require('../utils/tashkent');

// Tracks how many distinct signed-in users were active in the current hour.
// The value is flushed every minute and whenever the hour changes.

let bucket = { hour: nowHourStart(), ids: new Set() };

function persist(target) {
  if (!target || !target.ids.size) return;
  db.run(
    `INSERT INTO site_activity_hourly (hour_start, active_users) VALUES (?, ?)
     ON CONFLICT(hour_start) DO UPDATE SET active_users = MAX(active_users, excluded.active_users)`,
    [target.hour, target.ids.size]
  );
}

function touch(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return;
  const hour = nowHourStart();
  if (hour !== bucket.hour) {
    persist(bucket);
    bucket = { hour, ids: new Set() };
  }
  bucket.ids.add(id);
}

function flush() {
  persist(bucket);
}

function currentCount() {
  return bucket.ids.size;
}

module.exports = { touch, flush, currentCount, persist };
