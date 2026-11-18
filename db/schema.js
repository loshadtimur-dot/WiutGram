'use strict';

// Full relational schema for Wiutgram. Every statement is idempotent.
const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    display_name TEXT NOT NULL,
    birthdate TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'other',
    interested_in TEXT NOT NULL DEFAULT 'everyone',
    looking_for TEXT NOT NULL DEFAULT 'not_sure',
    city TEXT,
    lat REAL,
    lng REAL,
    bio TEXT NOT NULL DEFAULT '',
    job TEXT NOT NULL DEFAULT '',
    education TEXT NOT NULL DEFAULT '',
    height INTEGER,
    interests TEXT NOT NULL DEFAULT '[]',
    languages TEXT NOT NULL DEFAULT '[]',
    instagram_link TEXT NOT NULL DEFAULT '',
    avatar_path TEXT,
    is_verified INTEGER NOT NULL DEFAULT 0,
    is_banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,
    ban_until TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    is_incognito INTEGER NOT NULL DEFAULT 0,
    hide_online INTEGER NOT NULL DEFAULT 0,
    hide_age INTEGER NOT NULL DEFAULT 0,
    hide_distance INTEGER NOT NULL DEFAULT 0,
    hide_from_discovery INTEGER NOT NULL DEFAULT 0,
    read_receipts INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'auto',
    boost_until TEXT,
    last_boost_at TEXT,
    super_likes_balance INTEGER NOT NULL DEFAULT 5,
    super_likes_bonus INTEGER NOT NULL DEFAULT 0,
    super_likes_reset_at TEXT,
    filter_age_min INTEGER NOT NULL DEFAULT 18,
    filter_age_max INTEGER NOT NULL DEFAULT 99,
    filter_distance INTEGER NOT NULL DEFAULT 200,
    filter_city TEXT,
    last_seen TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    onboarding_done INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS universities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_name TEXT NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS university_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    note TEXT NOT NULL DEFAULT '',
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    handled_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    revoked_at TEXT,
    sudo_until TEXT,
    impersonator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    parent_session_id TEXT,
    read_only INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    identifier TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_university_id INTEGER REFERENCES universities(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipients INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS swipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(from_id, to_id)
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_a, user_b)
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    created_at TEXT NOT NULL,
    read_at TEXT,
    deleted_by_sender INTEGER NOT NULL DEFAULT 0,
    reaction TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS profile_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    views_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS post_likes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS post_views (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, viewer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (comment_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_path TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS story_views (
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (story_id, viewer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS highlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    cover_path TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS highlight_items (
    highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    PRIMARY KEY (highlight_id, story_id)
  )`,
  `CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ref_id INTEGER,
    text TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS superlike_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    price INTEGER NOT NULL,
    contact TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    admin_note TEXT NOT NULL DEFAULT '',
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    handled_at TEXT,
    credited_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT,
    meta TEXT,
    created_at TEXT NOT NULL
  )`
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen)',
  'CREATE INDEX IF NOT EXISTS idx_users_city ON users(city)',
  'CREATE INDEX IF NOT EXISTS idx_users_university ON users(university_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_shadow ON users(shadow_banned)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_uni_short ON universities(short_name COLLATE NOCASE)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_uni_name ON universities(name COLLATE NOCASE)',
  'CREATE INDEX IF NOT EXISTS idx_uni_order ON universities(sort_order)',
  'CREATE INDEX IF NOT EXISTS idx_uni_requests_status ON university_requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, revoked_at)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(id)',
  'CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id, position)',
  'CREATE INDEX IF NOT EXISTS idx_swipes_from ON swipes(from_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_swipes_to ON swipes(to_id, action)',
  'CREATE INDEX IF NOT EXISTS idx_matches_a ON matches(user_a)',
  'CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(user_b)',
  'CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)',
  'CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON profile_views(viewed_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id)',
  'CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id)',
  'CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)',
  'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read)',
  'CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_superlike_orders_status ON superlike_orders(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_superlike_orders_user ON superlike_orders(user_id, created_at)'
];

// Columns added over time; applied automatically with ALTER TABLE when missing.
const EXTRA_COLUMNS = {
  users: [
    ['ban_until', 'TEXT'],
    ['super_likes_reset_at', 'TEXT'],
    ['filter_age_min', 'INTEGER NOT NULL DEFAULT 18'],
    ['filter_age_max', 'INTEGER NOT NULL DEFAULT 99'],
    ['filter_distance', 'INTEGER NOT NULL DEFAULT 200'],
    ['filter_city', 'TEXT'],
    ['onboarding_done', 'INTEGER NOT NULL DEFAULT 1'],
    ['university_id', 'INTEGER REFERENCES universities(id) ON DELETE SET NULL'],
    ['faculty', 'TEXT'],
    ['course', 'TEXT'],
    ['district', 'TEXT'],
    ['hide_district', 'INTEGER NOT NULL DEFAULT 0'],
    ['filter_university_id', 'INTEGER'],
    ['filter_course', 'TEXT'],
    ['prefer_my_university', 'INTEGER NOT NULL DEFAULT 1'],
    ['token_version', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_ip', 'TEXT'],
    ['last_login_at', 'TEXT'],
    ['login_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['shadow_banned', 'INTEGER NOT NULL DEFAULT 0'],
    ['owner_note', 'TEXT'],
    ['force_password_change', 'INTEGER NOT NULL DEFAULT 0'],
    ['super_likes_bonus', 'INTEGER NOT NULL DEFAULT 0']
  ],
  messages: [
    ['reaction', 'TEXT'],
    ['deleted_by_sender', 'INTEGER NOT NULL DEFAULT 0']
  ],
  activity_log: [
    ['ip', 'TEXT'],
    ['before_json', 'TEXT'],
    ['after_json', 'TEXT']
  ]
};

const DEFAULT_SETTINGS = {
  site_name: 'Wiutgram',
  registration_open: '1',
  min_age: '18',
  maintenance_mode: '0',
  welcome_message: 'Добро пожаловать в Wiutgram — сообщество студентов WIUT.',
  max_photos: '9',
  max_bio: '500',
  super_likes_per_day: '5',
  allow_university_requests: '0',
  superlikes_enabled: '1',
  superlikes_quantity: '100',
  superlikes_price: '10000',
  superlikes_telegram: '',
  superlikes_payment_note: 'Переведите сумму на карту и отправьте чек в Telegram. Суперлайки начисляются вручную после проверки оплаты.'
};

// Schema statements that must run after new columns exist.
const POST_MIGRATION = [
  'CREATE INDEX IF NOT EXISTS idx_users_district ON users(district)'
];

module.exports = { TABLES, INDEXES, EXTRA_COLUMNS, DEFAULT_SETTINGS, POST_MIGRATION };
