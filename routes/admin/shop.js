'use strict';

const express = require('express');
const db = require('../../db');
const service = require('../../lib/shop/service');
const { adminLog } = require('../../lib/activity');
const { requireSudo } = require('../../middleware/auth');
const { toInt, cleaned, clamp } = require('../../middleware/validate');
const { nowIso, lastDays } = require('../../utils/time');

const router = express.Router();

router.get('/items', (req, res) => {
  const kind = ['gift', 'emoji_pack', 'banner', 'background'].includes(String(req.query.kind))
    ? String(req.query.kind)
    : null;
  const rows = kind
    ? db.all('SELECT * FROM shop_items WHERE kind = ? ORDER BY sort_order ASC, id ASC', [kind])
    : db.all('SELECT * FROM shop_items ORDER BY kind ASC, sort_order ASC, id ASC');
  res.json({
    items: rows.map((row) => ({
      ...service.itemView(row, req.user),
      is_active: !!row.is_active,
      available_from: row.available_from,
      available_until: row.available_until
    })),
    purchase: service.purchaseSettings()
  });
});

router.post('/items', (req, res) => {
  const body = req.body || {};
  const kind = ['gift', 'emoji_pack', 'banner', 'background'].includes(body.kind) ? body.kind : 'gift';
  const title = cleaned(body.title, 80);
  if (title.length < 2) return res.status(400).json({ error: 'Укажите название' });
  const slug = cleaned(body.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-') || `custom-${Date.now()}`;
  if (db.get('SELECT id FROM shop_items WHERE slug = ?', [slug])) {
    return res.status(409).json({ error: 'Такой slug уже есть' });
  }
  const now = nowIso();
  const result = db.run(
    `INSERT INTO shop_items
     (kind, slug, title, description, price, asset_key, image_path, rarity, edition_limit,
      is_active, is_owner_only, custom_upload, tags, sort_order, available_from, available_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      kind,
      slug,
      title,
      cleaned(body.description, 300),
      Math.max(0, toInt(body.price, 0)),
      cleaned(body.asset_key, 120) || null,
      cleaned(body.image_path, 300) || null,
      ['common', 'rare', 'epic', 'legendary'].includes(body.rarity) ? body.rarity : 'common',
      body.edition_limit ? clamp(toInt(body.edition_limit, 0), 1, 100000) : null,
      body.is_active === false ? 0 : 1,
      body.is_owner_only ? 1 : 0,
      body.custom_upload ? 1 : 0,
      JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 10) : []),
      toInt(body.sort_order, 500),
      cleaned(body.available_from, 40) || null,
      cleaned(body.available_until, 40) || null,
      now,
      now
    ]
  );
  adminLog(req, 'shop_item_create', `item:${result.lastInsertRowid}`, { meta: { title, kind } });
  res.status(201).json({ item: service.itemView(service.itemById(result.lastInsertRowid), req.user) });
});

router.put('/items/:id', (req, res) => {
  const item = service.itemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Товар не найден' });
  const body = req.body || {};
  const fields = [];
  const params = [];
  const push = (column, value) => {
    fields.push(`${column} = ?`);
    params.push(value);
  };
  if (body.title !== undefined) push('title', cleaned(body.title, 80));
  if (body.description !== undefined) push('description', cleaned(body.description, 300));
  if (body.price !== undefined) push('price', Math.max(0, toInt(body.price, item.price)));
  if (body.rarity !== undefined && ['common', 'rare', 'epic', 'legendary'].includes(body.rarity)) {
    push('rarity', body.rarity);
  }
  if (body.edition_limit !== undefined) {
    push('edition_limit', body.edition_limit ? clamp(toInt(body.edition_limit, 0), 1, 100000) : null);
  }
  if (body.is_active !== undefined) push('is_active', body.is_active ? 1 : 0);
  if (body.is_owner_only !== undefined) push('is_owner_only', body.is_owner_only ? 1 : 0);
  if (body.sort_order !== undefined) push('sort_order', toInt(body.sort_order, item.sort_order));
  if (body.available_from !== undefined) push('available_from', cleaned(body.available_from, 40) || null);
  if (body.available_until !== undefined) push('available_until', cleaned(body.available_until, 40) || null);
  if (body.image_path !== undefined) push('image_path', cleaned(body.image_path, 300) || null);
  if (!fields.length) return res.status(400).json({ error: 'Нет изменений' });
  push('updated_at', nowIso());
  params.push(item.id);
  db.run(`UPDATE shop_items SET ${fields.join(', ')} WHERE id = ?`, params);
  adminLog(req, 'shop_item_update', `item:${item.id}`, { before: { price: item.price }, after: body });
  return res.json({ item: service.itemView(service.itemById(item.id), req.user) });
});

router.delete('/items/:id', requireSudo, (req, res) => {
  const item = service.itemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Товар не найден' });
  db.run('UPDATE shop_items SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), item.id]);
  adminLog(req, 'shop_item_hide', `item:${item.id}`);
  res.json({ ok: true });
});

/* ---------- Orders ---------- */

router.get('/orders', (req, res) => {
  const status = ['new', 'contacted', 'paid', 'delivered', 'cancelled', 'refunded'].includes(String(req.query.status))
    ? String(req.query.status)
    : null;
  const q = cleaned(req.query.q, 60);
  const filters = [];
  const params = [];
  if (status) {
    filters.push('o.status = ?');
    params.push(status);
  }
  if (q) {
    filters.push('(o.code LIKE ? OR buyer.username LIKE ? OR recipient.username LIKE ? OR i.title LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT o.* FROM shop_orders o
     JOIN users buyer ON buyer.id = o.buyer_id
     LEFT JOIN users recipient ON recipient.id = o.recipient_id
     JOIN shop_items i ON i.id = o.item_id
     ${where} ORDER BY o.id DESC LIMIT 200`,
    params
  );
  res.json({
    orders: rows.map((row) => service.orderView(row, { viewer: req.user })),
    counts: db.all('SELECT status, COUNT(*) AS total FROM shop_orders GROUP BY status').reduce((acc, row) => {
      acc[row.status] = Number(row.total);
      return acc;
    }, {})
  });
});

router.get('/badge', (req, res) => {
  const row = db.get("SELECT COUNT(*) AS total FROM shop_orders WHERE status = 'new'");
  res.json({ new_orders: Number(row.total) || 0 });
});

router.post('/orders/:id/fulfill', (req, res) => {
  try {
    const result = service.deliver(toInt(req.params.id, 0), {
      actor: req.user,
      note: cleaned(req.body && req.body.note, 300)
    });
    adminLog(req, 'shop_order_fulfilled', `order:${result.order.id}`, {
      meta: { edition: result.editionNumber || null, already: result.already }
    });
    return res.json({ order: service.orderView(result.order, { viewer: req.user }), already: result.already });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Не удалось выдать товар' });
  }
});

router.post('/orders/:id/status', (req, res) => {
  const result = service.setOrderStatus(toInt(req.params.id, 0), String(req.body && req.body.status), {
    actor: req.user,
    note: cleaned(req.body && req.body.note, 300)
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'shop_order_status', `order:${result.order.id}`, { meta: { status: result.order.status } });
  return res.json({ order: service.orderView(result.order, { viewer: req.user }) });
});

router.post('/grant', requireSudo, (req, res) => {
  const username = cleaned(req.body && req.body.username, 24).toLowerCase().replace(/^@/, '');
  const target = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  const result = service.grantItem({
    userId: target.id,
    itemId: toInt(req.body && req.body.item_id, 0),
    actor: req.user,
    anonymous: !!(req.body && req.body.is_anonymous),
    message: cleaned(req.body && req.body.message, 120)
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'shop_item_granted', `user:${target.id}`, { meta: { item_id: req.body && req.body.item_id } });
  return res.json(result);
});

router.post('/revoke', requireSudo, (req, res) => {
  const username = cleaned(req.body && req.body.username, 24).toLowerCase().replace(/^@/, '');
  const target = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  const result = service.revokeItem({
    userId: target.id,
    itemId: toInt(req.body && req.body.item_id, 0),
    reason: cleaned(req.body && req.body.reason, 200)
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'shop_item_revoked', `user:${target.id}`, { meta: { item_id: req.body && req.body.item_id } });
  return res.json(result);
});

/* ---------- Analytics and export ---------- */

router.get('/stats', (req, res) => {
  const days = lastDays(30);
  const paid = db.get(
    "SELECT COUNT(*) AS total, COALESCE(SUM(price_total),0) AS revenue FROM shop_orders WHERE status = 'delivered'"
  );
  const statuses = db.all('SELECT status, COUNT(*) AS total FROM shop_orders GROUP BY status');
  const series = db.all(
    `SELECT substr(COALESCE(paid_at, created_at), 1, 10) AS day, SUM(price_total) AS revenue, COUNT(*) AS orders
     FROM shop_orders WHERE status = 'delivered' AND created_at >= ? GROUP BY day`,
    [`${days[0]}T00:00:00.000Z`]
  );
  const map = new Map(series.map((row) => [row.day, row]));
  const top = db.all(
    `SELECT i.id, i.title, i.kind, COUNT(o.id) AS orders, SUM(o.price_total) AS revenue
     FROM shop_orders o JOIN shop_items i ON i.id = o.item_id
     WHERE o.status = 'delivered' GROUP BY i.id ORDER BY revenue DESC LIMIT 10`
  );
  res.json({
    revenue: Number(paid.revenue) || 0,
    delivered: Number(paid.total) || 0,
    statuses: statuses.reduce((acc, row) => {
      acc[row.status] = Number(row.total);
      return acc;
    }, {}),
    series: days.map((day) => ({
      day,
      revenue: map.has(day) ? Number(map.get(day).revenue) : 0,
      orders: map.has(day) ? Number(map.get(day).orders) : 0
    })),
    top
  });
});

router.get('/orders.csv', (req, res) => {
  const rows = db.all(
    `SELECT o.code, o.status, o.price_total, o.created_at, i.title, b.username AS buyer, r.username AS recipient
     FROM shop_orders o JOIN shop_items i ON i.id = o.item_id
     JOIN users b ON b.id = o.buyer_id LEFT JOIN users r ON r.id = o.recipient_id
     ORDER BY o.id DESC`
  );
  const escape = (value) => `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`;
  const lines = ['code,status,price,created_at,item,buyer,recipient'];
  for (const row of rows) {
    lines.push([row.code, row.status, row.price_total, row.created_at, row.title, row.buyer, row.recipient].map(escape).join(','));
  }
  adminLog(req, 'shop_export', 'orders');
  res.type('text/csv; charset=utf-8').send(`\ufeff${lines.join('\n')}`);
});

module.exports = router;
