'use strict';

const fs = require('fs');
const path = require('path');
const { TABLES, INDEXES, EXTRA_COLUMNS, DEFAULT_SETTINGS, POST_MIGRATION } = require('./schema');
const { ADS_TABLES, ADS_INDEXES, ADS_USER_COLUMNS, ADS_DEFAULT_SETTINGS } = require('./ads-schema');
const { CITY, UNIVERSITY_SEED, SYSTEM_UNIVERSITY } = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
// UNI_DB_FILE lets tests run against a disposable copy without touching real data.
const DB_FILE = process.env.UNI_DB_FILE ? path.resolve(process.env.UNI_DB_FILE) : path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
// A custom UNI_DB_FILE may point to a mounted volume that is not created yet.
const DB_DIR = path.dirname(DB_FILE);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let driver = 'better-sqlite3';
let raw;

try {
  const BetterSqlite3 = require('better-sqlite3');
  raw = new BetterSqlite3(DB_FILE);
} catch (err) {
  // Fallback for platforms without native better-sqlite3 builds (Node 22+).
  const { DatabaseSync } = require('node:sqlite');
  raw = new DatabaseSync(DB_FILE);
  driver = 'node:sqlite';
}

raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');
raw.exec('PRAGMA busy_timeout = 5000');

// SQLite LOWER() only folds ASCII. Register a Unicode-aware helper for search so
// Cyrillic and Uzbek names match regardless of case. Falls back to LOWER().
let textLower = 'LOWER';
if (typeof raw.function === 'function') {
  try {
    raw.function('ulower', (value) => String(value === null || value === undefined ? '' : value).toLowerCase());
    textLower = 'ulower';
  } catch (err) {
    textLower = 'LOWER';
  }
}

const statementCache = new Map();

// Returns a cached prepared statement for the given SQL.
function q(sql) {
  if (!statementCache.has(sql)) statementCache.set(sql, raw.prepare(sql));
  return statementCache.get(sql);
}

function get(sql, params = []) {
  return q(sql).get(...params);
}

function all(sql, params = []) {
  return q(sql).all(...params);
}

function run(sql, params = []) {
  return q(sql).run(...params);
}

function exec(sql) {
  return raw.exec(sql);
}

let txDepth = 0;

// Runs fn inside a database transaction. Nested calls use savepoints.
function tx(fn) {
  if (txDepth > 0) {
    const name = `sp_${txDepth}`;
    exec(`SAVEPOINT ${name}`);
    txDepth += 1;
    try {
      const result = fn();
      exec(`RELEASE ${name}`);
      txDepth -= 1;
      return result;
    } catch (err) {
      exec(`ROLLBACK TO ${name}`);
      exec(`RELEASE ${name}`);
      txDepth -= 1;
      throw err;
    }
  }

  exec('BEGIN IMMEDIATE');
  txDepth = 1;
  try {
    const result = fn();
    exec('COMMIT');
    txDepth = 0;
    return result;
  } catch (err) {
    try {
      exec('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback failures, original error is more useful.
    }
    txDepth = 0;
    throw err;
  }
}

function inClause(count) {
  return `(${new Array(count).fill('?').join(', ')})`;
}

function listSettings() {
  const rows = all('SELECT key, value FROM site_settings');
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM site_settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  run(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

function ensureColumns(table, columns) {
  const existing = new Set(all(`PRAGMA table_info(${table})`).map((c) => c.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

// Makes sure the default Tashkent university list exists. Owners can edit it later.
function seedUniversities() {
  const now = new Date().toISOString();
  const total = get('SELECT COUNT(*) AS t FROM universities').t;
  if (total === 0) {
    UNIVERSITY_SEED.forEach(([shortName, name], index) => {
      run(
        `INSERT INTO universities (short_name, name, name_en, sort_order, is_active, is_system, created_at, updated_at)
         VALUES (?, ?, '', ?, 1, 0, ?, ?)`,
        [shortName, name, (index + 1) * 10, now, now]
      );
    });
  }
  const system = get('SELECT id FROM universities WHERE is_system = 1 LIMIT 1');
  if (!system) {
    const maxOrder = get('SELECT COALESCE(MAX(sort_order), 0) AS t FROM universities').t;
    run(
      `INSERT INTO universities (short_name, name, name_en, sort_order, is_active, is_system, created_at, updated_at)
       VALUES (?, ?, '', ?, 1, 1, ?, ?)`,
      [SYSTEM_UNIVERSITY[0], SYSTEM_UNIVERSITY[1], maxOrder + 10, now, now]
    );
  }
}

function migrate() {
  for (const sql of TABLES) exec(sql);
  for (const table of Object.keys(EXTRA_COLUMNS)) ensureColumns(table, EXTRA_COLUMNS[table]);
  for (const sql of INDEXES) exec(sql);
  for (const sql of POST_MIGRATION) exec(sql);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // Advertising tables and owner 2FA columns are additive migrations only.
  for (const sql of ADS_TABLES) exec(sql);
  ensureColumns('users', ADS_USER_COLUMNS);
  for (const sql of ADS_INDEXES) exec(sql);
  for (const [key, value] of Object.entries(ADS_DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // Admins are not a separate role anymore.
  run("UPDATE users SET role = 'user' WHERE role = 'admin'");
  // The whole product is Tashkent-only now; distances are not used.
  run('UPDATE users SET city = ?, filter_city = NULL, lat = NULL, lng = NULL', [CITY]);
  run('UPDATE users SET hide_district = hide_distance WHERE hide_district = 0 AND hide_distance = 1');

  seedUniversities();

  const welcome = getSetting('welcome_message', '');
  if (welcome && welcome.includes('искру')) setSetting('welcome_message', DEFAULT_SETTINGS.welcome_message);
}

migrate();

// Counts real (non demo) accounts. Used to decide who becomes the site owner.
function countRealUsers() {
  const row = get('SELECT COUNT(*) AS total FROM users WHERE is_demo = 0');
  return row ? row.total : 0;
}

// Removes stories older than 24h (they also disappear from queries via expires_at).
function cleanupExpiredStories() {
  run('DELETE FROM stories WHERE expires_at < ?', [new Date().toISOString()]);
}

// Drops sessions that have been inactive for more than 30 days.
function cleanupSessions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  run('DELETE FROM sessions WHERE last_active_at < ?', [cutoff]);
}

module.exports = {
  raw,
  driver,
  textLower,
  DB_FILE,
  DATA_DIR,
  q,
  get,
  all,
  run,
  exec,
  tx,
  inClause,
  listSettings,
  getSetting,
  setSetting,
  countRealUsers,
  cleanupExpiredStories,
  cleanupSessions,
  seedUniversities,
  migrate
};
