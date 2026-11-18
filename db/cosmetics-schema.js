'use strict';

// Additive schema for follows, profile banners, badges and gifts.
// Every statement is idempotent so it can run on the existing database.
const COSMETICS_TABLES = [
  `CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, following_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banner_id TEXT NOT NULL,
    granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL,
    granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_id TEXT NOT NULL,
    from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'admin',
    regifted INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gift_overrides (
    gift_id TEXT PRIMARY KEY,
    rarity TEXT,
    price INTEGER,
    updated_at TEXT NOT NULL
  )`
];

const COSMETICS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_banners_user ON user_banners(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_gifts_user ON user_gifts(user_id, gift_id)'
];

const COSMETICS_USER_COLUMNS = [
  ['banner_id', 'TEXT'],
  ['equipped_gift_id', 'INTEGER']
];

const COSMETICS_DEFAULT_SETTINGS = {
  owner_telegram: '',
  gifts_enabled: '1',
  badges_enabled: '1',
  banners_enabled: '1'
};

module.exports = {
  COSMETICS_TABLES,
  COSMETICS_INDEXES,
  COSMETICS_USER_COLUMNS,
  COSMETICS_DEFAULT_SETTINGS
};
