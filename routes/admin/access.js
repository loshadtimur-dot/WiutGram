'use strict';

const express = require('express');
const access = require('../../lib/access/service');
const { requireSudo } = require('../../middleware/auth');
const { toInt } = require('../../middleware/validate');

const router = express.Router();

router.get('/requests', (req, res) => {
  res.json({
    requests: access.listRequests({ status: req.query.status || null }),
    counts: {
      new: access.listRequests({ status: 'new' }).length,
      pending: access.newRequestCount()
    }
  });
});

router.get('/badge', (req, res) => {
  res.json({ pending: access.newRequestCount() });
});

router.post('/requests/:id/status', (req, res) => {
  const result = access.setRequestStatus(req, toInt(req.params.id, 0), String(req.body && req.body.status));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

router.get('/users/:id', (req, res) => {
  const card = access.recoveryCard(toInt(req.params.id, 0));
  if (!card) return res.status(404).json({ error: 'Пользователь не найден' });
  return res.json(card);
});

router.post('/users/:id/temp-password', requireSudo, (req, res) => {
  const result = access.issueTempPassword(req, toInt(req.params.id, 0));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

router.post('/users/:id/password', requireSudo, (req, res) => {
  const result = access.setPassword(req, toInt(req.params.id, 0), String((req.body && req.body.password) || ''));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

router.post('/users/:id/revoke-sessions', requireSudo, (req, res) => {
  const result = access.endSessions(req, toInt(req.params.id, 0));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

module.exports = router;
