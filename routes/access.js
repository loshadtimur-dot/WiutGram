'use strict';

const express = require('express');
const { cleaned } = require('../middleware/validate');
const access = require('../lib/access/service');

const router = express.Router();

// Public recovery form. The answer never reveals whether the account exists.
router.post('/request', (req, res) => {
  const body = req.body || {};
  const identifier = cleaned(body.identifier, 120);
  const contact = cleaned(body.contact, 120);
  const comment = cleaned(body.comment, 500);
  if (identifier.length < 3) {
    return res.status(400).json({ error: 'Укажите username или email' });
  }
  if (contact.length < 2) {
    return res.status(400).json({ error: 'Укажите, как с вами связаться (Telegram)' });
  }
  const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
  access.createRequest({ identifier, contact, comment, ip });
  return res.json({
    ok: true,
    message: 'Запрос отправлен. Владелец свяжется с вами в Telegram.'
  });
});

module.exports = router;
