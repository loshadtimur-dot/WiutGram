'use strict';

const { cleanText } = require('../utils/sanitize');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

function isString(value) {
  return typeof value === 'string';
}

function validateEmail(value) {
  if (!isString(value)) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 190 || !EMAIL_RE.test(email)) return null;
  return email;
}

function validateUsername(value) {
  if (!isString(value)) return null;
  const username = value.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return null;
  if (username.startsWith('.') || username.endsWith('.')) return null;
  if (username.includes('..')) return null;
  return username;
}

function validatePassword(value) {
  if (!isString(value)) return null;
  if (value.length < 8 || value.length > 72) return null;
  return value;
}

function toInt(value, fallback = null) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function pagination(query, defaultLimit = 20, maxLimit = 50) {
  const limit = clamp(toInt(query.limit, defaultLimit), 1, maxLimit);
  const offset = Math.max(0, toInt(query.offset, 0));
  return { limit, offset };
}

function fail(res, status, error) {
  return res.status(status).json({ error });
}

const MESSAGES = {
  email: 'Введите корректный email',
  username: 'Username: 3–20 символов, латиница, цифры, точка или _',
  password: 'Пароль должен содержать минимум 8 символов',
  displayName: 'Укажите имя (2–40 символов)',
  birthdate: 'Укажите корректную дату рождения',
  adult: 'Регистрация доступна только с 18 лет',
  city: 'Выберите город',
  gender: 'Укажите пол',
  interestedIn: 'Укажите, кого показывать',
  lookingFor: 'Укажите цель знакомства',
  interests: 'Выберите от 3 до 10 интересов',
  photos: 'Загрузите от 1 до 9 фото'
};

function cleaned(value, max) {
  return cleanText(value, max);
}

module.exports = {
  EMAIL_RE,
  USERNAME_RE,
  MESSAGES,
  isString,
  validateEmail,
  validateUsername,
  validatePassword,
  toInt,
  clamp,
  oneOf,
  pagination,
  fail,
  cleaned
};
