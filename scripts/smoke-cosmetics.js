'use strict';

// Ad-hoc smoke test for registration, login and the cosmetics API.
// Run against a disposable database: UNI_DB_FILE=/tmp/... node scripts/smoke-cosmetics.js

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.SMOKE_PORT || 3312);
const base = `http://127.0.0.1:${PORT}`;
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeClient() {
  let token = '';
  return {
    setToken(value) {
      token = value;
    },
    get token() {
      return token;
    },
    async request(method, url, body) {
      const response = await fetch(`${base}${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (err) {
        data = { raw: text };
      }
      return { status: response.status, data };
    }
  };
}

function payload(email, username, universityId = 1) {
  return {
    email,
    password: 'OwnerPass12345',
    username,
    display_name: `Test ${username}`,
    birthdate: '2000-05-05',
    gender: 'male',
    interested_in: 'everyone',
    looking_for: 'friends',
    university_id: universityId,
    interests: ['music', 'books', 'games'],
    photos: [png]
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch (err) {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Server did not start');
}

async function main() {
  const owner = makeClient();
  const user = makeClient();

  const uni = await owner.request('GET', '/api/universities');
  assert.equal(uni.status, 200);
  assert.equal(uni.data.universities.length, 1, 'only WIUT may be active');
  assert.equal(uni.data.universities[0].short_name, 'WIUT');

  const site = await owner.request('GET', '/api/settings/site');
  assert.equal(site.data.site_name, 'Wiutgram');

  const registeredOwner = await owner.request('POST', '/api/auth/register', payload('owner@wiut.uz', 'smokeowner'));
  assert.equal(registeredOwner.status, 201, JSON.stringify(registeredOwner.data));
  assert.equal(registeredOwner.data.owner, true);
  owner.setToken(registeredOwner.data.token);

  const registeredUser = await user.request(
    'POST',
    '/api/auth/register',
    payload('user@wiut.uz', 'smokeuser')
  );
  assert.equal(registeredUser.status, 201, JSON.stringify(registeredUser.data));
  user.setToken(registeredUser.data.token);

  const otherUniversity = makeClient();
  const rejected = await otherUniversity.request(
    'POST',
    '/api/auth/register',
    payload('other@wiut.uz', 'otheruser', 2)
  );
  assert.equal(rejected.status, 400, 'a non-WIUT university must be rejected');

  const byEmail = makeClient();
  const emailLogin = await byEmail.request('POST', '/api/auth/login', {
    login: 'user@wiut.uz',
    password: 'OwnerPass12345'
  });
  assert.equal(emailLogin.status, 200, JSON.stringify(emailLogin.data));

  const byUsername = makeClient();
  const usernameLogin = await byUsername.request('POST', '/api/auth/login', {
    login: 'smokeuser',
    password: 'OwnerPass12345'
  });
  assert.equal(usernameLogin.status, 200, JSON.stringify(usernameLogin.data));

  const followed = await user.request('POST', '/api/follows/smokeowner');
  assert.equal(followed.status, 200);
  assert.equal(followed.data.followers, 1);

  const aura = await user.request('GET', '/api/aura');
  assert.equal(aura.status, 200);
  assert.equal(aura.data.leaders[0].username, 'smokeowner');
  assert.equal(aura.data.leaders[0].followers, 1);

  const badge = await owner.request('POST', '/api/admin/cosmetics/grant/badge', {
    username: 'smokeuser',
    badge_id: 'dragon',
    months: 1
  });
  assert.equal(badge.status, 200, JSON.stringify(badge.data));

  const banner = await owner.request('POST', '/api/admin/cosmetics/grant/banner', {
    username: 'smokeuser',
    banner_id: 'black_gold',
    months: 12
  });
  assert.equal(banner.status, 200, JSON.stringify(banner.data));

  const gifts = await owner.request('POST', '/api/admin/cosmetics/grant/gift', {
    username: 'smokeuser',
    gift_id: 'teddy',
    quantity: 3
  });
  assert.equal(gifts.status, 200, JSON.stringify(gifts.data));
  assert.equal(gifts.data.created, 3);

  const mine = await user.request('GET', '/api/cosmetics/me');
  assert.equal(mine.status, 200);
  assert.equal(mine.data.profile.badges.length, 1);
  assert.equal(mine.data.catalog.gifts.find((g) => g.id === 'teddy').count, 3);

  const equippedBanner = await user.request('POST', '/api/cosmetics/banner', { banner_id: 'black_gold' });
  assert.equal(equippedBanner.status, 200, JSON.stringify(equippedBanner.data));

  const equippedGift = await user.request('POST', '/api/cosmetics/gift/equip', { gift_id: 'teddy' });
  assert.equal(equippedGift.status, 200, JSON.stringify(equippedGift.data));

  const hidden = await user.request('POST', '/api/cosmetics/gift/hide', { gift_id: 'teddy', hidden: true });
  assert.equal(hidden.status, 200);

  const regifted = await user.request('POST', '/api/cosmetics/gift/regift', {
    gift_id: 'teddy',
    username: 'smokeowner'
  });
  assert.equal(regifted.status, 200, JSON.stringify(regifted.data));

  const ownerProfile = await owner.request('GET', '/api/users/smokeowner');
  assert.equal(ownerProfile.status, 200);
  assert.equal(ownerProfile.data.cosmetics.gifts.length, 1);
  assert.equal(ownerProfile.data.cosmetics.gifts[0].has_regifted, true);

  const prices = await owner.request('PUT', '/api/admin/cosmetics/gifts/teddy', { rarity: 'epic', price: 99000 });
  assert.equal(prices.status, 200, JSON.stringify(prices.data));

  const settings = await owner.request('PUT', '/api/admin/cosmetics/settings', {
    owner_telegram: 'wiut_admin'
  });
  assert.equal(settings.status, 200, JSON.stringify(settings.data));
  assert.equal(settings.data.settings.owner_telegram, 'wiut_admin');

  console.log('smoke ok: registration, login, follow, aura, badges, banners and gifts');
}

const dbFile = process.env.UNI_DB_FILE;
const uploads = process.env.UPLOADS_DIR;
if (!dbFile || !uploads) {
  console.error('Set UNI_DB_FILE and UPLOADS_DIR to disposable paths');
  process.exit(1);
}
for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
fs.mkdirSync(uploads, { recursive: true });

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    UNI_DB_FILE: dbFile,
    UPLOADS_DIR: uploads,
    NODE_ENV: 'test',
    UNI_TEST_MODE: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

waitForServer()
  .then(main)
  .then(() => {
    server.kill('SIGTERM');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    console.error(serverLog.slice(-3000));
    server.kill('SIGTERM');
    process.exit(1);
  });
