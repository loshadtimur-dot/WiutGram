'use strict';

// Additive conversation schema. The legacy messages table is rebuilt once so
// group messages can exist without a match; every row is copied by id.

const CHAT_TABLES = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'dm',
    title TEXT,
    username TEXT UNIQUE,
    photo TEXT,
    description TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    join_mode TEXT NOT NULL DEFAULT 'invite_only',
    slow_mode_sec INTEGER NOT NULL DEFAULT 0,
    members_count INTEGER NOT NULL DEFAULT 0,
    last_message_id INTEGER,
    last_message_at TEXT,
    match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    permissions TEXT NOT NULL DEFAULT '{}',
    joined_at TEXT NOT NULL,
    last_read_seq INTEGER NOT NULL DEFAULT 0,
    muted_until TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (conversation_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  )`,
  `CREATE TABLE IF NOT EXISTS message_deletions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS pinned_messages (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pinned_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, message_id)
  )`,
  `CREATE TABLE IF NOT EXISTS group_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT,
    max_uses INTEGER,
    uses INTEGER NOT NULL DEFAULT 0,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    handled_at TEXT,
    UNIQUE(conversation_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS message_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    handled_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    multiple INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS poll_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (poll_id, option_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS drafts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, conversation_id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_wallpapers (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    wallpaper TEXT NOT NULL DEFAULT 'paper',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS message_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS group_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_user_id INTEGER,
    meta TEXT,
    created_at TEXT NOT NULL
  )`
];

const CHAT_MESSAGE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, seq)',
  'CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(conversation_id, client_msg_id)',
  'CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id, is_archived, is_pinned)',
  'CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_message_at)',
  'CREATE INDEX IF NOT EXISTS idx_conversations_public ON conversations(is_public, username)',
  'CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id)',
  'CREATE INDEX IF NOT EXISTS idx_pinned_conversation ON pinned_messages(conversation_id)',
  'CREATE INDEX IF NOT EXISTS idx_invites_code ON group_invites(code)',
  'CREATE INDEX IF NOT EXISTS idx_join_requests_status ON join_requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_message_requests_to ON message_requests(to_user_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id)',
  'CREATE INDEX IF NOT EXISTS idx_group_log_conversation ON group_log(conversation_id, created_at)'
];

const NEEDED_COLUMNS = [
  ['conversation_id', 'INTEGER REFERENCES conversations(id) ON DELETE CASCADE'],
  ['seq', 'INTEGER NOT NULL DEFAULT 0'],
  ['reply_to_id', 'INTEGER'],
  ['forward_json', 'TEXT'],
  ['edited_at', 'TEXT'],
  ['deleted_for_all', 'INTEGER NOT NULL DEFAULT 0'],
  ['meta_json', 'TEXT'],
  ['client_msg_id', 'TEXT']
];

// Rebuilds the messages table once so match_id can be NULL for groups.
// Every row keeps its id and content; a mismatch aborts the transaction.
function ensureMessagesShape(raw) {
  const columns = raw.prepare('PRAGMA table_info(messages)').all();
  const names = new Set(columns.map((column) => column.name));
  if (names.has('conversation_id')) {
    return { rebuilt: false };
  }
  const before = raw.prepare('SELECT COUNT(*) AS total FROM messages').get().total;
  const matchIdNotNull = columns.some((column) => column.name === 'match_id' && Number(column.notnull) === 1);

  raw.exec('BEGIN IMMEDIATE');
  try {
    raw.exec(`CREATE TABLE messages_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL DEFAULT 0,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT,
      deleted_by_sender INTEGER NOT NULL DEFAULT 0,
      reaction TEXT,
      reply_to_id INTEGER,
      forward_json TEXT,
      edited_at TEXT,
      deleted_for_all INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT,
      client_msg_id TEXT
    )`);
    const copied = matchIdNotNull
      ? 'SELECT id, match_id, sender_id, type, body, image_path, created_at, read_at, deleted_by_sender, reaction FROM messages'
      : `SELECT id, match_id, sender_id, type, body, image_path, created_at, read_at,
           COALESCE(deleted_by_sender, 0), reaction FROM messages`;
    raw.exec(`INSERT INTO messages_new
      (id, match_id, sender_id, type, body, image_path, created_at, read_at, deleted_by_sender, reaction)
      ${copied}`);
    const after = raw.prepare('SELECT COUNT(*) AS total FROM messages_new').get().total;
    if (Number(before) !== Number(after)) {
      throw new Error(`messages migration mismatch: ${before} -> ${after}`);
    }
    raw.exec('DROP TABLE messages');
    raw.exec('ALTER TABLE messages_new RENAME TO messages');
    raw.exec('CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at)');
    raw.exec('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
    raw.exec('COMMIT');
    return { rebuilt: true, rows: Number(after) };
  } catch (err) {
    raw.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { CHAT_TABLES, CHAT_MESSAGE_INDEXES, NEEDED_COLUMNS, ensureMessagesShape };
