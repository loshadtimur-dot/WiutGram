'use strict';

// Emergency owner password reset, run on the server by the owner.
//
//   NEW_OWNER_PASSWORD='...' node scripts/owner-reset.js owner@example.com
//
// It never prints the password, never changes the role and revokes every
// existing session of that account. 2FA stays enabled: if the phone is lost,
// use a backup code or clear TOTP columns as described in docs/RUNBOOK.md.

const db = require('../db');
const bcrypt = require('bcryptjs');
const { MIN_OWNER_PASSWORD } = require('../config');

const login = String(process.argv[2] || '').trim().toLowerCase();
const password = String(process.env.NEW_OWNER_PASSWORD || '');

if (!login) {
  console.error('Usage: NEW_OWNER_PASSWORD=... node scripts/owner-reset.js <email|username>');
  process.exit(64);
}
if (password.length < MIN_OWNER_PASSWORD) {
  console.error(`Password must be at least ${MIN_OWNER_PASSWORD} characters.`);
  process.exit(65);
}

const owner = db.get(
  "SELECT id, username, email, role FROM users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND role = 'owner'",
  [login, login]
);

if (!owner) {
  console.error('Owner account not found. This script only resets the owner role.');
  process.exit(66);
}

const hash = bcrypt.hashSync(password, 10);
db.run(
  `UPDATE users
      SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1,
          force_password_change = 1, failed_login_attempts = 0,
          locked_until = NULL, updated_at = ?
    WHERE id = ?`,
  [hash, new Date().toISOString(), owner.id]
);
db.run('DELETE FROM sessions WHERE user_id = ?', [owner.id]);

console.log(`Password updated for owner #${owner.id} (${owner.username}).`);
console.log('All sessions revoked. 2FA settings were not touched.');
