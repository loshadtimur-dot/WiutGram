'use strict';

const db = require('../../db');
const { nowIso } = require('../../utils/time');
const { HOUR, nowHourStart, todayKey, dayKeysFrom, tashkentDayStart } = require('../../utils/tashkent');
const { getSettings } = require('./settings');

/* ---------- Owner overview helpers ---------- */

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function revenueSummary() {
  const paidMonth = db.get(
    "SELECT COALESCE(SUM(price_total), 0) AS t FROM ad_campaigns WHERE paid_status = 'paid' AND paid_at >= ?",
    [monthStartIso()]
  ).t;
  const paidTotal = db.get("SELECT COALESCE(SUM(price_total), 0) AS t FROM ad_campaigns WHERE paid_status = 'paid'").t;
  const unpaid = db.get(
    "SELECT COALESCE(SUM(price_total), 0) AS t FROM ad_campaigns WHERE paid_status = 'unpaid' AND status = 'active'"
  ).t;
  const refunded = db.get("SELECT COALESCE(SUM(price_total), 0) AS t FROM ad_campaigns WHERE paid_status = 'refunded'").t;
  const upcoming = db.all(
    `SELECT c.id, c.advertiser_name, c.price_total, c.paid_status, MIN(s.hour_start) AS starts_at
     FROM ad_campaigns c JOIN ad_slots s ON s.campaign_id = c.id
     WHERE c.status = 'active' AND s.hour_start >= ?
     GROUP BY c.id ORDER BY starts_at ASC LIMIT 8`,
    [nowHourStart()]
  );
  const topAdvertisers = db.all(
    `SELECT advertiser_name, COUNT(*) AS campaigns, COALESCE(SUM(price_total), 0) AS total
     FROM ad_campaigns WHERE paid_status = 'paid'
     GROUP BY advertiser_name ORDER BY total DESC LIMIT 8`
  );
  const unpaidCampaigns = db.all(
    `SELECT c.id, c.advertiser_name, c.advertiser_telegram, c.price_total, MIN(s.hour_start) AS starts_at
     FROM ad_campaigns c LEFT JOIN ad_slots s ON s.campaign_id = c.id
     WHERE c.paid_status = 'unpaid' AND c.status = 'active'
     GROUP BY c.id ORDER BY starts_at ASC LIMIT 20`
  );
  return {
    paid_month: paidMonth,
    paid_total: paidTotal,
    unpaid_total: unpaid,
    refunded_total: refunded,
    upcoming,
    top_advertisers: topAdvertisers,
    unpaid_campaigns: unpaidCampaigns
  };
}

function loadSummary() {
  const now = nowHourStart();
  const result = {};
  for (const days of [7, 30]) {
    const start = now - days * 24 * HOUR;
    const total = days * 24;
    const sold = db.get(
      `SELECT COUNT(DISTINCT s.hour_start) AS t FROM ad_slots s
       JOIN ad_campaigns c ON c.id = s.campaign_id
       WHERE c.status = 'active' AND s.hour_start >= ? AND s.hour_start < ?`,
      [start, now + 24 * HOUR]
    ).t;
    result[`days_${days}`] = { sold, total, percent: Math.round((sold / total) * 100) };
  }
  return result;
}

function adminOverview() {
  const settings = getSettings();
  const now = nowHourStart();
  const warnings = [];
  if (!settings.telegram) warnings.push({ code: 'no_telegram', text: 'Telegram для рекламы не указан' });
  const soon = now + 24 * HOUR;
  const missingBanner = db.all(
    `SELECT DISTINCT c.id, c.advertiser_name, MIN(s.hour_start) AS starts_at
     FROM ad_campaigns c JOIN ad_slots s ON s.campaign_id = c.id
     WHERE c.status = 'active' AND s.hour_start >= ? AND s.hour_start < ?
       AND (c.banner_swipe_id IS NULL OR c.banner_profile_id IS NULL)
     GROUP BY c.id ORDER BY starts_at ASC LIMIT 5`,
    [now, soon]
  );
  for (const row of missingBanner) {
    warnings.push({
      code: 'missing_banner',
      campaign_id: row.id,
      text: `Бронь «${row.advertiser_name}» без баннера начнётся скоро`
    });
  }
  const unpaidSoon = db.all(
    `SELECT DISTINCT c.id, c.advertiser_name, MIN(s.hour_start) AS starts_at
     FROM ad_campaigns c JOIN ad_slots s ON s.campaign_id = c.id
     WHERE c.status = 'active' AND c.paid_status = 'unpaid' AND s.hour_start >= ? AND s.hour_start < ?
     GROUP BY c.id ORDER BY starts_at ASC LIMIT 5`,
    [now, now + 48 * HOUR]
  );
  for (const row of unpaidSoon) {
    const hours = Math.max(0, Math.round((row.starts_at - now) / HOUR));
    warnings.push({
      code: 'unpaid_soon',
      campaign_id: row.id,
      text: `Неоплаченная бронь «${row.advertiser_name}» начинается через ${hours} ч`
    });
  }
  return {
    settings,
    counts: {
      requests_new: db.get("SELECT COUNT(*) AS t FROM ad_requests WHERE status = 'new'").t,
      campaigns_active: db.get("SELECT COUNT(*) AS t FROM ad_campaigns WHERE status = 'active'").t,
      banners: db.get('SELECT COUNT(*) AS t FROM ad_banners').t
    },
    revenue: revenueSummary(),
    load: loadSummary(),
    warnings
  };
}

function calendar({ from, days = 14 } = {}) {
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) ? String(from) : todayKey();
  const dayKeys = dayKeysFrom(startDay, Math.min(31, Math.max(1, Number(days) || 14)));
  const start = tashkentDayStart(dayKeys[0]);
  const end = tashkentDayStart(dayKeys[dayKeys.length - 1]) + 24 * HOUR;
  const slots = db.all(
    `SELECT s.placement, s.hour_start, c.id, c.advertiser_name, c.paid_status, c.status,
       c.banner_swipe_id, c.banner_profile_id, c.price_total
     FROM ad_slots s JOIN ad_campaigns c ON c.id = s.campaign_id
     WHERE s.hour_start >= ? AND s.hour_start < ? ORDER BY s.hour_start ASC`,
    [start, end]
  );
  const campaigns = new Map();
  for (const slot of slots) {
    if (!campaigns.has(slot.id)) {
      campaigns.set(slot.id, {
        id: slot.id,
        advertiser_name: slot.advertiser_name,
        paid_status: slot.paid_status,
        status: slot.status,
        price_total: slot.price_total,
        missing_banner: !slot.banner_swipe_id || !slot.banner_profile_id,
        hours: new Set(),
        placements: new Set()
      });
    }
    const entry = campaigns.get(slot.id);
    entry.hours.add(Number(slot.hour_start));
    entry.placements.add(slot.placement);
  }
  return {
    from: dayKeys[0],
    days: dayKeys,
    now: nowHourStart(),
    campaigns: [...campaigns.values()].map((entry) => ({
      id: entry.id,
      advertiser_name: entry.advertiser_name,
      paid_status: entry.paid_status,
      status: entry.status,
      price_total: entry.price_total,
      missing_banner: entry.missing_banner,
      hours: [...entry.hours].sort((a, b) => a - b),
      placements: [...entry.placements]
    }))
  };
}

// Periodic maintenance: expire stale requests and drop old view rows.
function cleanup() {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  db.run("UPDATE ad_requests SET status = 'expired', handled_at = ? WHERE status = 'new' AND created_at < ?", [
    nowIso(),
    cutoff
  ]);
  const viewsCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  db.run('DELETE FROM ad_views WHERE created_at < ?', [viewsCutoff]);
}

module.exports = {
  monthStartIso,
  revenueSummary,
  loadSummary,
  adminOverview,
  calendar,
  cleanup
};
