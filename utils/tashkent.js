'use strict';

// All advertising slots are stored as UTC unix seconds aligned to the hour.
// Tashkent has a fixed UTC+5 offset and no daylight saving time.

const HOUR = 3600;
const TASHKENT_OFFSET = 5 * HOUR;
const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function nowHourStart() {
  return Math.floor(Date.now() / 1000 / HOUR) * HOUR;
}

// Normalises any unix second value to the start of its hour.
function hourStart(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return Math.floor(seconds / HOUR) * HOUR;
}

function validHour(value) {
  const start = hourStart(value);
  if (start === null) return null;
  if (start < 0 || start > 4102444800) return null;
  return start;
}

// Calendar and clock fields for a slot, expressed in Tashkent local time.
function tashkentParts(hourValue) {
  const seconds = Number(hourValue) + TASHKENT_OFFSET;
  const date = new Date(seconds * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    weekday: date.getUTCDay(),
    dayKey: date.toISOString().slice(0, 10)
  };
}

function dayKeyOf(hourValue) {
  return tashkentParts(hourValue).dayKey;
}

// Unix seconds of 00:00 Tashkent for the given YYYY-MM-DD key.
function tashkentDayStart(dayKey) {
  const base = Date.parse(`${String(dayKey).slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(base)) return null;
  return Math.floor(base / 1000) - TASHKENT_OFFSET;
}

function todayKey() {
  return dayKeyOf(nowHourStart());
}

function addDaysToKey(dayKey, days) {
  const start = tashkentDayStart(dayKey);
  if (start === null) return null;
  return dayKeyOf(start + days * 24 * HOUR);
}

function dayKeysFrom(dayKey, count) {
  const keys = [];
  for (let index = 0; index < count; index += 1) {
    const key = addDaysToKey(dayKey, index);
    if (!key) break;
    keys.push(key);
  }
  return keys;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function hourLabel(hourOfDay) {
  return `${pad(hourOfDay)}:00`;
}

function hourRangeLabel(hourOfDay) {
  return `${pad(hourOfDay)}:00–${pad((hourOfDay + 1) % 24)}:00`;
}

// "20 ноя" / "Сегодня" style labels used by public and owner interfaces.
function dayLabel(dayKey) {
  const parts = tashkentParts(tashkentDayStart(dayKey) + TASHKENT_OFFSET);
  if (!parts.dayKey) return dayKey;
  const today = todayKey();
  if (dayKey === today) return 'Сегодня';
  if (dayKey === addDaysToKey(today, 1)) return 'Завтра';
  return `${WEEKDAYS_SHORT[parts.weekday]}, ${parts.day} ${MONTHS_SHORT[parts.month - 1]}`;
}

function shortDayLabel(dayKey) {
  const start = tashkentDayStart(dayKey);
  const parts = tashkentParts(start + TASHKENT_OFFSET);
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]}`;
}

function isoOfHour(hourValue) {
  return new Date(Number(hourValue) * 1000).toISOString();
}

module.exports = {
  HOUR,
  TASHKENT_OFFSET,
  nowHourStart,
  hourStart,
  validHour,
  tashkentParts,
  dayKeyOf,
  tashkentDayStart,
  todayKey,
  addDaysToKey,
  dayKeysFrom,
  hourLabel,
  hourRangeLabel,
  dayLabel,
  shortDayLabel,
  isoOfHour
};
