'use strict';

const crypto = require('crypto');
const db = require('../../db');
const { notify } = require('../notify');
const { getSecret } = require('../secret');
const { nowIso } = require('../../utils/time');
const { describeGroups, getSettings, priceForHours, validateHours } = require('./settings');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function requestCode() {
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `AD-${suffix}`;
}

function hashIp(req) {
  if (!req) return null;
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${ip}|${getSecret().slice(0, 16)}`).digest('hex').slice(0, 32);
}

function moveMessage(code, hours, total, telegram) {
  const lines = [
    'Здравствуйте! Хочу разместить рекламу на UNI Lovers.',
    `Заявка ${code}.`,
    `Часы: ${describeGroups(hours)}.`,
    `Сумма: ${total} сум.`
  ];
  if (telegram) lines.push(`Мой Telegram: @${telegram}`);
  return lines.join('\n');
}

function createRequest({ hours: rawHours, contactName, req }) {
  const settings = getSettings();
  if (!settings.enabled) return { error: 'Реклама временно недоступна', status: 403 };
  const checked = validateHours(rawHours, settings);
  if (checked.error) {
    return {
      error: checked.error,
      status: checked.code === 'slot_conflict' ? 409 : 400,
      conflicts: checked.conflicts || []
    };
  }
  const price = priceForHours(checked.hours.length, settings);
  const contact = String(contactName || '').replace(/[<>]/g, '').slice(0, 80).trim();
  const now = nowIso();
  let code = requestCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!db.get('SELECT id FROM ad_requests WHERE code = ?', [code])) break;
    code = requestCode();
  }
  const result = db.run(
    `INSERT INTO ad_requests (code, contact_name, ip_hash, status, hours_json, total, note, created_at)
     VALUES (?, ?, ?, 'new', ?, ?, '', ?)`,
    [code, contact, hashIp(req), JSON.stringify(checked.hours), price.total, now]
  );
  const requestId = Number(result.lastInsertRowid);
  const owner = db.get("SELECT id FROM users WHERE role = 'owner' ORDER BY is_demo ASC, id ASC LIMIT 1");
  if (owner) {
    notify({
      userId: owner.id,
      type: 'ads_request',
      refId: requestId,
      text: `Новая заявка на рекламу ${code}: ${checked.hours.length} ч · ${price.total.toLocaleString('ru-RU')} сум`
    });
  }
  return {
    code,
    id: requestId,
    hours: checked.hours,
    hours_text: describeGroups(checked.hours),
    total: price.total,
    price,
    telegram: settings.telegram,
    message: moveMessage(code, checked.hours, price.total, ''),
    timezone_note: 'Время указано по Ташкенту'
  };
}

function listRequests({ status, limit = 100 } = {}) {
  const filters = [];
  const params = [];
  if (['new', 'contacted', 'converted', 'rejected', 'expired'].includes(status)) {
    filters.push('status = ?');
    params.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT * FROM ad_requests ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, Math.min(300, Math.max(1, limit))]
  );
  return rows.map((row) => {
    let hours = [];
    try {
      hours = JSON.parse(row.hours_json || '[]');
    } catch (err) {
      hours = [];
    }
    return {
      id: row.id,
      code: row.code,
      contact_name: row.contact_name,
      status: row.status,
      hours,
      hours_text: describeGroups(hours),
      total: row.total,
      note: row.note,
      created_at: row.created_at,
      handled_at: row.handled_at
    };
  });
}

function setRequestStatus(id, status, note) {
  if (!['new', 'contacted', 'converted', 'rejected', 'expired'].includes(status)) {
    return { error: 'Некорректный статус' };
  }
  const row = db.get('SELECT * FROM ad_requests WHERE id = ?', [id]);
  if (!row) return { error: 'Заявка не найдена', status: 404 };
  db.run('UPDATE ad_requests SET status = ?, note = ?, handled_at = ? WHERE id = ?', [
    status,
    String(note === undefined ? row.note : note || '').slice(0, 1000),
    status === 'new' ? null : nowIso(),
    id
  ]);
  return { request: listRequests({}).find((item) => item.id === Number(id)) };
}

module.exports = {
  createRequest,
  listRequests,
  setRequestStatus,
  hashIp
};
