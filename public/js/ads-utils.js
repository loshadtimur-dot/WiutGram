// Shared helpers for the advertising UI. All times are shown in Tashkent (UTC+5).

export const TASHKENT_OFFSET = 5 * 3600;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function pad(value) {
  return String(value).padStart(2, '0');
}

export function tashkentParts(unixSeconds) {
  const date = new Date((Number(unixSeconds) + TASHKENT_OFFSET) * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    weekday: date.getUTCDay(),
    dayKey: date.toISOString().slice(0, 10)
  };
}

export function dayKeyOf(unixSeconds) {
  return tashkentParts(unixSeconds).dayKey;
}

export function hourOf(unixSeconds) {
  return tashkentParts(unixSeconds).hour;
}

export function hourLabel(unixSeconds) {
  return `${pad(hourOf(unixSeconds))}:00`;
}

export function hourRangeLabel(unixSeconds) {
  return `${pad(hourOf(unixSeconds))}:00–${pad((hourOf(unixSeconds) + 1) % 24)}:00`;
}

export function dayLabel(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function dayChipLabel(dayKey, index) {
  if (index === 0) return 'Сегодня';
  if (index === 1) return 'Завтра';
  const [year, month, day] = String(dayKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function formatSum(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
}

export function priceForHours(count, config) {
  const hours = Math.max(0, Number(count) || 0);
  const base = hours * (Number(config && config.price_per_hour) || 0);
  let percent = 0;
  for (const tier of (config && config.discounts) || []) {
    if (hours >= tier.min_hours) percent = tier.percent;
  }
  const total = Math.round((base * (100 - percent)) / 100 / 100) * 100;
  return { base, percent, discount: base - total, total, price_per_hour: Number(config && config.price_per_hour) || 0 };
}

// Groups raw hour stamps into consecutive ranges per Tashkent day.
export function groupHours(hours) {
  const sorted = [...new Set(hours.map(Number))].sort((a, b) => a - b);
  const groups = [];
  for (const hour of sorted) {
    const day = dayKeyOf(hour);
    const last = groups[groups.length - 1];
    if (last && last.day === day && last.to === hour) {
      last.to = hour + 3600;
      last.count += 1;
    } else if (last && last.day === day && last.to - 3600 >= hour) {
      continue;
    } else {
      groups.push({ day, from: hour, to: hour + 3600, count: 1 });
    }
  }
  return groups;
}

export function groupLabel(group) {
  const from = hourOf(group.from);
  const toHour = hourOf(group.to - 3600);
  const range = from === toHour ? `${pad(from)}:00` : `${pad(from)}:00–${pad(toHour + 1)}:00`;
  return `${dayLabel(group.day)}: ${range}`;
}

export function describeGroups(hours) {
  return groupHours(hours).map(groupLabel).join('; ');
}

export function nextHourDelay() {
  const now = Date.now();
  const next = (Math.floor(now / 3600000) + 1) * 3600000;
  return Math.max(1000, next - now + 1500);
}

// Simple clipboard helper with a legacy fallback.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch (err) {
    return false;
  }
}
