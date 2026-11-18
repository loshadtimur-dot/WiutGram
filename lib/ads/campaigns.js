'use strict';

const crypto = require('crypto');
const db = require('../../db');
const { nowIso } = require('../../utils/time');
const { HOUR, nowHourStart, validHour } = require('../../utils/tashkent');
const { PLACEMENTS, PLACEMENT_LABELS, describeGroups, getSettings, priceForHours } = require('./settings');
const { bustCache } = require('./cache');

/* ---------- Views ---------- */

function bannerRow(id) {
  if (!id) return null;
  return db.get('SELECT * FROM ad_banners WHERE id = ?', [Number(id)]);
}

function safeLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 500);
  } catch (err) {
    return '';
  }
}

function slotRows(campaignId) {
  return db.all('SELECT id, placement, hour_start FROM ad_slots WHERE campaign_id = ? ORDER BY hour_start ASC', [
    campaignId
  ]);
}

function bannerView(id) {
  const row = bannerRow(id);
  if (!row) return null;
  return {
    id: row.id,
    path: row.path,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    original_name: row.original_name,
    created_at: row.created_at
  };
}

function campaignView(row, options = {}) {
  if (!row) return null;
  const slots = slotRows(row.id);
  const hours = [...new Set(slots.map((slot) => Number(slot.hour_start)))].sort((a, b) => a - b);
  const placements = [...new Set(slots.map((slot) => slot.placement))];
  // Loaded lazily so the tracking module can depend on the views above.
  const stats = options.withStats ? require('./live').statsFor(row.id) : null;
  return {
    id: row.id,
    advertiser_name: row.advertiser_name,
    advertiser_telegram: row.advertiser_telegram,
    note: row.note,
    link_url: row.link_url,
    alt_text: row.alt_text,
    banner_swipe: bannerView(row.banner_swipe_id),
    banner_profile: bannerView(row.banner_profile_id),
    banner_swipe_id: row.banner_swipe_id,
    banner_profile_id: row.banner_profile_id,
    price_total: row.price_total,
    paid_status: row.paid_status,
    paid_at: row.paid_at,
    status: row.status,
    cancel_reason: row.cancel_reason,
    report_token: row.report_token,
    request_id: row.request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    placements,
    placement_labels: placements.map((placement) => PLACEMENT_LABELS[placement] || placement),
    hours,
    hours_text: describeGroups(hours),
    slot_count: slots.length,
    starts_at: hours.length ? hours[0] : null,
    ends_at: hours.length ? hours[hours.length - 1] + HOUR : null,
    stats
  };
}

// A banner still attached to a running campaign cannot be deleted.
function bannerInUse(bannerId) {
  return db.get(
    `SELECT id FROM ad_campaigns WHERE status = 'active' AND (banner_swipe_id = ? OR banner_profile_id = ?) LIMIT 1`,
    [bannerId, bannerId]
  );
}

/* ---------- Create and update ---------- */

function normalizeCampaignInput(body, settings) {
  const advertiserName = String((body && body.advertiser_name) || '').replace(/[<>]/g, '').trim().slice(0, 120);
  if (advertiserName.length < 2) return { error: 'Укажите рекламодателя' };
  const telegram = String((body && body.advertiser_telegram) || '').replace(/^@+/, '').trim().slice(0, 40);
  if (telegram && !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(telegram)) {
    return { error: 'Telegram должен быть вида username (5–32 символа)' };
  }
  const placements = Array.isArray(body && body.placements)
    ? [...new Set(body.placements.filter((value) => PLACEMENTS.includes(value)))]
    : [];
  if (!placements.length) return { error: 'Выберите хотя бы одно место показа' };
  const rawHours = Array.isArray(body && body.hours) ? body.hours : [];
  const hours = [...new Set(rawHours.map((value) => validHour(value)).filter((value) => value !== null))].sort(
    (a, b) => a - b
  );
  if (!hours.length) return { error: 'Выберите часы' };
  if (hours.length > 24 * 90) return { error: 'Слишком много часов' };
  const earliest = nowHourStart();
  if (hours.some((hour) => hour < earliest)) return { error: 'Нельзя бронировать прошедшие часы' };

  const priceTotal = Math.max(
    0,
    Math.round(Number(body && body.price_total) || priceForHours(hours.length, settings).total)
  );
  const paidStatus = ['unpaid', 'paid', 'refunded'].includes(body && body.paid_status)
    ? body.paid_status
    : 'unpaid';
  const paidAt = paidStatus === 'paid' ? (body && body.paid_at) || nowIso() : null;

  return {
    value: {
      advertiser_name: advertiserName,
      advertiser_telegram: telegram,
      note: String((body && body.note) || '').replace(/[<>]/g, '').trim().slice(0, 1000),
      link_url: safeLink(body && body.link_url),
      alt_text: String((body && body.alt_text) || '').replace(/[<>]/g, '').trim().slice(0, 200),
      banner_swipe_id: body && body.banner_swipe_id ? Number(body.banner_swipe_id) : null,
      banner_profile_id: body && body.banner_profile_id ? Number(body.banner_profile_id) : null,
      price_total: priceTotal,
      paid_status: paidStatus,
      paid_at: paidAt,
      placements,
      hours
    }
  };
}

// Returns a list of slots that are already sold, inside the transaction.
function findConflicts(placements, hours) {
  const marks = hours.map(() => '?').join(', ');
  const rows = db.all(
    `SELECT placement, hour_start FROM ad_slots WHERE placement IN (${placements
      .map(() => '?')
      .join(', ')}) AND hour_start IN (${marks})`,
    [...placements, ...hours]
  );
  return rows.map((row) => ({ placement: row.placement, hour_start: Number(row.hour_start) }));
}

function insertSlots(campaignId, placements, hours) {
  const insert = db.q('INSERT INTO ad_slots (campaign_id, placement, hour_start) VALUES (?, ?, ?)');
  for (const placement of placements) {
    for (const hour of hours) insert.run(campaignId, placement, hour);
  }
}

function createCampaign(body) {
  const settings = getSettings();
  const normalized = normalizeCampaignInput(body, settings);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const value = normalized.value;
  if (value.banner_swipe_id && !bannerRow(value.banner_swipe_id)) return { error: 'Баннер не найден', status: 400 };
  if (value.banner_profile_id && !bannerRow(value.banner_profile_id)) {
    return { error: 'Баннер не найден', status: 400 };
  }

  try {
    const id = db.tx(() => {
      const conflicts = findConflicts(value.placements, value.hours);
      if (conflicts.length) {
        const error = new Error('Некоторые часы уже заняты');
        error.code = 'slot_conflict';
        error.conflicts = conflicts;
        throw error;
      }
      const now = nowIso();
      const result = db.run(
        `INSERT INTO ad_campaigns
         (advertiser_name, advertiser_telegram, note, link_url, alt_text, banner_swipe_id, banner_profile_id,
          price_total, paid_status, paid_at, status, cancel_reason, report_token, request_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?)`,
        [
          value.advertiser_name,
          value.advertiser_telegram,
          value.note,
          value.link_url,
          value.alt_text,
          value.banner_swipe_id,
          value.banner_profile_id,
          value.price_total,
          value.paid_status,
          value.paid_at,
          crypto.randomBytes(16).toString('hex'),
          body && body.request_id ? Number(body.request_id) : null,
          now,
          now
        ]
      );
      const campaignId = Number(result.lastInsertRowid);
      insertSlots(campaignId, value.placements, value.hours);
      if (body && body.request_id) {
        db.run("UPDATE ad_requests SET status = 'converted', handled_at = ? WHERE id = ?", [
          nowIso(),
          Number(body.request_id)
        ]);
      }
      return campaignId;
    });
    bustCache();
    return { campaign: campaignView(db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id]), { withStats: true }) };
  } catch (err) {
    if (err.code === 'slot_conflict') {
      return { error: 'Некоторые часы уже заняты', status: 409, conflicts: err.conflicts };
    }
    return { error: 'Не удалось создать бронь', status: 500 };
  }
}

function updateCampaign(id, body) {
  const row = db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id]);
  if (!row) return { error: 'Бронь не найдена', status: 404 };
  const settings = getSettings();
  const normalized = normalizeCampaignInput({ ...body, price_total: body.price_total }, settings);
  if (normalized.error) return { error: normalized.error, status: 400 };
  const value = normalized.value;

  try {
    db.tx(() => {
      const marks = value.hours.map(() => '?').join(', ');
      const others = db.all(
        `SELECT placement, hour_start FROM ad_slots WHERE campaign_id != ? AND placement IN (${value.placements
          .map(() => '?')
          .join(', ')}) AND hour_start IN (${marks})`,
        [id, ...value.placements, ...value.hours]
      );
      if (others.length) {
        const error = new Error('Некоторые часы уже заняты');
        error.code = 'slot_conflict';
        error.conflicts = others.map((slot) => ({
          placement: slot.placement,
          hour_start: Number(slot.hour_start)
        }));
        throw error;
      }
      db.run('DELETE FROM ad_slots WHERE campaign_id = ?', [id]);
      insertSlots(id, value.placements, value.hours);
      db.run(
        `UPDATE ad_campaigns SET advertiser_name = ?, advertiser_telegram = ?, note = ?, link_url = ?,
           alt_text = ?, banner_swipe_id = ?, banner_profile_id = ?, price_total = ?, paid_status = ?,
           paid_at = ?, updated_at = ? WHERE id = ?`,
        [
          value.advertiser_name,
          value.advertiser_telegram,
          value.note,
          value.link_url,
          value.alt_text,
          value.banner_swipe_id,
          value.banner_profile_id,
          value.price_total,
          value.paid_status,
          value.paid_at,
          nowIso(),
          id
        ]
      );
      if (row.request_id) {
        db.run("UPDATE ad_requests SET status = 'converted', handled_at = ? WHERE id = ? AND status != 'converted'", [
          nowIso(),
          row.request_id
        ]);
      }
    });
    bustCache();
    return { campaign: campaignView(db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id]), { withStats: true }) };
  } catch (err) {
    if (err.code === 'slot_conflict') {
      return { error: 'Некоторые часы уже заняты', status: 409, conflicts: err.conflicts };
    }
    return { error: 'Не удалось обновить бронь', status: 500 };
  }
}

function setPaidStatus(id, paidStatus) {
  if (!['unpaid', 'paid', 'refunded'].includes(paidStatus)) return { error: 'Некорректный статус оплаты' };
  const row = db.get('SELECT id FROM ad_campaigns WHERE id = ?', [id]);
  if (!row) return { error: 'Бронь не найдена', status: 404 };
  db.run('UPDATE ad_campaigns SET paid_status = ?, paid_at = ?, updated_at = ? WHERE id = ?', [
    paidStatus,
    paidStatus === 'paid' ? nowIso() : null,
    nowIso(),
    id
  ]);
  bustCache();
  return { campaign: campaignView(db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id]), { withStats: true }) };
}

function cancelCampaign(id, reason) {
  const row = db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id]);
  if (!row) return { error: 'Бронь не найдена', status: 404 };
  if (row.status === 'cancelled') return { campaign: campaignView(row) };
  db.tx(() => {
    db.run("UPDATE ad_campaigns SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?", [
      String(reason || '').slice(0, 500) || null,
      nowIso(),
      id
    ]);
    db.run('DELETE FROM ad_slots WHERE campaign_id = ?', [id]);
  });
  bustCache();
  return { campaign: campaignView(db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id])) };
}

function duplicateCampaign(id) {
  const row = db.get('SELECT * FROM ad_campaigns WHERE id = ?', [id]);
  if (!row) return { error: 'Бронь не найдена', status: 404 };
  const slots = slotRows(id);
  return createCampaign({
    advertiser_name: row.advertiser_name,
    advertiser_telegram: row.advertiser_telegram,
    note: row.note,
    link_url: row.link_url,
    alt_text: row.alt_text,
    banner_swipe_id: row.banner_swipe_id,
    banner_profile_id: row.banner_profile_id,
    price_total: row.price_total,
    paid_status: 'unpaid',
    placements: [...new Set(slots.map((slot) => slot.placement))],
    hours: [...new Set(slots.map((slot) => Number(slot.hour_start)))]
  });
}

function listCampaigns({ q, payment, state, limit = 100, offset = 0 } = {}) {
  const filters = [];
  const params = [];
  if (q) {
    const like = `%${String(q).toLowerCase()}%`;
    filters.push(`(${db.textLower}(advertiser_name) LIKE ? OR ${db.textLower}(advertiser_telegram) LIKE ?)`);
    params.push(like, like);
  }
  if (['unpaid', 'paid', 'refunded'].includes(payment)) {
    filters.push('paid_status = ?');
    params.push(payment);
  }
  const now = nowHourStart();
  if (state === 'active') {
    filters.push(
      "status = 'active' AND EXISTS (SELECT 1 FROM ad_slots s WHERE s.campaign_id = ad_campaigns.id AND s.hour_start <= ?)"
    );
    params.push(now);
  } else if (state === 'future') {
    filters.push(
      "status = 'active' AND NOT EXISTS (SELECT 1 FROM ad_slots s WHERE s.campaign_id = ad_campaigns.id AND s.hour_start <= ?)"
    );
    params.push(now);
  } else if (state === 'finished') {
    filters.push(
      "status = 'active' AND NOT EXISTS (SELECT 1 FROM ad_slots s WHERE s.campaign_id = ad_campaigns.id AND s.hour_start + 3600 > ?)"
    );
    params.push(now);
  } else if (state === 'cancelled') {
    filters.push("status = 'cancelled'");
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT * FROM ad_campaigns ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Math.min(500, Math.max(1, limit)), Math.max(0, offset)]
  );
  const total = db.get(`SELECT COUNT(*) AS t FROM ad_campaigns ${where}`, params).t;
  return { campaigns: rows.map((row) => campaignView(row)), total };
}

module.exports = {
  bannerRow,
  safeLink,
  slotRows,
  bannerView,
  campaignView,
  bannerInUse,
  createCampaign,
  updateCampaign,
  setPaidStatus,
  cancelCampaign,
  duplicateCampaign,
  listCampaigns
};
