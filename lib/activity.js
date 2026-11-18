'use strict';

const db = require('../db');
const { nowIso } = require('../utils/time');

// Immutable audit record for owner actions.
function adminLog(req, action, target = null, options = {}) {
  const { before = null, after = null, meta = null } = options || {};
  const ip = req && req.ip ? String(req.ip).slice(0, 64) : null;
  db.run(
    `INSERT INTO activity_log (actor_id, action, target, meta, ip, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req && req.user ? req.user.id : null,
      action,
      target,
      meta ? JSON.stringify(meta) : null,
      ip,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      nowIso()
    ]
  );
}

module.exports = { adminLog };
