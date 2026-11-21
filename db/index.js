'use strict';

const fs = require('fs');
const path = require('path');
const {
  TABLES,
  INDEXES,
  EXTRA_COLUMNS,
  DEFAULT_SETTINGS,
  POST_MIGRATION,
  EMAIL_TABLES,
  EMAIL_INDEXES
} = require('./schema');
const { ADS_TABLES, ADS_INDEXES, ADS_USER_COLUMNS, ADS_DEFAULT_SETTINGS } = require('./ads-schema');
const {
  COSMETICS_TABLES,
  COSMETICS_INDEXES,
  COSMETICS_USER_COLUMNS,
  COSMETICS_DEFAULT_SETTINGS
} = require('./cosmetics-schema');
const { SHOP_TABLES, SHOP_INDEXES, GIFT_COLUMNS, SHOP_DEFAULT_SETTINGS } = require('./shop-schema');
const { CHAT_TABLES, CHAT_MESSAGE_INDEXES, ensureMessagesShape } = require('./chat-schema');
const { ACCESS_TABLES, ACCESS_INDEXES } = require('./access-schema');
const { shopSeed } = require('../lib/design');
const { CITY, UNIVERSITY_SEED, UNIVERSITY_NAME_EN } = require('../config');
const { nowIso } = require('../utils/time');

// Railway mounts persistent storage as a volume; everything writable must live there.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(__dirname, '..', 'data');
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

// Wiutgram is a single-campus community. Keep exactly one active university
// and hide every other row without deleting it, so existing profiles stay valid.
function seedUniversities() {
  const now = new Date().toISOString();
  const [shortName, name] = UNIVERSITY_SEED[0];
  let wiut = get("SELECT * FROM universities WHERE short_name = ? COLLATE NOCASE LIMIT 1", [shortName]);
  if (!wiut) {
    const result = run(
      `INSERT INTO universities (short_name, name, name_en, sort_order, is_active, is_system, created_at, updated_at)
       VALUES (?, ?, ?, 10, 1, 0, ?, ?)`,
      [shortName, name, UNIVERSITY_NAME_EN, now, now]
    );
    wiut = { id: Number(result.lastInsertRowid) };
  } else {
    run(
      `UPDATE universities SET name = ?, name_en = ?, is_system = 0, updated_at = ? WHERE id = ?`,
      [name, UNIVERSITY_NAME_EN, now, wiut.id]
    );
  }
  run('UPDATE universities SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [wiut.id]);
}

// Catalogue rows are inserted once; owner price and availability edits survive
// restarts because the insert ignores existing slugs.
function seedShopCatalogue() {
  const now = nowIso();
  for (const row of shopSeed()) {
    run(
      `INSERT OR IGNORE INTO shop_items
       (kind, slug, title, description, price, asset_key, rarity, edition_limit,
        edition_sold, is_active, is_owner_only, tags, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        row.kind,
        row.slug,
        row.title,
        row.description,
        row.price,
        row.asset_key,
        row.rarity,
        row.edition_limit || null,
        row.is_active === undefined ? 1 : row.is_active,
        row.is_owner_only || 0,
        row.tags || '[]',
        row.sort_order || 0,
        now,
        now
      ]
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

  // Follows, banners, badges and gifts are additive as well.
  for (const sql of COSMETICS_TABLES) exec(sql);
  ensureColumns('users', COSMETICS_USER_COLUMNS);
  for (const sql of COSMETICS_INDEXES) exec(sql);
  for (const [key, value] of Object.entries(COSMETICS_DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // Shop: catalogue, orders, owned items and the profile decoration slots.
  for (const sql of SHOP_TABLES) exec(sql);
  ensureColumns('user_gifts', GIFT_COLUMNS);
  for (const sql of SHOP_INDEXES) exec(sql);
  for (const [key, value] of Object.entries(SHOP_DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)', [key, value]);
  }
  seedShopCatalogue();

  // Conversations: the two core tables must exist before messages is rebuilt.
  exec(CHAT_TABLES[0]);
  exec(CHAT_TABLES[1]);
  ensureMessagesShape(raw);
  for (const sql of CHAT_TABLES) exec(sql);
  for (const sql of CHAT_MESSAGE_INDEXES) exec(sql);

  // Access recovery requests.
  for (const sql of ACCESS_TABLES) exec(sql);
  for (const sql of ACCESS_INDEXES) exec(sql);

  // Email confirmation tokens (additive, used only when mail is configured).
  for (const sql of EMAIL_TABLES) exec(sql);
  for (const sql of EMAIL_INDEXES) exec(sql);
  run("UPDATE site_settings SET value = '16' WHERE key = 'min_age' AND value = '18'");

  // Admins are not a separate role anymore.
  run("UPDATE users SET role = 'user' WHERE role = 'admin'");
  // The whole product is Tashkent-only now; distances are not used.
  run('UPDATE users SET city = ?, filter_city = NULL, lat = NULL, lng = NULL', [CITY]);
  run('UPDATE users SET hide_district = hide_distance WHERE hide_district = 0 AND hide_distance = 1');

  seedUniversities();

  // Rebrand existing installations once; owners can still rename the site later.
  const siteName = getSetting('site_name', '');
  if (!siteName || /uni\s*lovers/i.test(siteName)) setSetting('site_name', DEFAULT_SETTINGS.site_name);
  const welcome = getSetting('welcome_message', '');
  if (!welcome || /uni\s*lovers|искру/i.test(welcome)) {
    setSetting('welcome_message', DEFAULT_SETTINGS.welcome_message);
  }
}

// Copies the database before migrations touch it and keeps the last 20 copies,
// so an unexpected migration failure never leaves the owner without a fallback.
const BACKUP_DIR = path.join(DB_DIR, 'backups');
const BACKUP_KEEP = 20;

function backupBeforeMigrate() {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    if (fs.statSync(DB_FILE).size === 0) return null;
    raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const target = path.join(BACKUP_DIR, `app-${stamp}.db`);
    fs.copyFileSync(DB_FILE, target);
    const copies = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => /^app-\d{8}-\d{6}\.db$/.test(name))
      .sort();
    for (const old of copies.slice(0, Math.max(0, copies.length - BACKUP_KEEP))) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
    return target;
  } catch (err) {
    console.error('[db] backup before migration failed:', err.message);
    return null;
  }
}

backupBeforeMigrate();
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
