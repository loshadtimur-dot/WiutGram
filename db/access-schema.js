'use strict';

// Access-recovery requests. No password material is ever stored here: the owner
// generates a temporary password and the site keeps only its bcrypt hash.
const ACCESS_TABLES = [
  `CREATE TABLE IF NOT EXISTS access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    identifier TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    ip TEXT,
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    handled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];

const ACCESS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_access_requests_ip ON access_requests(ip, created_at)'
];

module.exports = { ACCESS_TABLES, ACCESS_INDEXES };
