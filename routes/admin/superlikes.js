'use strict';

const express = require('express');
const superlikes = require('../../lib/superlikes');
const db = require('../../db');
const { adminLog } = require('../../lib/activity');
const { requireOwner, noStore } = require('../../middleware/auth');
const { adminLimiter } = require('../../middleware/rateLimit');
const { toInt, clamp } = require('../../middleware/validate');

const router = express.Router();
router.use(requireOwner, noStore, adminLimiter);

router.get('/orders', (req, res) => {
  res.json({
    orders: superlikes.listOrders({
      status: String(req.query.status || ''),
      limit: clamp(toInt(req.query.limit, 100), 1, 300)
    })
  });
});

router.get('/badge', (req, res) => {
  res.json(superlikes.badge());
});

router.post('/orders/:id/approve', (req, res) => {
  const result = superlikes.approveOrder(
    toInt(req.params.id, 0),
    req.user.id,
    (req.body && req.body.note) || ''
  );
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'superlike_order_approved', `superlike_order:${req.params.id}`, {
    meta: { quantity: result.order.quantity, price: result.order.price }
  });
  res.json(result);
});

router.post('/orders/:id/reject', (req, res) => {
  const result = superlikes.rejectOrder(
    toInt(req.params.id, 0),
    req.user.id,
    (req.body && req.body.note) || ''
  );
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'superlike_order_rejected', `superlike_order:${req.params.id}`);
  res.json(result);
});

/* ---------- Package settings ---------- */

router.get('/settings', (req, res) => {
  res.json({ settings: superlikes.getSettings() });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const writes = {};
  if (body.superlikes_enabled !== undefined) writes.superlikes_enabled = body.superlikes_enabled ? '1' : '0';
  if (body.superlikes_quantity !== undefined) {
    writes.superlikes_quantity = String(clamp(toInt(body.superlikes_quantity, 100), 1, 1000));
  }
  if (body.superlikes_price !== undefined) {
    writes.superlikes_price = String(clamp(toInt(body.superlikes_price, 10000), 0, 100000000));
  }
  if (body.superlikes_telegram !== undefined) {
    const telegram = String(body.superlikes_telegram || '').replace(/^@+/, '').trim();
    if (telegram && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)) {
      return res.status(400).json({ error: 'Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы' });
    }
    writes.superlikes_telegram = telegram;
  }
  if (body.superlikes_payment_note !== undefined) {
    writes.superlikes_payment_note = String(body.superlikes_payment_note || '').slice(0, 400);
  }
  for (const [key, value] of Object.entries(writes)) db.setSetting(key, value);
  adminLog(req, 'superlike_settings', 'site_settings', { meta: writes });
  res.json({ settings: superlikes.getSettings() });
});

module.exports = router;
