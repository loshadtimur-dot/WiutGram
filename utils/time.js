'use strict';

function nowIso() {
  return new Date().toISOString();
}

function isoPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isoPlusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isoMinusHours(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoMinusDays(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Returns day keys (YYYY-MM-DD) for the last N days, oldest first.
function lastDays(count) {
  const days = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function dayKey(dateValue) {
  return String(dateValue).slice(0, 10);
}

module.exports = { nowIso, isoPlusMinutes, isoPlusHours, isoMinusHours, isoMinusDays, lastDays, dayKey };
