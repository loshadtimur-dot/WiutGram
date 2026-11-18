'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../../db');
const ads = require('../../lib/ads');
const { adminLog } = require('../../lib/activity');
const { requireOwner, requireSudo, noStore } = require('../../middleware/auth');
const { adminLimiter } = require('../../middleware/rateLimit');
const { toInt, clamp, cleaned } = require('../../middleware/validate');
const { UPLOAD_DIR, MAX_BYTES, deleteUpload } = require('../../utils/files');
const { inspectImage } = require('../../utils/imageMeta');
const { nowIso } = require('../../utils/time');
const { dayKeyOf, shortDayLabel, isoOfHour } = require('../../utils/tashkent');

const router = express.Router();
router.use(requireOwner, noStore, adminLimiter);

const ADS_DIR = path.join(UPLOAD_DIR, 'ads');
const MAX_BANNER_BYTES = 8 * 1024 * 1024;

function ensureAdsDir() {
  fs.mkdirSync(ADS_DIR, { recursive: true });
}

const uploadBanner = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BANNER_BYTES, files: 1 }
}).single('image');

function receiveBanner(req, res, next) {
  uploadBanner(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл больше 8 МБ' });
    return res.status(400).json({ error: 'Не удалось загрузить баннер' });
  });
}

/* ---------- Overview, settings, badge ---------- */

router.get('/overview', (req, res) => {
  res.json(ads.adminOverview());
});

router.get('/badge', (req, res) => {
  const newRequests = db.get("SELECT COUNT(*) AS t FROM ad_requests WHERE status = 'new'").t;
  res.json({ new_requests: newRequests });
});

const BOOLEAN_KEYS = [
  'ads_enabled',
  'ads_swipe_enabled',
  'ads_profile_enabled',
  'ads_show_audience_stats'
];

router.get('/settings', (req, res) => {
  res.json({ settings: ads.getSettings(), raw: db.listSettings() });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const before = ads.getSettings();
  const writes = {};

  for (const key of BOOLEAN_KEYS) {
    if (body[key] !== undefined) writes[key] = body[key] ? '1' : '0';
  }
  if (body.ads_telegram !== undefined) {
    const telegram = String(body.ads_telegram || '').replace(/^@+/, '').trim();
    if (telegram && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)) {
      return res.status(400).json({ error: 'Telegram: 5–32 символа, латиница, цифры и _, начинается с буквы' });
    }
    writes.ads_telegram = telegram;
  }
  if (body.ads_price_per_hour !== undefined) {
    writes.ads_price_per_hour = String(clamp(toInt(body.ads_price_per_hour, 15000), 0, 100000000));
  }
  if (body.ads_horizon_days !== undefined) {
    writes.ads_horizon_days = String(clamp(toInt(body.ads_horizon_days, 30), 1, 90));
  }
  if (body.ads_min_notice_hours !== undefined) {
    writes.ads_min_notice_hours = String(clamp(toInt(body.ads_min_notice_hours, 1), 0, 72));
  }
  if (body.ads_max_hours_per_request !== undefined) {
    writes.ads_max_hours_per_request = String(clamp(toInt(body.ads_max_hours_per_request, 24), 1, 168));
  }
  if (body.ads_fallback_mode !== undefined) {
    writes.ads_fallback_mode = body.ads_fallback_mode === 'hidden' ? 'hidden' : 'house';
  }
  if (body.ads_discounts_json !== undefined) {
    const discounts = ads.parseDiscounts(body.ads_discounts_json);
    writes.ads_discounts_json = discounts.length ? JSON.stringify(discounts) : '';
  }
  if (body.ads_rules_text !== undefined) {
    writes.ads_rules_text = cleaned(body.ads_rules_text, 4000) || ads.getSettings().rules_text;
  }
  if (body.ads_house_title !== undefined) {
    writes.ads_house_title = cleaned(body.ads_house_title, 80);
  }
  if (body.ads_house_text !== undefined) {
    writes.ads_house_text = cleaned(body.ads_house_text, 140);
  }

  for (const [key, value] of Object.entries(writes)) db.setSetting(key, value);
  ads.bustCache();
  const after = ads.getSettings();
  adminLog(req, 'ads_settings', 'ads', { before, after });
  res.json({ settings: after, saved: Object.keys(writes) });
});

/* ---------- Calendar and campaigns ---------- */

router.get('/calendar', (req, res) => {
  res.json(ads.calendar({ from: req.query.from, days: toInt(req.query.days, 14) }));
});

router.get('/campaigns', (req, res) => {
  res.json(
    ads.listCampaigns({
      q: cleaned(req.query.q, 80),
      payment: String(req.query.payment || ''),
      state: String(req.query.state || ''),
      limit: clamp(toInt(req.query.limit, 100), 1, 300),
      offset: Math.max(0, toInt(req.query.offset, 0))
    })
  );
});

router.get('/campaigns/:id', (req, res) => {
  const row = db.get('SELECT * FROM ad_campaigns WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!row) return res.status(404).json({ error: 'Бронь не найдена' });
  return res.json({ campaign: ads.campaignView(row, { withStats: true }) });
});

router.post('/campaigns', (req, res) => {
  const result = ads.createCampaign(req.body || {});
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error, conflicts: result.conflicts });
  }
  adminLog(req, 'ads_campaign_create', `ad_campaign:${result.campaign.id}`, {
    meta: { advertiser: result.campaign.advertiser_name, hours: result.campaign.hours.length }
  });
  return res.status(201).json(result);
});

router.put('/campaigns/:id', (req, res) => {
  const result = ads.updateCampaign(toInt(req.params.id, 0), req.body || {});
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error, conflicts: result.conflicts });
  }
  adminLog(req, 'ads_campaign_update', `ad_campaign:${result.campaign.id}`);
  return res.json(result);
});

router.post('/campaigns/:id/payment', (req, res) => {
  const result = ads.setPaidStatus(toInt(req.params.id, 0), String((req.body && req.body.paid_status) || ''));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'ads_campaign_payment', `ad_campaign:${req.params.id}`, {
    meta: { paid_status: req.body.paid_status }
  });
  return res.json(result);
});

router.post('/campaigns/:id/cancel', requireSudo, (req, res) => {
  const result = ads.cancelCampaign(toInt(req.params.id, 0), cleaned(req.body && req.body.reason, 500));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'ads_campaign_cancel', `ad_campaign:${req.params.id}`, { meta: { reason: req.body && req.body.reason } });
  return res.json(result);
});

router.post('/campaigns/bulk-cancel', requireSudo, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids)
    ? [...new Set(req.body.ids.map((value) => toInt(value, 0)).filter(Boolean))]
    : [];
  if (!ids.length) return res.status(400).json({ error: 'Выберите брони' });
  const reason = cleaned(req.body && req.body.reason, 500) || 'Отменено владельцем';
  const cancelled = [];
  for (const id of ids) {
    const result = ads.cancelCampaign(id, reason);
    if (!result.error) cancelled.push(id);
  }
  adminLog(req, 'ads_campaign_bulk_cancel', 'ads', { meta: { ids, cancelled, reason } });
  return res.json({ ok: true, cancelled });
});

router.post('/campaigns/:id/duplicate', (req, res) => {
  const result = ads.duplicateCampaign(toInt(req.params.id, 0));
  if (result.error) return res.status(result.status || 400).json({ error: result.error, conflicts: result.conflicts });
  adminLog(req, 'ads_campaign_duplicate', `ad_campaign:${result.campaign.id}`);
  return res.status(201).json(result);
});

router.post('/campaigns/:id/report-token', requireSudo, (req, res) => {
  const row = db.get('SELECT * FROM ad_campaigns WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!row) return res.status(404).json({ error: 'Бронь не найдена' });
  const token = crypto.randomBytes(16).toString('hex');
  db.run('UPDATE ad_campaigns SET report_token = ?, updated_at = ? WHERE id = ?', [token, nowIso(), row.id]);
  adminLog(req, 'ads_report_token', `ad_campaign:${row.id}`);
  res.json({ ok: true, report_token: token });
});

function csvEscape(value) {
  return `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`;
}

router.get('/campaigns/:id/export', (req, res) => {
  const row = db.get('SELECT * FROM ad_campaigns WHERE id = ?', [toInt(req.params.id, 0)]);
  if (!row) return res.status(404).json({ error: 'Бронь не найдена' });
  const stats = ads.statsFor(row.id);
  const lines = ['Дата,Час начала (Ташкент),Место,Показы,Уникальные,Клики'];
  for (const point of stats.series) {
    lines.push(
      [
        shortDayLabel(dayKeyOf(point.hour_start)),
        isoOfHour(point.hour_start),
        ads.PLACEMENT_LABELS[point.placement] || point.placement,
        point.impressions,
        point.unique_viewers,
        point.clicks
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  adminLog(req, 'ads_campaign_export', `ad_campaign:${row.id}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ad-campaign-${row.id}.csv"`);
  res.send(`\uFEFF${lines.join('\n')}`);
});

router.get('/revenue', (req, res) => {
  const settings = ads.getSettings();
  res.json({ revenue: ads.revenueSummary(), load: ads.loadSummary(), settings });
});

router.get('/revenue/export', (req, res) => {
  const rows = db.all(
    `SELECT id, advertiser_name, advertiser_telegram, price_total, paid_status, paid_at, status, created_at
     FROM ad_campaigns ORDER BY created_at DESC`
  );
  const lines = ['ID,Рекламодатель,Telegram,Сумма,Оплата,Оплачено,Статус,Создано'];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.advertiser_name,
        row.advertiser_telegram,
        row.price_total,
        row.paid_status,
        row.paid_at || '',
        row.status,
        row.created_at
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  adminLog(req, 'ads_revenue_export', 'ads');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ad-revenue.csv"');
  res.send(`\uFEFF${lines.join('\n')}`);
});

/* ---------- Requests from the public page ---------- */

router.get('/requests', (req, res) => {
  res.json({
    requests: ads.listRequests({ status: String(req.query.status || ''), limit: clamp(toInt(req.query.limit, 100), 1, 300) })
  });
});

router.post('/requests/:id/status', (req, res) => {
  const result = ads.setRequestStatus(
    toInt(req.params.id, 0),
    String((req.body && req.body.status) || ''),
    req.body && req.body.note
  );
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  adminLog(req, 'ads_request_status', `ad_request:${req.params.id}`, { meta: { status: req.body.status } });
  res.json(result);
});

/* ---------- Banner library ---------- */

router.get('/banners', (req, res) => {
  const rows = db.all('SELECT * FROM ad_banners ORDER BY created_at DESC LIMIT 200');
  res.json({
    banners: rows.map((row) => ({
      ...ads.bannerView(row.id),
      in_use: !!ads.bannerInUse(row.id)
    }))
  });
});

router.post('/banners', receiveBanner, (req, res) => {
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Выберите изображение' });
  const buffer = req.file.buffer;
  if (buffer.length > MAX_BANNER_BYTES) return res.status(413).json({ error: 'Файл больше 8 МБ' });
  const meta = inspectImage(buffer);
  if (!meta) {
    return res.status(400).json({ error: 'Допустимы только JPG, PNG или WEBP с корректным содержимым' });
  }
  const ratio = meta.width / meta.height;
  if (meta.width < 800 || meta.height < 200 || Math.abs(ratio - 4) > 0.25) {
    return res.status(400).json({
      error: 'Баннер должен быть в пропорции 4:1 и не меньше 800×200 px (рекомендуется 1600×400)'
    });
  }
  ensureAdsDir();
  const filename = `${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}.${meta.ext}`;
  const destination = path.join(ADS_DIR, filename);
  fs.writeFileSync(destination, buffer);
  const publicPath = `/uploads/ads/${filename}`;
  const result = db.run(
    `INSERT INTO ad_banners (path, width, height, bytes, original_name, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [publicPath, meta.width, meta.height, buffer.length, cleaned(req.file.originalname, 160), nowIso(), req.user.id]
  );
  ads.bustCache();
  adminLog(req, 'ads_banner_upload', `ad_banner:${result.lastInsertRowid}`, {
    meta: { width: meta.width, height: meta.height, bytes: buffer.length }
  });
  res.status(201).json({
    banner: {
      ...ads.bannerView(Number(result.lastInsertRowid)),
      in_use: false
    }
  });
});

router.delete('/banners/:id', requireSudo, (req, res) => {
  const id = toInt(req.params.id, 0);
  const row = ads.bannerRow(id);
  if (!row) return res.status(404).json({ error: 'Баннер не найден' });
  if (ads.bannerInUse(id)) {
    return res.status(409).json({ error: 'Баннер используется в активной брони. Сначала замените его.' });
  }
  db.run('DELETE FROM ad_banners WHERE id = ?', [id]);
  db.run('UPDATE ad_campaigns SET banner_swipe_id = NULL WHERE banner_swipe_id = ?', [id]);
  db.run('UPDATE ad_campaigns SET banner_profile_id = NULL WHERE banner_profile_id = ?', [id]);
  deleteUpload(row.path);
  ads.bustCache();
  adminLog(req, 'ads_banner_delete', `ad_banner:${id}`);
  res.json({ ok: true });
});

module.exports = router;
