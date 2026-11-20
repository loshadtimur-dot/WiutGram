'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-migration-'));
process.env.UNI_DB_FILE = path.join(tempDir, 'app.db');
process.env.UPLOADS_DIR = path.join(tempDir, 'uploads');
process.env.JWT_SECRET = 'migration-test-secret-123456';
process.env.NODE_ENV = 'test';

const db = require('../db');
const { migrateMatchesToConversations } = require('../lib/chat/migrate');
const { nowIso } = require('../utils/time');

function insertUser(username) {
  const now = nowIso();
  const result = db.run(
    `INSERT INTO users (username, email, password_hash, display_name, birthdate, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2000-01-01', ?, ?)`,
    [username, `${username}@example.com`, 'x', username, now, now]
  );
  return Number(result.lastInsertRowid);
}

test.after(() => {
  try {
    db.raw.close();
  } catch (err) {
    // ignore
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('legacy match messages are copied into conversations without loss', () => {
  const a = insertUser('legacya');
  const b = insertUser('legacyb');
  const match = db.run('INSERT INTO matches (user_a, user_b, created_at) VALUES (?, ?, ?)', [a, b, nowIso()]);
  const matchId = Number(match.lastInsertRowid);
  for (let index = 0; index < 7; index += 1) {
    db.run(
      `INSERT INTO messages (match_id, sender_id, type, body, created_at)
       VALUES (?, ?, 'text', ?, ?)`,
      [matchId, index % 2 ? a : b, `сообщение ${index}`, nowIso()]
    );
  }
  const before = db.get('SELECT COUNT(*) AS total FROM messages').total;
  const result = migrateMatchesToConversations();
  assert.equal(result.migrated, 7);

  const after = db.get('SELECT COUNT(*) AS total FROM messages').total;
  assert.equal(after, before);

  const conversation = db.get('SELECT * FROM conversations WHERE match_id = ?', [matchId]);
  assert.ok(conversation);
  const copied = db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC', [conversation.id]);
  assert.equal(copied.length, 7);
  assert.deepEqual(
    copied.map((row) => row.seq),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.equal(copied[0].body, 'сообщение 0');
  assert.equal(db.get('SELECT COUNT(*) AS total FROM conversation_members WHERE conversation_id = ?', [conversation.id]).total, 2);

  // Running again is a no-op and never duplicates messages.
  const second = migrateMatchesToConversations();
  assert.equal(second.migrated, 0);
  assert.equal(db.get('SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?', [conversation.id]).total, 7);
});
