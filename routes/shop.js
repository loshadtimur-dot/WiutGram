'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toInt, cleaned } = require('../middleware/validate');
const service = require('../lib/shop/service');
const { adminLog } = require('../lib/activity');

const router = express.Router();
router.use(requireAuth);

const KINDS = ['gift', 'emoji_pack', 'banner', 'background'];

router.get('/catalog', (req, res) => {
  const kind = KINDS.includes(String(req.query.kind)) ? String(req.query.kind) : null;
  const filter = String(req.query.filter || 'all').slice(0, 20);
  const sort = ['price_asc', 'price_desc', 'new'].includes(String(req.query.sort)) ? String(req.query.sort) : null;
  const q = cleaned(req.query.q, 60);
  const items = service.listItems({ kind, filter, sort, q, viewer: req.user });
  res.json({
    items: items.filter((item) => item.available || item.owned),
    settings: service.purchaseSettings(),
    counts: KINDS.reduce((acc, entry) => {
      acc[entry] = service.listItems({ kind: entry, viewer: req.user }).filter((item) => item.available).length;
      return acc;
    }, {})
  });
});

router.get('/config', (req, res) => {
  res.json({ settings: service.purchaseSettings() });
});

router.post('/orders', (req, res) => {
  const body = req.body || {};
  const itemId = toInt(body.item_id, 0);
  const recipientUsername = cleaned(body.recipient_username, 24).toLowerCase().replace(/^@/, '');
  let recipientId = toInt(body.recipient_id, 0) || null;
  if (!recipientId && recipientUsername) {
    const target = db.get('SELECT id FROM users WHERE username = ?', [recipientUsername]);
    if (!target) return res.status(404).json({ error: 'Получатель не найден' });
    recipientId = target.id;
  }
  const result = service.createOrder({
    buyer: req.user,
    itemId,
    recipientId,
    message: cleaned(body.message, 120),
    anonymous: !!body.is_anonymous
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  return res.status(201).json({
    order: result.order,
    item: result.item,
    purchase: result.purchase
  });
});

router.get('/orders/mine', (req, res) => {
  const rows = db.all('SELECT * FROM shop_orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]);
  res.json({ orders: rows.map((row) => service.orderView(row, { viewer: req.user })) });
});

router.get('/orders/:code', (req, res) => {
  const order = db.get('SELECT * FROM shop_orders WHERE code = ?', [String(req.params.code || '').toUpperCase()]);
  if (!order || (order.buyer_id !== req.user.id && req.user.role !== 'owner')) {
    return res.status(404).json({ error: 'Заказ не найден' });
  }
  return res.json({ order: service.orderView(order, { viewer: req.user }), purchase: service.purchaseSettings() });
});

// A gift order can be created straight from a profile or a chat.
router.post('/gifts/send', (req, res) => {
  const body = req.body || {};
  const recipientUsername = cleaned(body.recipient_username, 24).toLowerCase().replace(/^@/, '');
  const target = recipientUsername
    ? db.get('SELECT id FROM users WHERE username = ?', [recipientUsername])
    : null;
  const result = service.createOrder({
    buyer: req.user,
    itemId: toInt(body.item_id, 0),
    recipientId: target ? target.id : null,
    message: cleaned(body.message, 120),
    anonymous: !!body.is_anonymous
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  adminLog(req, 'shop_order_created', `order:${result.order.id}`, {
    meta: { item_id: result.order.item.id, price: result.order.price_total }
  });
  return res.status(201).json({ order: result.order, item: result.item, purchase: result.purchase });
});

module.exports = router;
