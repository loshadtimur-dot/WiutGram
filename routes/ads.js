'use strict';

const express = require('express');
const db = require('../db');
const ads = require('../lib/ads');
const { publicPayment } = require('../lib/ads/payment');
const { adRequestLimiter } = require('../middleware/rateLimit');
const { noStore } = require('../middleware/auth');
const { toInt } = require('../middleware/validate');
const { dayKeyOf, shortDayLabel, todayKey } = require('../utils/tashkent');

const router = express.Router();

/* ---------- Public configuration ---------- */

router.get('/config', noStore, (req, res) => {
  const settings = ads.getSettings();
  res.json({
    enabled: settings.enabled,
    swipe_enabled: settings.swipe_enabled,
    profile_enabled: settings.profile_enabled,
    telegram: settings.telegram,
    payment: publicPayment(settings),
    price_per_hour: settings.price_per_hour,
    horizon_days: settings.horizon_days,
    min_notice_hours: settings.min_notice_hours,
    max_hours_per_request: settings.max_hours_per_request,
    fallback_mode: settings.fallback_mode,
    discounts: settings.discounts,
    rules_text: settings.rules_text,
    show_audience_stats: settings.show_audience_stats,
    house_title: settings.house_title,
    house_text: settings.house_text,
    timezone: 'Asia/Tashkent',
    timezone_note: 'Время указано по Ташкенту',
    today: todayKey()
  });
});

router.get('/availability', noStore, (req, res) => {
  const payload = ads.availability({ fromDay: req.query.from, days: toInt(req.query.days, 0) || undefined });
  res.json(payload);
});

router.get('/audience', noStore, (req, res) => {
  const settings = ads.getSettings();
  if (!settings.show_audience_stats) return res.json({ has_data: false, hidden: true });
  return res.json(ads.audienceStats());
});

/* ---------- Requests from the public page ---------- */

router.post('/requests', adRequestLimiter, (req, res) => {
  const body = req.body || {};
  const rawHours = Array.isArray(body.hours_hours) ? body.hours_hours : body.hours;
  const result = ads.createRequest({
    hours: rawHours,
    contactName: body.contact_name || body.brand || '',
    req
  });
  if (result.error) {
    return res.status(result.status || 400).json({
      error: result.error,
      code: result.status === 409 ? 'slot_conflict' : undefined,
      conflicts: result.conflicts && result.conflicts.length ? result.conflicts : undefined
    });
  }
  return res.status(201).json(result);
});

/* ---------- Live banner ---------- */

router.get('/active', noStore, (req, res) => {
  const placement = String(req.query.placement || 'swipe');
  // The hour can only be overridden in test mode; production always uses the server clock.
  const override =
    process.env.UNI_TEST_MODE === '1' && req.query.hour ? Number(req.query.hour) : undefined;
  res.json(ads.activeBanner(placement, override));
});

router.post('/impression', (req, res) => {
  const body = req.body || {};
  const result = ads.recordImpression({
    campaignId: toInt(body.campaign_id, 0),
    placement: String(body.placement || ''),
    userId: req.user ? req.user.id : null,
    req
  });
  if (!result.ok) return res.status(400).json({ ok: false, error: 'Показ не засчитан' });
  return res.json({ ok: true, counted: !!result.counted });
});

router.get('/click/:campaignId', (req, res) => {
  const result = ads.recordClick({
    campaignId: toInt(req.params.campaignId, 0),
    placement: String(req.query.p || '')
  });
  const fallback = '/advertise';
  if (!result.ok) return res.redirect(302, fallback);
  return res.redirect(302, result.link || fallback);
});

/* ---------- Public advertiser report ---------- */

router.get('/report/:token', noStore, (req, res) => {
  const report = ads.reportByToken(req.params.token);
  if (!report) return res.status(404).json({ error: 'Отчёт не найден' });
  return res.json(report);
});

/* ---------- Audience snapshot (owner-free, aggregate only) ---------- */

router.get('/days', noStore, (req, res) => {
  const rows = db.all(
    'SELECT hour_start, active_users FROM site_activity_hourly ORDER BY hour_start DESC LIMIT 168'
  );
  const byDay = new Map();
  for (const row of rows) {
    const key = dayKeyOf(row.hour_start);
    if (!byDay.has(key)) byDay.set(key, { day: key, label: shortDayLabel(key), peak: 0, total: 0, hours: 0 });
    const bucket = byDay.get(key);
    bucket.total += Number(row.active_users) || 0;
    bucket.hours += 1;
    bucket.peak = Math.max(bucket.peak, Number(row.active_users) || 0);
  }
  res.json({ days: [...byDay.values()].map((bucket) => ({ ...bucket, avg: Math.round(bucket.total / bucket.hours) })) });
});

module.exports = router;
