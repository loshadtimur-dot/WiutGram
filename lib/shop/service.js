'use strict';

const crypto = require('crypto');
const db = require('../../db');
const { nowIso } = require('../../utils/time');
const { notify } = require('../notify');
const { emitToUser } = require('../io');
const { isBlockedBetween } = require('../blocks');
const { BANNER_BY_ID, BACKGROUND_BY_ID } = require('../design/themes');
const { GLASS_BY_ID, GLASS_PACKS } = require('../design/glass');
const { giftArt, GIFT_BY_ID } = require('../design/gifts');
const { RARITY_LABEL } = require('../design');

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function orderCode() {
  let body = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    body += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `SH-${body}`;
}

function uniqueOrderCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = orderCode();
    if (!db.get('SELECT id FROM shop_orders WHERE code = ?', [code])) return code;
  }
  return `SH-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

/* ---------- Catalogue ---------- */

function purchaseSettings() {
  const telegram = String(db.getSetting('owner_telegram', '') || db.getSetting('ads_telegram', '')).replace(/^@+/, '');
  const showCard = db.getSetting('ads_show_card', '1') !== '0';
  const cardNumber = String(db.getSetting('ads_card_number', '') || '');
  return {
    telegram,
    show_card: showCard && !!cardNumber,
    card_number: showCard ? cardNumber : '',
    card_holder: showCard ? String(db.getSetting('ads_card_holder', '') || '') : '',
    card_bank: showCard ? String(db.getSetting('ads_card_bank', '') || '') : '',
    payment_note: String(db.getSetting('ads_payment_note', '') || ''),
    shop_enabled: db.getSetting('shop_enabled', '1') === '1'
  };
}

function itemAsset(item) {
  const key = String(item.asset_key || '');
  if (item.kind === 'gift') {
    const giftId = key.replace(/^gift-/, '');
    const gift = GIFT_BY_ID.get(giftId);
    return {
      sprite: `gift-${giftId}`,
      svg: gift ? giftArt(giftId) : '',
      rarity: gift ? gift.rarity : item.rarity
    };
  }
  if (item.kind === 'banner' || item.kind === 'background') {
    const map = item.kind === 'banner' ? BANNER_BY_ID : BACKGROUND_BY_ID;
    const theme = map.get(key.split(':')[1]);
    if (!theme) return null;
    return { theme: theme.theme, accent: theme.accent, pattern: theme.pattern, title: theme.name };
  }
  if (item.kind === 'emoji_pack') {
    const pack = GLASS_PACKS.find((entry) => entry.id === key.split(':')[1]);
    if (!pack) return null;
    return { pack: pack.id, icons: pack.items.map((id) => ({ id, name: GLASS_BY_ID.get(id).name })) };
  }
  return null;
}

function ownedItemIds(userId) {
  if (!userId) return new Set();
  const rows = db.all('SELECT item_id FROM user_items WHERE user_id = ?', [userId]);
  return new Set(rows.map((row) => row.item_id));
}

function legacyOwnedSlugs(userId) {
  if (!userId) return new Set();
  const banners = new Set(
    db
      .all('SELECT banner_id FROM user_banners WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)', [
        userId,
        nowIso()
      ])
      .map((row) => row.banner_id)
  );
  return banners;
}

function itemView(item, viewer) {
  const owned = viewer ? ownedItemIds(viewer.id).has(item.id) : false;
  const legacyBanner =
    item.kind === 'banner' && viewer ? legacyOwnedSlugs(viewer.id).has(String(item.asset_key).split(':')[1]) : false;
  const remaining = item.edition_limit === null ? null : Math.max(0, item.edition_limit - item.edition_sold);
  const available =
    !!item.is_active &&
    (!item.is_owner_only || (viewer && viewer.role === 'owner')) &&
    (!item.available_until || item.available_until > nowIso()) &&
    (remaining === null || remaining > 0 || owned);
  return {
    id: item.id,
    kind: item.kind,
    slug: item.slug,
    title: item.title,
    description: item.description,
    price: money(item.price),
    rarity: item.rarity,
    rarity_label: RARITY_LABEL[item.rarity] || RARITY_LABEL.common,
    edition_limit: item.edition_limit,
    edition_sold: item.edition_sold,
    remaining,
    is_owner_only: !!item.is_owner_only,
    tags: safeTags(item.tags),
    sort_order: item.sort_order,
    asset: itemAsset(item),
    owned: owned || legacyBanner,
    available
  };
}

function safeTags(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function listItems({ kind, filter, q, sort, viewer } = {}) {
  const filters = ['is_active = 1'];
  const params = [];
  if (kind) {
    filters.push('kind = ?');
    params.push(kind);
  }
  if (q) {
    filters.push('(title LIKE ? OR description LIKE ? OR slug LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (!viewer || viewer.role !== 'owner') filters.push('is_owner_only = 0');
  let order = 'sort_order ASC, price ASC';
  if (sort === 'price_desc') order = 'price DESC, sort_order ASC';
  if (sort === 'price_asc') order = 'price ASC, sort_order ASC';
  if (sort === 'new') order = 'id DESC';
  const rows = db.all(`SELECT * FROM shop_items WHERE ${filters.join(' AND ')} ORDER BY ${order}`, params);
  let items = rows.map((row) => itemView(row, viewer));
  if (filter && filter !== 'all') {
    const tags = { new: 'new', popular: 'popular', limited: 'limited', holiday: 'holiday', student: 'student' };
    const tag = tags[filter];
    items = items.filter((item) => (tag ? item.tags.includes(tag) || (tag === 'limited' && item.edition_limit) : true));
  }
  return items;
}

function itemById(id) {
  return db.get('SELECT * FROM shop_items WHERE id = ?', [Number(id) || 0]);
}

/* ---------- Orders ---------- */

function openOrdersLastHour(userId) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const row = db.get(
    `SELECT COUNT(*) AS total FROM shop_orders
     WHERE buyer_id = ? AND status IN ('new','contacted') AND created_at >= ?`,
    [userId, since]
  );
  return Number(row.total) || 0;
}

function createOrder({ buyer, itemId, recipientId = null, message = '', anonymous = false, custom = null }) {
  if (db.getSetting('shop_enabled', '1') !== '1') {
    return { error: 'Магазин временно закрыт', status: 403 };
  }
  const item = itemById(itemId);
  if (!item || !item.is_active) return { error: 'Товар недоступен', status: 404 };
  if (item.is_owner_only && buyer.role !== 'owner') return { error: 'Товар недоступен', status: 404 };
  const limit = Number(db.getSetting('shop_orders_per_hour', '5')) || 5;
  if (openOrdersLastHour(buyer.id) >= limit) {
    return { error: 'Слишком много неоплаченных заказов. Попробуйте позже.', status: 429, code: 'too_many_orders' };
  }
  if (item.edition_limit !== null && item.edition_sold >= item.edition_limit) {
    return { error: 'Лимитное издание распродано', status: 409 };
  }
  let recipient = null;
  if (item.kind === 'gift') {
    if (!recipientId) return { error: 'Выберите получателя', status: 400 };
    recipient = db.get('SELECT id, username, display_name, is_banned FROM users WHERE id = ?', [recipientId]);
    if (!recipient || recipient.is_banned) return { error: 'Получатель недоступен', status: 404 };
    // A gift for yourself is allowed: it is simply a purchase that stays in your collection.
    if (recipient.id !== buyer.id && isBlockedBetween(recipient.id, buyer.id)) {
      return { error: 'Получатель недоступен', status: 403 };
    }
  }
  const maxMessage = Number(db.getSetting('shop_gift_message_max', '120')) || 120;
  const price = money(custom === null ? item.price : Math.min(item.price, custom));
  const code = uniqueOrderCode();
  const createdAt = nowIso();
  const result = db.run(
    `INSERT INTO shop_orders
     (code, buyer_id, recipient_id, item_id, price_total, message, is_anonymous, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [
      code,
      buyer.id,
      recipient ? recipient.id : null,
      item.id,
      price,
      String(message || '').slice(0, maxMessage),
      anonymous ? 1 : 0,
      createdAt
    ]
  );
  return {
    order: orderView(db.get('SELECT * FROM shop_orders WHERE id = ?', [Number(result.lastInsertRowid)]), {
      viewer: buyer,
      item
    }),
    item: itemView(item, buyer),
    purchase: purchaseSettings()
  };
}

function orderView(order, { viewer = null, item = null } = {}) {
  if (!order) return null;
  const entry = item || itemById(order.item_id);
  const buyer = db.get('SELECT id, username, display_name, avatar_path FROM users WHERE id = ?', [order.buyer_id]);
  const recipient = order.recipient_id
    ? db.get('SELECT id, username, display_name, avatar_path FROM users WHERE id = ?', [order.recipient_id])
    : null;
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    price_total: money(order.price_total),
    message: order.message,
    is_anonymous: !!order.is_anonymous,
    note: viewer && viewer.role === 'owner' ? order.note : undefined,
    created_at: order.created_at,
    paid_at: order.paid_at,
    delivered_at: order.delivered_at,
    buyer,
    recipient,
    item: entry ? itemView(entry, viewer) : null
  };
}

/* ---------- Fulfilment ---------- */

function dmConversation(userA, userB) {
  return db.get(
    `SELECT c.* FROM conversations c
     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
     WHERE c.type = 'dm' AND c.deleted_at IS NULL
     ORDER BY c.id ASC LIMIT 1`,
    [userA, userB]
  );
}

function giftMessageFor({ fromId, toId, item, message }) {
  const conversation = dmConversation(fromId, toId);
  if (!conversation) return null;
  const seqRow = db.get('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages WHERE conversation_id = ?', [
    conversation.id
  ]);
  const createdAt = nowIso();
  const body = JSON.stringify({ item_id: item.id, gift: item.asset_key, message: message || '' });
  const result = db.run(
    `INSERT INTO messages (conversation_id, seq, sender_id, type, body, meta_json, created_at)
     VALUES (?, ?, ?, 'gift', ?, ?, ?)`,
    [conversation.id, seqRow.seq, fromId, body, body, createdAt]
  );
  db.run('UPDATE conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?', [
    Number(result.lastInsertRowid),
    createdAt,
    conversation.id
  ]);
  const payload = {
    id: Number(result.lastInsertRowid),
    conversation_id: conversation.id,
    seq: seqRow.seq,
    sender_id: fromId,
    type: 'gift',
    body,
    meta_json: body,
    created_at: createdAt,
    mine: false
  };
  emitToUser(toId, 'message:new', { message: payload, conversation_id: conversation.id });
  emitToUser(fromId, 'message:new', { message: { ...payload, mine: true }, conversation_id: conversation.id });
  return payload;
}

// Creates the owned record, assigns an edition number atomically and notifies.
function deliver(orderId, { actor = null, note = null } = {}) {
  return db.tx(() => {
    const order = db.get('SELECT * FROM shop_orders WHERE id = ?', [orderId]);
    if (!order) throw Object.assign(new Error('Заказ не найден'), { status: 404 });
    if (order.status === 'delivered') return { order, already: true };
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw Object.assign(new Error('Заказ отменён'), { status: 409 });
    }
    const item = itemById(order.item_id);
    if (!item) throw Object.assign(new Error('Товар не найден'), { status: 404 });

    let editionNumber = null;
    if (item.edition_limit !== null) {
      const update = db.run(
        `UPDATE shop_items SET edition_sold = edition_sold + 1
         WHERE id = ? AND edition_sold < edition_limit`,
        [item.id]
      );
      if (!update.changes) throw Object.assign(new Error('Лимитное издание распродано'), { status: 409 });
      editionNumber = db.get('SELECT edition_sold FROM shop_items WHERE id = ?', [item.id]).edition_sold;
    }

    const now = nowIso();
    const giftId = String(item.asset_key || '').replace(/^gift-/, '');
    if (item.kind === 'gift') {
      db.run(
        `INSERT INTO user_gifts
         (user_id, gift_id, from_user_id, source, regifted, is_hidden, created_at, item_id, order_id,
          is_anonymous, message, price_at_gift, given_at, edition_number, is_pinned, attrs_json)
         VALUES (?, ?, ?, 'shop', 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
        [
          order.recipient_id,
          giftId,
          order.buyer_id,
          now,
          item.id,
          order.id,
          order.is_anonymous,
          order.message,
          order.price_total,
          now,
          editionNumber
        ]
      );
      notify({
        userId: order.recipient_id,
        type: 'gift',
        actorId: order.is_anonymous ? null : order.buyer_id,
        refId: order.id,
        text: `Вам подарили «${item.title}»`
      });
      giftMessageFor({
        fromId: order.buyer_id,
        toId: order.recipient_id,
        item: { id: item.id, asset_key: item.asset_key },
        message: order.is_anonymous ? '' : order.message
      });
    } else {
      db.run(
        `INSERT INTO user_items (user_id, item_id, order_id, acquired_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, item_id) DO UPDATE SET order_id = excluded.order_id`,
        [order.recipient_id || order.buyer_id, item.id, order.id, now]
      );
      notify({
        userId: order.recipient_id || order.buyer_id,
        type: 'shop',
        actorId: actor ? actor.id : null,
        refId: item.id,
        text: `Товар «${item.title}» добавлен в ваш инвентарь`
      });
    }

    db.run(
      `UPDATE shop_orders SET status = 'delivered', paid_at = COALESCE(paid_at, ?),
        delivered_at = ?, handled_by = ?, note = COALESCE(?, note) WHERE id = ?`,
      [now, now, actor ? actor.id : null, note, order.id]
    );
    return { order: db.get('SELECT * FROM shop_orders WHERE id = ?', [order.id]), already: false, editionNumber };
  });
}

function setOrderStatus(orderId, status, { actor, note = '' } = {}) {
  const allowed = ['new', 'contacted', 'paid', 'cancelled', 'refunded'];
  if (!allowed.includes(status)) return { error: 'Некорректный статус', status: 400 };
  const order = db.get('SELECT * FROM shop_orders WHERE id = ?', [orderId]);
  if (!order) return { error: 'Заказ не найден', status: 404 };
  if (order.status === 'delivered') return { error: 'Заказ уже выдан', status: 409 };
  const now = nowIso();
  db.run(
    `UPDATE shop_orders SET status = ?, note = ?, handled_by = ?,
      paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END
     WHERE id = ?`,
    [status, note, actor ? actor.id : null, status, now, order.id]
  );
  return { order: db.get('SELECT * FROM shop_orders WHERE id = ?', [order.id]) };
}

// Owner gift without payment. Uses the same owned-record shape as a real order.
function grantItem({ userId, itemId, actor, anonymous = false, message = '' }) {
  const item = itemById(itemId);
  const target = db.get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
  if (!item || !target) return { error: 'Товар или пользователь не найден', status: 404 };
  const now = nowIso();
  if (item.kind === 'gift') {
    let editionNumber = null;
    if (item.edition_limit !== null) {
      const update = db.run(
        'UPDATE shop_items SET edition_sold = edition_sold + 1 WHERE id = ? AND edition_sold < edition_limit',
        [item.id]
      );
      if (!update.changes) return { error: 'Лимитное издание распродано', status: 409 };
      editionNumber = db.get('SELECT edition_sold FROM shop_items WHERE id = ?', [item.id]).edition_sold;
    }
    db.run(
      `INSERT INTO user_gifts
       (user_id, gift_id, from_user_id, source, regifted, is_hidden, created_at, item_id, is_anonymous,
        message, price_at_gift, given_at, edition_number, is_pinned, attrs_json)
       VALUES (?, ?, ?, 'admin', 0, 0, ?, ?, ?, ?, 0, ?, ?, 0, '{}')`,
      [
        target.id,
        String(item.asset_key).replace(/^gift-/, ''),
        actor ? actor.id : null,
        now,
        item.id,
        anonymous ? 1 : 0,
        message,
        now,
        editionNumber
      ]
    );
    notify({ userId: target.id, type: 'gift', actorId: actor ? actor.id : null, text: `Вам выдан подарок «${item.title}»` });
  } else {
    db.run(
      `INSERT INTO user_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, item_id) DO NOTHING`,
      [target.id, item.id, now]
    );
    notify({ userId: target.id, type: 'shop', actorId: actor ? actor.id : null, text: `Вам выдан товар «${item.title}»` });
  }
  return { ok: true };
}

function revokeItem({ userId, itemId, reason = '' }) {
  const item = itemById(itemId);
  if (!item) return { error: 'Товар не найден', status: 404 };
  if (item.kind === 'gift') {
    const row = db.get('SELECT id FROM user_gifts WHERE user_id = ? AND item_id = ? ORDER BY id DESC LIMIT 1', [
      userId,
      itemId
    ]);
    if (!row) return { error: 'У пользователя нет такого подарка', status: 404 };
    db.run('DELETE FROM user_gifts WHERE id = ?', [row.id]);
  } else {
    db.run('DELETE FROM user_items WHERE user_id = ? AND item_id = ?', [userId, itemId]);
  }
  db.run(
    `UPDATE profile_decor SET banner_item_id = CASE WHEN banner_item_id = ? THEN NULL ELSE banner_item_id END,
       background_item_id = CASE WHEN background_item_id = ? THEN NULL ELSE background_item_id END,
       updated_at = ? WHERE user_id = ?`,
    [itemId, itemId, nowIso(), userId]
  );
  notify({ userId, type: 'shop', text: `Владелец отозвал «${item.title}»${reason ? `: ${reason}` : ''}` });
  return { ok: true };
}

module.exports = {
  purchaseSettings,
  listItems,
  itemView,
  itemById,
  itemAsset,
  ownedItemIds,
  createOrder,
  orderView,
  deliver,
  setOrderStatus,
  grantItem,
  revokeItem,
  openOrdersLastHour,
  uniqueOrderCode
};
