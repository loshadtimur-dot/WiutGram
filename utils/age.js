'use strict';

// SQL expression computing full years from a birthdate column.
const SQL_AGE = "CAST((julianday('now') - julianday(birthdate)) / 365.25 AS INTEGER)";

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function ageFromBirthdate(value) {
  const birth = parseDateOnly(value);
  if (!birth) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

function isAdult(birthdate, minAge = 18) {
  const age = ageFromBirthdate(birthdate);
  if (age === null) return false;
  return age >= minAge && age <= 120;
}

function buildBirthdate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > new Date().getUTCFullYear()) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  const iso = date.toISOString().slice(0, 10);
  return iso;
}

module.exports = { SQL_AGE, ageFromBirthdate, isAdult, buildBirthdate, parseDateOnly };
