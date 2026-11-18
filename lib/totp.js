'use strict';

const crypto = require('crypto');
const { getSecret } = require('./secret');

// RFC 6238 TOTP (SHA-1, 6 digits, 30 second step) implemented with node crypto.
const DIGITS = 6;
const STEP = 30;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codeForCounter(key, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totp(secret, timestamp = Date.now()) {
  const key = base32Decode(secret);
  if (!key.length) return '';
  return codeForCounter(key, Math.floor(timestamp / 1000 / STEP));
}

// Allows one step of clock drift in both directions.
function verifyTotp(secret, code, window = 1) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== DIGITS) return false;
  const key = base32Decode(secret);
  if (!key.length) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP);
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = codeForCounter(key, counter + drift);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

function otpauthUrl({ secret, account, issuer = 'Wiutgram' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ---------- Secret storage ---------- */

function encryptionKey() {
  return crypto.scryptSync(getSecret(), 'uni-lovers-totp', 32);
}

// Secrets must be readable to verify codes, so they are encrypted with a key
// derived from the application secret instead of being hashed.
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(payload) {
  if (!payload || typeof payload !== 'string') return '';
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    return '';
  }
}

/* ---------- Backup codes ---------- */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateBackupCodes(count = 10) {
  const codes = [];
  for (let index = 0; index < count; index += 1) {
    let raw = '';
    for (let i = 0; i < 8; i += 1) raw += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

function hashBackupCode(code) {
  return crypto
    .createHash('sha256')
    .update(`${String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')}|${getSecret()}`)
    .digest('hex');
}

function hashBackupCodes(codes) {
  return codes.map((code) => hashBackupCode(code));
}

// Consumes a backup code. Returns the remaining hashes or null if not matched.
function consumeBackupCode(storedHashes, code) {
  const hash = hashBackupCode(code);
  const list = Array.isArray(storedHashes) ? storedHashes.slice() : [];
  const index = list.indexOf(hash);
  if (index === -1) return null;
  list.splice(index, 1);
  return list;
}

module.exports = {
  generateSecret,
  totp,
  verifyTotp,
  otpauthUrl,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode
};
