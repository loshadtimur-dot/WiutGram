'use strict';

const db = require('../../db');
const { nowIso } = require('../../utils/time');
const { BANNER_BY_ID, BACKGROUND_BY_ID } = require('../design/themes');
const { GLASS_BY_ID, GLASS_PACKS } = require('../design/glass');
const { GIFT_BY_ID, giftArt } = require('../design/gifts');
const { RARITY_LABEL } = require('../design');
const { notify } = require('../notify');
const { isBlockedBetween } = require('../blocks');

const STATUS_DURATIONS = [
  { id: 'never', label: 'Не очищать', seconds: 0 },
  { id: '1h', label: '1 час', seconds: 3600 },
  { id: '4h', label: '4 часа', seconds: 4 * 3600 },
  { id: 'today', label: 'До конца дня', seconds: -1 },
  { id: '7d', label: '7 дней', seconds: 7 * 24 * 3600 }
];

function ensureDecor(userId) {
  db.run(
    `INSERT OR IGNORE INTO profile_decor (user_id, status_text, updated_at) VALUES (?, '', ?)`,
    [userId, nowIso()]
  );
  return db.get('SELECT * FROM profile_decor WHERE user_id = ?', [userId]);
}

function clearExpiredStatuses() {
  db.run(
    `UPDATE profile_decor SET status_emoji = NULL, status_text = '', status_expires_at = NULL, updated_at = ?
     WHERE status_emoji IS NOT NULL AND status_expires_at IS NOT NULL AND status_expires_at <= ?`,
    [nowIso(), nowIso()]
  );
}

function itemById(id) {
  return id ? db.get('SELECT * FROM shop_items WHERE id = ?', [Number(id)]) : null;
}

function ownsItem(userId, itemId) {
  if (!userId || !itemId) return false;
  return !!db.get('SELECT 1 AS ok FROM user_items WHERE user_id = ? AND item_id = ?', [userId, itemId]);
}

function isFree(item) {
  return Number(item.price) === 0;
}

function bannerView(item, userId) {
  if (!item) return null;
  const theme = BANNER_BY_ID.get(String(item.asset_key).split(':')[1]);
  if (!theme) return null;
  return {
    item_id: item.id,
    id: theme.id,
    name: theme.name,
    description: theme.description,
    theme: theme.theme,
    accent: theme.accent,
    pattern: theme.pattern,
    rarity: item.rarity,
    rarity_label: RARITY_LABEL[item.rarity] || RARITY_LABEL.common,
    price: item.price,
    owner_only: !!item.is_owner_only,
    owned: isFree(item) || ownsItem(userId, item.id)
  };
}

function backgroundView(item, userId) {
  if (!item) return null;
  const theme = BACKGROUND_BY_ID.get(String(item.asset_key).split(':')[1]);
  if (!theme) return null;
  return {
    item_id: item.id,
    id: theme.id,
    name: theme.name,
    description: theme.description,
    theme: theme.theme,
    accent: theme.accent,
    pattern: theme.pattern,
    ink: theme.ink,
    rarity: item.rarity,
    price: item.price,
    owner_only: !!item.is_owner_only,
    owned: isFree(item) || ownsItem(userId, item.id)
  };
}

function statusPayload(user, decor) {
  if (!decor || !decor.status_emoji) return null;
  if (decor.status_expires_at && decor.status_expires_at <= nowIso()) return null;
  const glass = GLASS_BY_ID.get(decor.status_emoji);
  if (!glass) return null;
  return {
    emoji: glass.id,
    name: glass.name,
    text: decor.status_text || '',
    expires_at: decor.status_expires_at || null,
    is_owner: user ? user.role === 'owner' : false
  };
}

// Combines the new decoration table with legacy banner grants.
function decorFor(userId, viewerId = null) {
  clearExpiredStatuses();
  const user = db.get('SELECT id, username, banner_id, role FROM users WHERE id = ?', [userId]);
  if (!user) return { banner: null, background: null, status: null };
  const decor = ensureDecor(userId);
  let bannerItem = itemById(decor.banner_item_id);
  if (!bannerItem && user.banner_id) {
    bannerItem = db.get('SELECT * FROM shop_items WHERE kind = ? AND asset_key = ?', [
      'banner',
      `banner:${user.banner_id}`
    ]);
  }
  return {
    banner: bannerView(bannerItem, userId),
    background: backgroundView(itemById(decor.background_item_id), userId),
    status: statusPayload(user, decor),
    custom_banner_path: decor.custom_banner_path || null,
    is_self: Number(viewerId) === Number(userId)
  };
}

function ownedItemsOfKind(userId, kind) {
  clearExpiredStatuses();
  const rows = db.all(
    `SELECT i.* FROM shop_items i
     LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = ?
     WHERE i.kind = ? AND i.is_active = 1
     ORDER BY i.sort_order ASC`,
    [userId, kind]
  );
  return rows.map((item) => ({
    ...item,
    owned: isFree(item) || !!db.get('SELECT 1 AS ok FROM user_items WHERE user_id = ? AND item_id = ?', [userId, item.id])
  }));
}

/* ---------- Applying decoration ---------- */

function applyBanner(userId, itemId) {
  const user = db.get('SELECT id, role FROM users WHERE id = ?', [userId]);
  ensureDecor(userId);
  if (!itemId) {
    db.run(
      'UPDATE profile_decor SET banner_item_id = NULL, custom_banner_path = NULL, updated_at = ? WHERE user_id = ?',
      [nowIso(), userId]
    );
    db.run('UPDATE users SET banner_id = NULL WHERE id = ?', [userId]);
    return { ok: true, banner: null };
  }
  const item = itemById(itemId);
  if (!item || item.kind !== 'banner' || !item.is_active) return { error: 'Баннер не найден', status: 404 };
  if (item.is_owner_only && user.role !== 'owner') return { error: 'Баннер доступен только владельцу', status: 403 };
  if (!isFree(item) && !ownsItem(userId, item.id) && user.role !== 'owner') {
    return { error: 'Сначала купите этот баннер', status: 403, code: 'not_owned' };
  }
  const theme = BANNER_BY_ID.get(String(item.asset_key).split(':')[1]);
  db.run('UPDATE profile_decor SET banner_item_id = ?, updated_at = ? WHERE user_id = ?', [item.id, nowIso(), userId]);
  if (theme) db.run('UPDATE users SET banner_id = ? WHERE id = ?', [theme.id, userId]);
  const view = bannerView(item, userId);
  return { ok: true, banner: view };
}

function applyBackground(userId, itemId) {
  const user = db.get('SELECT id, role FROM users WHERE id = ?', [userId]);
  ensureDecor(userId);
  if (!itemId) {
    db.run('UPDATE profile_decor SET background_item_id = NULL, updated_at = ? WHERE user_id = ?', [nowIso(), userId]);
    return { ok: true, background: null };
  }
  const item = itemById(itemId);
  if (!item || item.kind !== 'background' || !item.is_active) {
    return { error: 'Фон не найден', status: 404 };
  }
  if (item.is_owner_only && user.role !== 'owner') {
    return { error: 'Этот фон доступен только владельцу', status: 403, code: 'owner_only' };
  }
  if (!isFree(item) && !ownsItem(userId, item.id) && user.role !== 'owner') {
    return { error: 'Сначала купите этот фон', status: 403, code: 'not_owned' };
  }
  db.run('UPDATE profile_decor SET background_item_id = ?, updated_at = ? WHERE user_id = ?', [item.id, nowIso(), userId]);
  return { ok: true, background: backgroundView(item, userId) };
}

function packForEmoji(emojiId) {
  const glass = GLASS_BY_ID.get(emojiId);
  if (!glass) return null;
  return GLASS_PACKS.find((pack) => pack.items.includes(glass.id)) || null;
}

function ownsPack(userId, packId) {
  const pack = GLASS_PACKS.find((entry) => entry.id === packId);
  if (!pack || pack.free) return true;
  const item = db.get('SELECT id FROM shop_items WHERE kind = ? AND asset_key = ?', ['emoji_pack', `emoji:${pack.id}`]);
  if (!item) return false;
  return ownsItem(userId, item.id);
}

function setStatus(userId, { emoji = null, text = '', duration = 'never' }) {
  const user = db.get('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!user) return { error: 'Пользователь не найден', status: 404 };
  ensureDecor(userId);
  if (!emoji) {
    db.run(
      `UPDATE profile_decor SET status_emoji = NULL, status_text = '', status_expires_at = NULL, updated_at = ?
       WHERE user_id = ?`,
      [nowIso(), userId]
    );
    return { ok: true, status: null };
  }
  const pack = packForEmoji(emoji);
  if (!pack) return { error: 'Эмодзи не найден', status: 400 };
  if (!pack.free && !ownsPack(userId, pack.id) && user.role !== 'owner') {
    return { error: 'Этот набор эмодзи не куплен', status: 403, code: 'pack_not_owned', pack: pack.id };
  }
  const cleanText = String(text || '').trim().slice(0, 60);
  const chosen = STATUS_DURATIONS.find((entry) => entry.id === duration) || STATUS_DURATIONS[0];
  let expiresAt = null;
  if (chosen.seconds > 0) expiresAt = new Date(Date.now() + chosen.seconds * 1000).toISOString();
  if (chosen.seconds === -1) {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    expiresAt = end.toISOString();
  }
  db.run(
    `UPDATE profile_decor SET status_emoji = ?, status_text = ?, status_expires_at = ?, updated_at = ?
     WHERE user_id = ?`,
    [emoji, cleanText, expiresAt, nowIso(), userId]
  );
  return { ok: true, status: statusPayload(user, ensureDecor(userId)), durations: STATUS_DURATIONS };
}

/* ---------- Gifts ---------- */

function giftView(row, viewer) {
  const item = itemById(row.item_id);
  const giftId = row.gift_id;
  const gift = GIFT_BY_ID.get(giftId);
  const sender = row.from_user_id
    ? db.get('SELECT id, username, display_name, avatar_path FROM users WHERE id = ?', [row.from_user_id])
    : null;
  const viewerIsOwner = viewer && viewer.role === 'owner';
  const hideSender = !!row.is_anonymous && !viewerIsOwner && (!viewer || viewer.id !== row.from_user_id);
  return {
    id: row.id,
    gift_id: giftId,
    name: gift ? gift.name : item ? item.title : 'Подарок',
    rarity: gift ? gift.rarity : item ? item.rarity : 'common',
    rarity_label: RARITY_LABEL[gift ? gift.rarity : item ? item.rarity : 'common'] || RARITY_LABEL.common,
    svg: giftArt(giftId),
    item_id: row.item_id,
    price: Number(row.price_at_gift) || (item ? item.price : 0),
    edition_number: row.edition_number || null,
    edition_limit: item ? item.edition_limit : null,
    message: row.message || '',
    is_anonymous: !!row.is_anonymous,
    sender: hideSender ? null : sender,
    hidden_sender: hideSender,
    given_at: row.given_at || row.created_at,
    is_pinned: !!row.is_pinned,
    is_hidden: !!row.is_hidden,
    regifted: !!row.regifted,
    mine: !viewer || viewer.id === row.user_id
  };
}

function giftsFor(userId, viewer = null) {
  const owns = !viewer || viewer.id === userId || (viewer && viewer.role === 'owner');
  const rows = db.all(
    `SELECT * FROM user_gifts WHERE user_id = ? ${owns ? '' : 'AND is_hidden = 0'}
     ORDER BY is_pinned DESC, given_at DESC, id DESC`,
    [userId]
  );
  return rows.map((row) => giftView(row, viewer));
}

function giftById(id, viewer) {
  const row = db.get('SELECT * FROM user_gifts WHERE id = ?', [Number(id) || 0]);
  if (!row) return null;
  if (row.user_id !== viewer.id && viewer.role !== 'owner') return null;
  return giftView(row, viewer);
}

function togglePin(userId, giftId, pinned) {
  const max = Number(db.getSetting('shop_max_pinned_gifts', '6')) || 6;
  const row = db.get('SELECT * FROM user_gifts WHERE id = ? AND user_id = ?', [giftId, userId]);
  if (!row) return { error: 'Подарок не найден', status: 404 };
  if (pinned) {
    const count = db.get('SELECT COUNT(*) AS total FROM user_gifts WHERE user_id = ? AND is_pinned = 1', [userId]);
    if (Number(count.total) >= max && !row.is_pinned) {
      return { error: `Можно закрепить не больше ${max} подарков`, status: 400, code: 'pin_limit' };
    }
  }
  db.run('UPDATE user_gifts SET is_pinned = ? WHERE id = ? AND user_id = ?', [pinned ? 1 : 0, row.id, userId]);
  return { ok: true, is_pinned: !!pinned };
}

function setHidden(userId, giftId, hidden) {
  const result = db.run('UPDATE user_gifts SET is_hidden = ? WHERE id = ? AND user_id = ?', [
    hidden ? 1 : 0,
    giftId,
    userId
  ]);
  if (!result.changes) return { error: 'Подарок не найден', status: 404 };
  return { ok: true, is_hidden: !!hidden };
}

function regift(userId, giftId, username) {
  const row = db.get('SELECT * FROM user_gifts WHERE id = ? AND user_id = ?', [giftId, userId]);
  if (!row) return { error: 'Подарок не найден', status: 404 };
  if (row.regifted) return { error: 'Этот подарок уже переподарен', status: 400 };
  const target = db.get('SELECT id, username, is_banned, is_demo FROM users WHERE username = ?', [
    String(username || '').toLowerCase()
  ]);
  if (!target) return { error: 'Пользователь не найден', status: 404 };
  if (target.id === userId) return { error: 'Нельзя подарить подарок самому себе', status: 400 };
  if (target.is_banned || target.is_demo) return { error: 'Получатель недоступен', status: 400 };
  if (isBlockedBetween(userId, target.id)) return { error: 'Получатель недоступен', status: 403 };
  const now = nowIso();
  db.tx(() => {
    db.run('UPDATE user_gifts SET regifted = 1, is_pinned = 0 WHERE id = ?', [row.id]);
    db.run(
      `INSERT INTO user_gifts
       (user_id, gift_id, from_user_id, source, regifted, is_hidden, created_at, item_id, order_id,
        is_anonymous, message, price_at_gift, given_at, edition_number, is_pinned, attrs_json)
       VALUES (?, ?, ?, 'regift', 0, 0, ?, ?, NULL, 0, ?, ?, ?, ?, 0, '{}')`,
      [
        target.id,
        row.gift_id,
        userId,
        now,
        row.item_id,
        row.message || '',
        row.price_at_gift || 0,
        now,
        row.edition_number || null
      ]
    );
  });
  notify({
    userId: target.id,
    type: 'gift',
    actorId: userId,
    refId: row.item_id,
    text: `Вам переподарили «${GIFT_BY_ID.get(row.gift_id)?.name || 'подарок'}»`
  });
  return { ok: true, username: target.username };
}

function giftStats(userId) {
  const row = db.get('SELECT COUNT(*) AS total FROM user_gifts WHERE user_id = ?', [userId]);
  const top = db.all(
    `SELECT from_user_id, COUNT(*) AS total FROM user_gifts
     WHERE user_id = ? AND is_anonymous = 0 AND from_user_id IS NOT NULL
     GROUP BY from_user_id ORDER BY total DESC LIMIT 5`,
    [userId]
  );
  return {
    total: Number(row.total) || 0,
    top_givers: top.map((entry) => {
      const user = db.get('SELECT id, username, display_name, avatar_path FROM users WHERE id = ?', [
        entry.from_user_id
      ]);
      return { user, count: Number(entry.total) };
    })
  };
}

module.exports = {
  STATUS_DURATIONS,
  ensureDecor,
  clearExpiredStatuses,
  decorFor,
  ownedItemsOfKind,
  applyBanner,
  applyBackground,
  setStatus,
  ownsPack,
  packForEmoji,
  giftsFor,
  giftById,
  togglePin,
  setHidden,
  regift,
  giftStats,
  bannerView,
  backgroundView
};
