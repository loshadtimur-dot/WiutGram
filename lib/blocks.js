'use strict';

const db = require('../db');

// True when either side has blocked the other.
function isBlockedBetween(a, b) {
  const row = db.get(
    `SELECT 1 AS x FROM blocks
     WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
     LIMIT 1`,
    [a, b, b, a]
  );
  return !!row;
}

function hasBlocked(blockerId, blockedId) {
  return !!db.get('SELECT 1 AS x FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [
    blockerId,
    blockedId
  ]);
}

// SQL fragment excluding users blocked by me or blocking me.
const NOT_BLOCKED_SQL = `NOT EXISTS (
  SELECT 1 FROM blocks bl
  WHERE (bl.blocker_id = ? AND bl.blocked_id = u.id)
     OR (bl.blocker_id = u.id AND bl.blocked_id = ?)
)`;

module.exports = { isBlockedBetween, hasBlocked, NOT_BLOCKED_SQL };
