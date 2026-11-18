'use strict';

const express = require('express');
const superlikes = require('../lib/superlikes');
const { requireAuth, noStore } = require('../middleware/auth');
const { superlikeOrderLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(requireAuth, noStore);

/* ---------- Package info, balance and own orders ---------- */

router.get('/', (req, res) => {
  res.json(superlikes.summaryFor(req.user.id));
});

router.get('/package', (req, res) => {
  const settings = superlikes.getSettings();
  res.json({
    enabled: settings.enabled,
    quantity: settings.quantity,
    price: settings.price,
    telegram: settings.telegram,
    payment_note: settings.payment_note
  });
});

/* ---------- Purchase request (paid manually in Telegram) ---------- */

router.post('/orders', superlikeOrderLimiter, (req, res) => {
  const body = req.body || {};
  const result = superlikes.createOrder({
    userId: req.user.id,
    contact: body.contact,
    note: body.note
  });
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  const settings = result.settings;
  const order = result.order;
  const lines = [
    `Здравствуйте! Хочу купить суперлайки на Wiutgram.`,
    `Заявка ${order.code}.`,
    `Пакет: ${order.quantity} суперлайков за ${order.price.toLocaleString('ru-RU')} сум.`
  ];
  if (order.contact) lines.push(`Мой контакт: ${order.contact}`);
  return res.status(201).json({
    order,
    telegram: settings.telegram,
    payment_note: settings.payment_note,
    message: lines.join('\n')
  });
});

module.exports = router;
