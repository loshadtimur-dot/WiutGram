'use strict';

// Advertising tables. Everything is created idempotently so existing databases
// can be upgraded in place without touching real data.

const ADS_TABLES = [
  `CREATE TABLE IF NOT EXISTS ad_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    original_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ad_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_name TEXT NOT NULL,
    advertiser_telegram TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    alt_text TEXT NOT NULL DEFAULT '',
    banner_swipe_id INTEGER,
    banner_profile_id INTEGER,
    price_total INTEGER NOT NULL DEFAULT 0,
    paid_status TEXT NOT NULL DEFAULT 'unpaid',
    paid_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    cancel_reason TEXT,
    report_token TEXT NOT NULL,
    request_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ad_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    placement TEXT NOT NULL,
    hour_start INTEGER NOT NULL,
    UNIQUE(placement, hour_start)
  )`,
  `CREATE TABLE IF NOT EXISTS ad_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    contact_name TEXT NOT NULL DEFAULT '',
    ip_hash TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    hours_json TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    handled_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ad_stats (
    campaign_id INTEGER NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    placement TEXT NOT NULL,
    hour_start INTEGER NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    unique_viewers INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (campaign_id, placement, hour_start)
  )`,
  `CREATE TABLE IF NOT EXISTS ad_views (
    campaign_id INTEGER NOT NULL,
    placement TEXT NOT NULL,
    hour_start INTEGER NOT NULL,
    viewer_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, placement, hour_start, viewer_key)
  )`,
  `CREATE TABLE IF NOT EXISTS site_activity_hourly (
    hour_start INTEGER PRIMARY KEY,
    active_users INTEGER NOT NULL DEFAULT 0
  )`
];

const ADS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_ad_slots_hour ON ad_slots(hour_start)',
  'CREATE INDEX IF NOT EXISTS idx_ad_slots_campaign ON ad_slots(campaign_id)',
  'CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status, paid_status)',
  'CREATE INDEX IF NOT EXISTS idx_ad_campaigns_token ON ad_campaigns(report_token)',
  'CREATE INDEX IF NOT EXISTS idx_ad_requests_status ON ad_requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_ad_stats_campaign ON ad_stats(campaign_id, hour_start)',
  'CREATE INDEX IF NOT EXISTS idx_ad_views_created ON ad_views(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_activity_hourly_hour ON site_activity_hourly(hour_start)'
];

// Columns added to users for owner 2FA. Applied with ALTER TABLE when missing.
const ADS_USER_COLUMNS = [
  ['totp_secret', 'TEXT'],
  ['totp_pending_secret', 'TEXT'],
  ['totp_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['totp_enabled_at', 'TEXT'],
  ['totp_backup_codes', 'TEXT']
];

const ADS_DEFAULT_RULES = [
  'Баннер согласовывается с администратором до оплаты.',
  'Не принимаются: материалы 18+, азартные игры и ставки, обман и финансовые пирамиды,',
  'политическая агитация, оскорбления и любой контент, нарушающий законодательство.',
  'Администратор вправе отказать в размещении без объяснения причин.',
  'Оплата и согласование проходят в Telegram; сайт не принимает платежи.',
  'Если часы не были показаны по нашей вине, оплата возвращается или переносится.',
  'Один час показывает один баннер одновременно на экране свайпов и в профилях.'
].join(' ');

const ADS_DEFAULT_SETTINGS = {
  ads_enabled: '1',
  ads_telegram: '',
  ads_card_number: '',
  ads_card_holder: '',
  ads_card_bank: '',
  ads_show_card: '0',
  ads_payment_note: '',
  ads_price_per_hour: '15000',
  ads_horizon_days: '30',
  ads_min_notice_hours: '1',
  ads_max_hours_per_request: '24',
  ads_fallback_mode: 'house',
  ads_swipe_enabled: '1',
  ads_profile_enabled: '1',
  ads_discounts_json: '',
  ads_rules_text: ADS_DEFAULT_RULES,
  ads_show_audience_stats: '1',
  // House creative copy shown when no paid banner is booked for the hour.
  ads_house_title: 'Здесь может быть ваша реклама',
  ads_house_text: 'Студенты Ташкента увидят ваш баннер'
};

module.exports = { ADS_TABLES, ADS_INDEXES, ADS_USER_COLUMNS, ADS_DEFAULT_SETTINGS, ADS_DEFAULT_RULES };
