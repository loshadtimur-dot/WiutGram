'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms) {
  Atomics.wait(SLEEP_BUFFER, 0, 0, ms);
}

// Windows releases killed processes' database handles with a short delay, so a
// recursive delete right after SIGKILL fails with EBUSY until the OS catches up.
function removeTempDir(dir) {
  const retryable = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY', 'EACCES']);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (!retryable.has(err.code)) throw err;
    }
    sleepSync(100);
  }
}

/* ---------- Server lifecycle ---------- */

// Starts the real server against a disposable database and uploads folder.
async function startServer(port = 3199, overrides = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-test-'));
  const dbFile = path.join(tempDir, 'app.db');
  const uploadsDir = path.join(tempDir, 'uploads');
  const logFile = path.join(tempDir, 'server.log');

  const env = {
    ...process.env,
    PORT: String(port),
    UNI_DB_FILE: dbFile,
    UPLOADS_DIR: uploadsDir,
    UNI_TEST_MODE: '1',
    JWT_SECRET: 'test-secret-key-for-automated-tests-only',
    NODE_ENV: 'test',
    TRUST_PROXY: 'false',
    ...overrides
  };

  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', out, out],
    detached: true
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch (err) {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) {
    try {
      child.kill('SIGKILL');
    } catch (err) {
      // ignore
    }
    throw new Error(`Test server did not start. Log:\n${fs.readFileSync(logFile, 'utf8')}`);
  }

  return {
    base,
    tempDir,
    dbFile,
    uploadsDir,
    logFile,
    child,
    stop() {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (err) {
        try {
          child.kill('SIGKILL');
        } catch (inner) {
          // ignore
        }
      }
      try {
        fs.closeSync(out);
      } catch (err) {
        // ignore
      }
      removeTempDir(tempDir);
    }
  };
}

/* ---------- HTTP client with a cookie jar ---------- */

function createClient(base) {
  let cookie = '';

  async function request(method, route, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (cookie) headers.cookie = cookie;
    const init = { method, headers, redirect: options.redirect || 'manual' };
    if (options.form) init.body = options.form;
    else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${base}${route}`, init);
    const setCookie = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie')]
        : [];
    for (const value of setCookie) {
      const match = /uni_token=([^;]+)/.exec(value);
      if (match) cookie = `uni_token=${match[1]}`;
    }
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers, text: data ? null : await response.text().catch(() => '') };
  }

  return {
    request,
    get: (route, options) => request('GET', route, options),
    post: (route, body, options) => request('POST', route, { ...options, body }),
    put: (route, body, options) => request('PUT', route, { ...options, body }),
    delete: (route, body, options) => request('DELETE', route, { ...options, body }),
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = value;
    }
  };
}

/* ---------- Image fixtures ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

// Generates a real RGB PNG without external dependencies.
function makePng(width = 1600, height = 400) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * rowLength;
    raw[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[offset + 1 + x * 3] = 90;
      raw[offset + 2 + x * 3] = 110;
      raw[offset + 3 + x * 3] = 200;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ---------- Domain helpers ---------- */

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function tashkentDayStart(dayKey) {
  return Math.floor(Date.parse(`${dayKey}T00:00:00.000Z`) / 1000) - 5 * 3600;
}

function nowHourStart() {
  return Math.floor(Date.now() / 1000 / 3600) * 3600;
}

let counter = 0;

async function register(client, overrides = {}) {
  counter += 1;
  const universities = await client.get('/api/universities');
  const university = universities.data.universities.find((item) => !item.is_system) || universities.data.universities[0];
  const suffix = `${Date.now().toString(36)}${counter}`.slice(-8);
  const payload = {
    email: `owner${suffix}@example.com`,
    username: `user${suffix}`,
    password: 'OwnerPass12345',
    display_name: `Тест ${counter}`,
    birthdate: '2000-05-10',
    gender: 'male',
    interested_in: 'everyone',
    looking_for: 'dating',
    university_id: university.id,
    course: '2',
    district: 'Юнусабадский',
    interests: ['music', 'travel', 'coffee'],
    photos: [TINY_PNG],
    ...overrides
  };
  const response = await client.post('/api/auth/register', payload);
  return { response, payload };
}

module.exports = {
  ROOT,
  startServer,
  createClient,
  makePng,
  TINY_PNG,
  addDays,
  tashkentDayStart,
  nowHourStart,
  register
};
