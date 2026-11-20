'use strict';

const db = require('../../db');
const { nowIso } = require('../../utils/time');
const logger = require('../logger');

// Builds one DM conversation per existing match and copies every message into
// it with a sequential number. Runs once; a count mismatch rolls back.
function migrateMatchesToConversations() {
  const totalMessages = db.get('SELECT COUNT(*) AS total FROM messages').total;
  const pending = db.get('SELECT COUNT(*) AS total FROM messages WHERE conversation_id IS NULL').total;
  if (!pending) {
    return { migrated: 0, messages: Number(totalMessages), created: 0 };
  }

  const matches = db.all('SELECT * FROM matches ORDER BY id ASC');
  let created = 0;
  let migrated = 0;

  db.tx(() => {
    for (const match of matches) {
      let conversation = db.get('SELECT * FROM conversations WHERE match_id = ?', [match.id]);
      if (!conversation) {
        const result = db.run(
          `INSERT INTO conversations (type, match_id, created_at, members_count)
           VALUES ('dm', ?, ?, 2)`,
          [match.id, match.created_at || nowIso()]
        );
        conversation = { id: Number(result.lastInsertRowid), created_at: match.created_at };
        created += 1;
      }
      for (const userId of [match.user_a, match.user_b]) {
        db.run(
          `INSERT OR IGNORE INTO conversation_members
           (conversation_id, user_id, role, joined_at, last_read_seq)
           VALUES (?, ?, 'member', ?, 0)`,
          [conversation.id, userId, conversation.created_at || nowIso()]
        );
      }

      const rows = db.all(
        'SELECT id FROM messages WHERE match_id = ? AND conversation_id IS NULL ORDER BY id ASC',
        [match.id]
      );
      let seq = Number(
        db.get('SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE conversation_id = ?', [conversation.id]).seq
      );
      for (const row of rows) {
        seq += 1;
        db.run('UPDATE messages SET conversation_id = ?, seq = ? WHERE id = ?', [conversation.id, seq, row.id]);
        migrated += 1;
      }
      const last = db.get(
        'SELECT id, created_at FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT 1',
        [conversation.id]
      );
      if (last) {
        db.run('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?', [
          last.id,
          last.created_at,
          conversation.id
        ]);
      }
    }

    const stillPending = db.get('SELECT COUNT(*) AS total FROM messages WHERE conversation_id IS NULL').total;
    if (Number(stillPending) > 0) {
      throw new Error(`conversation migration left ${stillPending} messages without a conversation`);
    }
  });

  if (migrated) {
    logger.info(`chat migration: ${migrated} messages moved into ${created} conversations`);
  }
  return { migrated, messages: Number(totalMessages), created };
}

module.exports = { migrateMatchesToConversations };
