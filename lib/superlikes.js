'use strict';

const crypto = require('crypto');
const db = require('../db');
const { notify } = require('./notify');
const { ensureSuperLikes, grantSuperLikes, totalSuperLikes } = require('./limits');
const { nowIso } = require('../utils/time');

const STATUSES = ['new', 'approved', 'rejected', 'cancelled'];
const MAX_PENDING_PER_USER = 3;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

// Package configuration lives in site settings so the owner can change it.
function getSettings() {
  const settings = db.listSettings();
  return {
    enabled: settings.superlikes_enabled !== '0',
    quantity: clampInt(settings.superlikes_quantity, 100, 1, 1000),
    price: clampInt(settings.superlikes_price, 10000, 0, 100000000),
    telegram: String(settings.superlikes_telegram || settings.ads_telegram || '')
      .replace(/^@+/, '')
      .trim(),
    payment_note: String(settings.superlikes_payment_note || '').slice(0, 400)
  };
}

function requestCode() {
  let suffix = '';
  for (let index = 0; index < 5; index += 1) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `SL-${suffix}`;
}

function orderView(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    user_id: row.user_id,
    username: row.username || null,
    display_name: row.display_name || null,
    email: row.email || null,
    quantity: row.quantity,
    price: row.price,
    contact: row.contact,
    note: row.note,
    status: row.status,
    admin_note: row.admin_note,
    created_at: row.created_at,
    handled_at: row.handled_at,
    credited_at: row.credited_at
  };
}

function balanceOf(userId) {
  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return { balance: 0, daily: 0, bonus: 0 };
  ensureSuperLikes(user);
  return {
    balance: totalSuperLikes(user),
    daily: Math.max(0, Number(user.super_likes_balance) || 0),
    bonus: Math.max(0, Number(user.super_likes_bonus) || 0)
  };
}

function summaryFor(userId) {
  const settings = getSettings();
  const orders = db
    .all('SELECT * FROM superlike_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId])
    .map(orderView);
  return { ...balanceOf(userId), settings, orders };
}

function createOrder({ userId, contact, note }) {
  const settings = getSettings();
  if (!settings.enabled) return { error: 'Покупка суперлайков временно недоступна', status: 403 };
  const pending = db.get(
    "SELECT COUNT(*) AS t FROM superlike_orders WHERE user_id = ? AND status = 'new'",
    [userId]
  ).t;
  if (pending >= MAX_PENDING_PER_USER) {
    return { error: 'У вас уже есть 3 заявки в ожидании — дождитесь ответа владельца.', status: 429 };
  }
  const cleanContact = String(contact || '').replace(/[<>]/g, '').slice(0, 80).trim();
  const cleanNote = String(note || '').replace(/[<>]/g, '').slice(0, 300).trim();
  const now = nowIso();
  let code = requestCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!db.get('SELECT id FROM superlike_orders WHERE code = ?', [code])) break;
    code = requestCode();
  }
  const result = db.run(
    `INSERT INTO superlike_orders (code, user_id, quantity, price, contact, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
    [code, userId, settings.quantity, settings.price, cleanContact, cleanNote, now]
  );
  const id = Number(result.lastInsertRowid);
  const owner = db.get("SELECT id FROM users WHERE role = 'owner' ORDER BY is_demo ASC, id ASC LIMIT 1");
  if (owner) {
    notify({
      userId: owner.id,
      type: 'superlike_order',
      refId: id,
      text: `Новая заявка на суперлайки ${code}: ${settings.quantity} шт · ${settings.price.toLocaleString('ru-RU')} сум`
    });
  }
  return {
    order: orderView(db.get('SELECT * FROM superlike_orders WHERE id = ?', [id])),
    settings
  };
}

function listOrders({ status, limit = 100 } = {}) {
  const filters = [];
  const params = [];
  if (STATUSES.includes(status)) {
    filters.push('o.status = ?');
    params.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT o.*, u.username, u.display_name, u.email
     FROM superlike_orders o LEFT JOIN users u ON u.id = o.user_id
     ${where} ORDER BY o.created_at DESC LIMIT ?`,
    [...params, Math.min(300, Math.max(1, limit))]
  );
  return rows.map(orderView);
}

function badge() {
  return {
    new_orders: db.get("SELECT COUNT(*) AS t FROM superlike_orders WHERE status = 'new'").t
  };
}

function approveOrder(id, ownerId, adminNote = '') {
  return db.tx(() => {
    const order = db.get('SELECT * FROM superlike_orders WHERE id = ?', [id]);
    if (!order) return { error: 'Заявка не найдена', status: 404 };
    if (order.status === 'approved') return { error: 'Заявка уже подтверждена', status: 409 };
    if (order.status !== 'new') return { error: 'Заявка уже закрыта', status: 409 };
    const now = nowIso();
    const balance = grantSuperLikes(order.user_id, order.quantity);
    db.run(
      `UPDATE superlike_orders
       SET status = 'approved', handled_by = ?, handled_at = ?, credited_at = ?, admin_note = ?
       WHERE id = ?`,
      [ownerId, now, now, String(adminNote || '').slice(0, 300), id]
    );
    notify({
      userId: order.user_id,
      type: 'superlikes',
      refId: id,
      text: `Начислено ${order.quantity} суперлайков. Спасибо за покупку!`
    });
    return { order: orderView(db.get('SELECT * FROM superlike_orders WHERE id = ?', [id])), balance };
  });
}

function rejectOrder(id, ownerId, adminNote = '') {
  return db.tx(() => {
    const order = db.get('SELECT * FROM superlike_orders WHERE id = ?', [id]);
    if (!order) return { error: 'Заявка не найдена', status: 404 };
    if (order.status !== 'new') return { error: 'Заявка уже закрыта', status: 409 };
    const now = nowIso();
    db.run(
      `UPDATE superlike_orders
       SET status = 'rejected', handled_by = ?, handled_at = ?, admin_note = ?
       WHERE id = ?`,
      [ownerId, now, String(adminNote || '').slice(0, 300), id]
    );
    notify({
      userId: order.user_id,
      type: 'superlikes',
      refId: id,
      text: `Заявка ${order.code} на суперлайки отклонена${adminNote ? `: ${adminNote}` : ''}`
    });
    return { order: orderView(db.get('SELECT * FROM superlike_orders WHERE id = ?', [id])) };
  });
}

module.exports = {
  STATUSES,
  getSettings,
  summaryFor,
  balanceOf,
  createOrder,
  listOrders,
  badge,
  approveOrder,
  rejectOrder
};
