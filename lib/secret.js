'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(__dirname, '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, 'secret.txt');

let cachedSecret = null;

// Uses JWT_SECRET from the environment, or a generated secret stored in data/.
function getSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(SECRET_FILE)) {
    const stored = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (stored.length >= 16) {
      cachedSecret = stored;
      return cachedSecret;
    }
  }

  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  cachedSecret = generated;
  return cachedSecret;
}

module.exports = { getSecret, SECRET_FILE };
