'use strict';

const db = require('../../db');
const {
  HOUR,
  nowHourStart,
  validHour,
  dayKeyOf,
  tashkentDayStart,
  todayKey,
  dayKeysFrom,
  tashkentParts,
  hourLabel,
  hourRangeLabel,
  dayLabel,
  shortDayLabel
} = require('../../utils/tashkent');
const { ADS_DEFAULT_RULES } = require('../../db/ads-schema');
const { normalizeCard } = require('./payment');

const PLACEMENTS = ['swipe', 'profile'];
const PLACEMENT_LABELS = { swipe: 'Свайпы', profile: 'Профили' };
const NUM_LIMITS = {
  price_per_hour: [0, 100000000],
  horizon_days: [1, 90],
  min_notice_hours: [0, 72],
  max_hours_per_request: [1, 168]
};

/* ---------- Settings ---------- */

function parseDiscounts(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      min_hours: Math.max(1, Math.round(Number(item && item.min_hours) || 0)),
      percent: Math.min(100, Math.max(0, Math.round(Number(item && item.percent) || 0)))
    }))
    .filter((item) => item.min_hours > 0 && item.percent > 0)
    .sort((a, b) => a.min_hours - b.min_hours);
}

function clampNumber(value, [min, max], fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function getSettings() {
  const rows = db.all("SELECT key, value FROM site_settings WHERE key LIKE 'ads_%'");
  const map = rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  const disabled = (key) => map[key] === '0';
  return {
    enabled: !disabled('ads_enabled'),
    telegram: String(map.ads_telegram || '').replace(/^@+/, ''),
    card_number: normalizeCard(map.ads_card_number),
    card_holder: String(map.ads_card_holder || ''),
    card_bank: String(map.ads_card_bank || ''),
    show_card: !disabled('ads_show_card'),
    payment_note: String(map.ads_payment_note || ''),
    price_per_hour: clampNumber(map.ads_price_per_hour, NUM_LIMITS.price_per_hour, 15000),
    horizon_days: clampNumber(map.ads_horizon_days, NUM_LIMITS.horizon_days, 30),
    min_notice_hours: clampNumber(map.ads_min_notice_hours, NUM_LIMITS.min_notice_hours, 1),
    max_hours_per_request: clampNumber(map.ads_max_hours_per_request, NUM_LIMITS.max_hours_per_request, 24),
    fallback_mode: map.ads_fallback_mode === 'hidden' ? 'hidden' : 'house',
    swipe_enabled: !disabled('ads_swipe_enabled'),
    profile_enabled: !disabled('ads_profile_enabled'),
    discounts: parseDiscounts(map.ads_discounts_json),
    rules_text: String(map.ads_rules_text || ADS_DEFAULT_RULES),
    show_audience_stats: !disabled('ads_show_audience_stats'),
    house_title: String(map.ads_house_title || 'Здесь может быть ваша реклама'),
    house_text: String(map.ads_house_text || 'Студенты Ташкента увидят ваш баннер')
  };
}

function placementEnabled(settings, placement) {
  if (!settings.enabled) return false;
  if (placement === 'swipe') return settings.swipe_enabled;
  if (placement === 'profile') return settings.profile_enabled;
  return false;
}

function priceForHours(count, settings) {
  const hours = Math.max(0, Math.floor(Number(count) || 0));
  const base = hours * settings.price_per_hour;
  let percent = 0;
  for (const tier of settings.discounts) {
    if (hours >= tier.min_hours) percent = tier.percent;
  }
  const total = Math.round((base * (100 - percent)) / 100 / 100) * 100;
  return {
    base,
    percent,
    discount: base - total,
    total: Math.max(0, total),
    price_per_hour: settings.price_per_hour
  };
}

/* ---------- Availability ---------- */

function busyHoursBetween(startHour, endHour) {
  return db.all(
    `SELECT s.placement, s.hour_start, s.campaign_id
     FROM ad_slots s JOIN ad_campaigns c ON c.id = s.campaign_id
     WHERE c.status = 'active' AND s.hour_start >= ? AND s.hour_start < ?`,
    [startHour, endHour]
  );
}

function availability({ fromDay, days } = {}) {
  const settings = getSettings();
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(String(fromDay || '')) ? String(fromDay) : todayKey();
  const count = Math.min(90, Math.max(1, Number(days) || settings.horizon_days));
  const dayKeys = dayKeysFrom(startDay, count);
  const firstStart = tashkentDayStart(dayKeys[0]);
  const lastStart = tashkentDayStart(dayKeys[dayKeys.length - 1]);
  const busy = busyHoursBetween(firstStart, lastStart + 24 * HOUR);
  const busySet = new Set(busy.map((row) => Number(row.hour_start)));
  const now = nowHourStart();
  const earliest = now + settings.min_notice_hours * HOUR;
  const horizonEnd = now + settings.horizon_days * 24 * HOUR;

  const daysPayload = dayKeys.map((dayKey, index) => {
    const start = tashkentDayStart(dayKey);
    const hours = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const hourStart = start + hour * HOUR;
      let status = 'free';
      if (hourStart < earliest || hourStart >= horizonEnd) status = 'past';
      else if (busySet.has(hourStart)) status = 'busy';
      hours.push({
        hour_start: hourStart,
        hour,
        label: hourLabel(hour),
        range: hourRangeLabel(hour),
        status,
        current: hourStart === now
      });
    }
    return {
      day_key: dayKey,
      label: dayLabel(dayKey),
      short_label: shortDayLabel(dayKey),
      today: index === 0 && dayKey === todayKey(),
      hours
    };
  });

  return {
    timezone: 'Asia/Tashkent',
    timezone_note: 'Время указано по Ташкенту',
    server_hour: now,
    price_per_hour: settings.price_per_hour,
    days: daysPayload,
    audience: settings.show_audience_stats ? audienceStats() : null
  };
}

// Average hourly activity from the last seven days, grouped by hour of day.
function audienceStats() {
  const since = nowHourStart() - 7 * 24 * HOUR;
  const rows = db.all('SELECT hour_start, active_users FROM site_activity_hourly WHERE hour_start >= ?', [since]);
  if (!rows.length) return { has_data: false, avg_per_hour: 0, peak: null, levels: [] };
  const byHour = new Array(24).fill(null).map(() => ({ total: 0, count: 0 }));
  let sum = 0;
  for (const row of rows) {
    const hour = tashkentParts(row.hour_start).hour;
    const value = Number(row.active_users) || 0;
    byHour[hour].total += value;
    byHour[hour].count += 1;
    sum += value;
  }
  const averages = byHour.map((bucket) => (bucket.count ? bucket.total / bucket.count : 0));
  const max = Math.max(...averages);
  let peak = 0;
  averages.forEach((value, index) => {
    if (value > averages[peak]) peak = index;
  });
  const avgPerHour = Math.round(sum / rows.length);
  return {
    has_data: rows.length >= 3,
    avg_per_hour: Math.max(avgPerHour, Math.round(max)),
    peak: { from: peak, to: (peak + 1) % 24, label: `${hourLabel(peak)}–${hourLabel((peak + 1) % 24)}` },
    levels: averages.map((value) => (max <= 0 ? 0 : Math.max(1, Math.round((value / max) * 3))))
  };
}

/* ---------- Hour helpers ---------- */

function groupHours(hours) {
  const sorted = [...new Set(hours.map((hour) => validHour(hour)).filter((hour) => hour !== null))].sort(
    (a, b) => a - b
  );
  const groups = [];
  for (const hour of sorted) {
    const day = dayKeyOf(hour);
    const last = groups[groups.length - 1];
    if (last && last.day === day && last.to === hour) {
      last.to = hour + HOUR;
      last.count += 1;
    } else if (last && last.day === day && last.to === hour + HOUR) {
      // Duplicate consecutive value, ignore.
    } else {
      groups.push({ day, from: hour, to: hour + HOUR, count: 1 });
    }
  }
  return groups;
}

function labelOfHourInDay(hour) {
  return tashkentParts(hour).hour;
}

function describeGroups(hours) {
  return groupHours(hours)
    .map((group) => {
      const from = labelOfHourInDay(group.from);
      const toHour = tashkentParts(group.to - HOUR).hour;
      const range = from === toHour ? `${hourLabel(from)}` : `${hourLabel(from)}–${hourLabel(toHour + 1)}`;
      return `${shortDayLabel(group.day)}: ${range}`;
    })
    .join('; ');
}

function validateHours(rawHours, settings) {
  if (!Array.isArray(rawHours) || !rawHours.length) {
    return { error: 'Выберите хотя бы один час' };
  }
  const hours = [...new Set(rawHours.map((value) => validHour(value)).filter((value) => value !== null))].sort(
    (a, b) => a - b
  );
  if (!hours.length) return { error: 'Выберите часы из сетки' };
  if (hours.length > settings.max_hours_per_request) {
    return { error: `Можно выбрать не больше ${settings.max_hours_per_request} часов за раз` };
  }
  const earliest = nowHourStart() + settings.min_notice_hours * HOUR;
  if (hours.some((hour) => hour < earliest)) {
    return { error: 'Некоторые часы уже прошли или начинаются слишком скоро' };
  }
  const horizonEnd = nowHourStart() + settings.horizon_days * 24 * HOUR;
  if (hours.some((hour) => hour >= horizonEnd)) {
    return { error: 'Выбранные часы вне доступного периода' };
  }
  const busy = busyHoursBetween(hours[0], hours[hours.length - 1] + HOUR);
  const busyStarts = new Set(busy.map((row) => Number(row.hour_start)));
  const conflicts = hours.filter((hour) => busyStarts.has(hour));
  if (conflicts.length) {
    return { error: 'Некоторые часы уже заняты', conflicts, code: 'slot_conflict' };
  }
  return { hours };
}

module.exports = {
  PLACEMENTS,
  PLACEMENT_LABELS,
  NUM_LIMITS,
  getSettings,
  parseDiscounts,
  priceForHours,
  placementEnabled,
  availability,
  audienceStats,
  busyHoursBetween,
  groupHours,
  describeGroups,
  validateHours
};
