'use strict';

// Additive shop schema. Every statement is idempotent; existing cosmetics rows
// (user_gifts, user_banners) keep working and are read as legacy ownership.

const SHOP_TABLES = [
  `CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    asset_key TEXT,
    image_path TEXT,
    rarity TEXT NOT NULL DEFAULT 'common',
    edition_limit INTEGER,
    edition_sold INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_owner_only INTEGER NOT NULL DEFAULT 0,
    custom_upload INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    available_from TEXT,
    available_until TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shop_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    item_id INTEGER NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
    price_total INTEGER NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    paid_at TEXT,
    delivered_at TEXT,
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES shop_orders(id) ON DELETE SET NULL,
    acquired_at TEXT NOT NULL,
    UNIQUE(user_id, item_id)
  )`,
  `CREATE TABLE IF NOT EXISTS profile_decor (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    banner_item_id INTEGER REFERENCES shop_items(id) ON DELETE SET NULL,
    background_item_id INTEGER REFERENCES shop_items(id) ON DELETE SET NULL,
    custom_banner_path TEXT,
    status_emoji TEXT,
    status_text TEXT NOT NULL DEFAULT '',
    status_expires_at TEXT,
    updated_at TEXT NOT NULL
  )`
];

const SHOP_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_shop_items_kind ON shop_items(kind, is_active, sort_order)',
  'CREATE INDEX IF NOT EXISTS idx_shop_items_slug ON shop_items(slug)',
  'CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer ON shop_orders(buyer_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_shop_orders_item ON shop_orders(item_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_profile_decor_status ON profile_decor(status_expires_at)'
];

// Columns added to the legacy gift table so old and new gifts share one model.
const GIFT_COLUMNS = [
  ['item_id', 'INTEGER REFERENCES shop_items(id) ON DELETE SET NULL'],
  ['order_id', 'INTEGER REFERENCES shop_orders(id) ON DELETE SET NULL'],
  ['is_anonymous', 'INTEGER NOT NULL DEFAULT 0'],
  ['message', "TEXT NOT NULL DEFAULT ''"],
  ['price_at_gift', 'INTEGER NOT NULL DEFAULT 0'],
  ['given_at', 'TEXT'],
  ['edition_number', 'INTEGER'],
  ['is_pinned', 'INTEGER NOT NULL DEFAULT 0'],
  ['attrs_json', "TEXT NOT NULL DEFAULT '{}'"]
];

const SHOP_DEFAULT_SETTINGS = {
  shop_enabled: '1',
  shop_orders_per_hour: '5',
  shop_max_pinned_gifts: '6',
  shop_allow_custom_banner: '1',
  shop_gift_message_max: '120',
  chat_global_mode: 'requests',
  chat_group_limit: '500',
  chat_requests_per_day: '5',
  chat_custom_banner_price: '50000'
};

module.exports = {
  SHOP_TABLES,
  SHOP_INDEXES,
  GIFT_COLUMNS,
  SHOP_DEFAULT_SETTINGS
};
