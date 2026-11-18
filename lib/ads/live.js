'use strict';

const crypto = require('crypto');
const db = require('../../db');
const { getSecret } = require('../secret');
const { nowIso } = require('../../utils/time');
const { HOUR, nowHourStart, validHour, dayKeyOf, shortDayLabel } = require('../../utils/tashkent');
const { PLACEMENTS, getSettings, placementEnabled } = require('./settings');
const { campaignView, safeLink } = require('./campaigns');
const cache = require('./cache');

/* ---------- Active banner ---------- */

function activeBanner(placement, hourValue) {
  if (!PLACEMENTS.includes(placement)) return { mode: 'hidden', placement, error: 'unknown_placement' };
  const settings = getSettings();
  const hour = validHour(hourValue) || nowHourStart();
  const cacheKey = `${placement}:${hour}`;
  if (cache.has(cacheKey)) return cache.read(cacheKey);

  let payload;
  if (!placementEnabled(settings, placement)) {
    payload = { mode: 'hidden', placement, hour_start: hour, timezone_note: 'Время указано по Ташкенту' };
  } else {
    const row = db.get(
      `SELECT c.id, c.alt_text, c.link_url, c.banner_swipe_id, c.banner_profile_id,
              b.path AS banner_path
       FROM ad_slots s
       JOIN ad_campaigns c ON c.id = s.campaign_id
       LEFT JOIN ad_banners b ON b.id = CASE WHEN s.placement = 'swipe' THEN c.banner_swipe_id ELSE c.banner_profile_id END
       WHERE s.placement = ? AND s.hour_start = ? AND c.status = 'active'
       LIMIT 1`,
      [placement, hour]
    );
    if (row && row.banner_path) {
      payload = {
        mode: 'banner',
        placement,
        hour_start: hour,
        campaign_id: row.id,
        image_url: row.banner_path,
        alt: row.alt_text || 'Реклама',
        click_url: row.link_url || '',
        label: 'Реклама',
        advertise_url: '/advertise',
        timezone_note: 'Время указано по Ташкенту'
      };
    } else {
      payload = {
        mode: settings.fallback_mode,
        placement,
        hour_start: hour,
        title: settings.house_title,
        text: settings.house_text,
        price_per_hour: settings.price_per_hour,
        advertise_url: '/advertise',
        timezone_note: 'Время указано по Ташкенту'
      };
    }
  }
  cache.write(cacheKey, payload);
  return payload;
}

/* ---------- Tracking ---------- */

function ensureStats(campaignId, placement, hour) {
  db.run(
    `INSERT OR IGNORE INTO ad_stats (campaign_id, placement, hour_start, impressions, unique_viewers, clicks)
     VALUES (?, ?, ?, 0, 0, 0)`,
    [campaignId, placement, hour]
  );
}

// Viewer identity: account id, or a salted hash of IP + user agent.
function viewerKey(req, userId) {
  if (userId) return `u:${userId}`;
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  const ua = String((req.headers && req.headers['user-agent']) || '');
  const day = dayKeyOf(nowHourStart());
  const salt = `${getSecret().slice(0, 24)}:${day}`;
  return `a:${crypto.createHash('sha256').update(`${ip}|${ua}|${salt}`).digest('hex').slice(0, 24)}`;
}

function recordImpression({ campaignId, placement, userId, req }) {
  if (!PLACEMENTS.includes(placement)) return { ok: false, error: 'unknown_placement' };
  const hour = nowHourStart();
  const campaign = db.get("SELECT * FROM ad_campaigns WHERE id = ? AND status = 'active'", [Number(campaignId)]);
  if (!campaign) return { ok: false, error: 'not_found' };
  const slot = db.get('SELECT id FROM ad_slots WHERE campaign_id = ? AND placement = ? AND hour_start = ?', [
    campaign.id,
    placement,
    hour
  ]);
  if (!slot) return { ok: false, error: 'inactive' };

  ensureStats(campaign.id, placement, hour);
  const viewer = viewerKey(req, userId);
  const inserted = db.run(
    'INSERT OR IGNORE INTO ad_views (campaign_id, placement, hour_start, viewer_key, created_at) VALUES (?, ?, ?, ?, ?)',
    [campaign.id, placement, hour, viewer, nowIso()]
  );
  if (!inserted.changes) return { ok: true, counted: false };
  db.run(
    'UPDATE ad_stats SET impressions = impressions + 1, unique_viewers = unique_viewers + 1 WHERE campaign_id = ? AND placement = ? AND hour_start = ?',
    [campaign.id, placement, hour]
  );
  return { ok: true, counted: true };
}

function recordClick({ campaignId, placement }) {
  const hour = nowHourStart();
  const campaign = db.get("SELECT * FROM ad_campaigns WHERE id = ? AND status = 'active'", [Number(campaignId)]);
  if (!campaign) return { ok: false, error: 'not_found' };
  if (!PLACEMENTS.includes(placement)) {
    const anySlot = db.get('SELECT placement FROM ad_slots WHERE campaign_id = ? AND hour_start = ? LIMIT 1', [
      campaign.id,
      hour
    ]);
    if (!anySlot) return { ok: false, error: 'inactive', link: '' };
    placement = anySlot.placement;
  } else {
    const slot = db.get('SELECT id FROM ad_slots WHERE campaign_id = ? AND placement = ? AND hour_start = ?', [
      campaign.id,
      placement,
      hour
    ]);
    if (!slot) return { ok: false, error: 'inactive', link: '' };
  }
  ensureStats(campaign.id, placement, hour);
  db.run('UPDATE ad_stats SET clicks = clicks + 1 WHERE campaign_id = ? AND placement = ? AND hour_start = ?', [
    campaign.id,
    placement,
    hour
  ]);
  return { ok: true, link: safeLink(campaign.link_url) };
}

function statsFor(campaignId) {
  const rows = db.all(
    'SELECT placement, hour_start, impressions, unique_viewers, clicks FROM ad_stats WHERE campaign_id = ? ORDER BY hour_start ASC',
    [campaignId]
  );
  const totals = rows.reduce(
    (acc, row) => {
      acc.impressions += Number(row.impressions) || 0;
      acc.unique_viewers += Number(row.unique_viewers) || 0;
      acc.clicks += Number(row.clicks) || 0;
      return acc;
    },
    { impressions: 0, unique_viewers: 0, clicks: 0 }
  );
  totals.ctr = totals.impressions ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0;
  return {
    totals,
    series: rows.map((row) => ({
      placement: row.placement,
      hour_start: Number(row.hour_start),
      impressions: Number(row.impressions) || 0,
      unique_viewers: Number(row.unique_viewers) || 0,
      clicks: Number(row.clicks) || 0
    }))
  };
}

/* ---------- Public report ---------- */

function reportByToken(token) {
  const row = db.get('SELECT * FROM ad_campaigns WHERE report_token = ?', [String(token || '')]);
  if (!row) return null;
  const campaign = campaignView(row, { withStats: true });
  const byDay = new Map();
  for (const point of campaign.stats.series) {
    const key = dayKeyOf(point.hour_start);
    if (!byDay.has(key)) {
      byDay.set(key, { day: key, label: shortDayLabel(key), impressions: 0, unique_viewers: 0, clicks: 0 });
    }
    const bucket = byDay.get(key);
    bucket.impressions += point.impressions;
    bucket.unique_viewers = Math.max(bucket.unique_viewers, point.unique_viewers);
    bucket.clicks += point.clicks;
  }
  return {
    advertiser_name: campaign.advertiser_name,
    status: campaign.status,
    placements: campaign.placement_labels,
    hours_text: campaign.hours_text,
    price_total: campaign.price_total,
    paid_status: campaign.paid_status,
    banner: campaign.banner_swipe || campaign.banner_profile,
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
    totals: campaign.stats.totals,
    days: [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    timezone_note: 'Время указано по Ташкенту'
  };
}

module.exports = {
  activeBanner,
  bustCache: cache.bustCache,
  recordImpression,
  recordClick,
  statsFor,
  reportByToken,
  viewerKey,
  ensureStats,
  HOUR
};
