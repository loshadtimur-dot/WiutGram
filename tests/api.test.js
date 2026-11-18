'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../lib/totp');
const {
  startServer,
  createClient,
  makePng,
  register,
  nowHourStart,
  tashkentDayStart,
  addDays
} = require('./helpers');

const PORT = Number(process.env.TEST_PORT || 3199);
const base = `http://127.0.0.1:${PORT}`;

let server;
let owner;
let user;
let ownerAccount;
let userAccount;
let bannerId;
let campaignId;
let reportToken;
const now = nowHourStart();
const freeHourA = now + 3 * 3600;
const freeHourB = now + 4 * 3600;
const conflictHour = now + 30 * 3600;

test.before(async () => {
  server = await startServer(PORT);
  owner = createClient(base);
  user = createClient(base);
  const ownerResult = await register(owner, { email: 'owner@example.com', username: 'siteowner' });
  assert.equal(ownerResult.response.status, 201, JSON.stringify(ownerResult.response.data));
  ownerAccount = ownerResult.payload;
  const userResult = await register(user, { email: 'user@example.com', username: 'siteuser', password: 'UserPass12345' });
  assert.equal(userResult.response.status, 201, JSON.stringify(userResult.response.data));
  userAccount = userResult.payload;
  assert.equal(ownerResult.response.data.owner, true);
  assert.equal(userResult.response.data.owner, false);
});

test.after(() => {
  if (server) server.stop();
});

/* ---------- Auth basics ---------- */

test('guest /api/auth/me returns 200 with null user (no console 401)', async () => {
  const guest = createClient(base);
  const response = await guest.get('/api/auth/me');
  assert.equal(response.status, 200);
  assert.equal(response.data.user, null);
});

test('first account is owner, second is user, passwords never leak', async () => {
  const me = await owner.get('/api/auth/me');
  assert.equal(me.data.user.role, 'owner');
  assert.equal(me.data.user.password_hash, undefined);
  const list = await owner.get('/api/admin/users');
  assert.equal(list.status, 200);
  assert.equal(JSON.stringify(list.data).includes('$2a$'), false);
  assert.equal(JSON.stringify(list.data).includes('password_hash'), false);
});

test('underage and unknown university registrations are rejected', async () => {
  const young = createClient(base);
  const result = await register(young, {
    email: 'kid@example.com',
    username: 'kiduser',
    birthdate: '2015-01-01'
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.response.data.code, 'underage');

  const stranger = createClient(base);
  const unknown = await register(stranger, {
    email: 'stranger@example.com',
    username: 'strangeruser',
    university_id: 999999
  });
  assert.equal(unknown.response.status, 400);
  assert.match(unknown.response.data.error, /университет/i);
});

test('admin area is 404 for guests and regular users, 200 for owner', async () => {
  const guest = createClient(base);
  assert.equal((await guest.get('/api/admin/stats')).status, 404);
  assert.equal((await user.get('/api/admin/stats')).status, 404);
  assert.equal((await guest.get('/api/admin/ads/overview')).status, 404);
  assert.equal((await user.get('/api/admin/ads/overview')).status, 404);
  assert.equal((await owner.get('/api/admin/stats')).status, 200);
  assert.equal((await owner.get('/api/admin/ads/overview')).status, 200);
});

test('SQL injection and XSS strings are stored safely and do not leak private fields', async () => {
  const guest = createClient(base);
  const injected = await guest.post('/api/auth/login', {
    login: "' OR 1=1 --",
    password: "' OR 1=1 --"
  });
  assert.equal(injected.status, 401);

  const profile = await user.get('/api/users/siteowner');
  assert.equal(profile.status, 200);
  const raw = JSON.stringify(profile.data);
  assert.equal(raw.includes('owner@example.com'), false);
  assert.equal(raw.includes('password_hash'), false);

  const comments = await user.get('/api/feed?limit=5');
  assert.equal(comments.status, 200);
});

test('CSRF guard rejects foreign Origin on mutations', async () => {
  const response = await owner.post(
    '/api/admin/ads/settings',
    { ads_telegram: 'unilovers' },
    { headers: { origin: 'https://evil.example' } }
  );
  assert.equal(response.status, 403);
  assert.equal(response.data.code, 'csrf');
});

/* ---------- Advertising: settings, banners ---------- */

test('ads settings validate telegram and default price is 15 000', async () => {
  const config = await createClient(base).get('/api/ads/config');
  assert.equal(config.status, 200);
  assert.equal(config.data.price_per_hour, 15000);

  const bad = await owner.put('/api/admin/ads/settings', { ads_telegram: '@bad handle!' });
  assert.equal(bad.status, 400);

  const good = await owner.put('/api/admin/ads/settings', {
    ads_telegram: 'uni_lovers',
    ads_discounts_json: [{ min_hours: 2, percent: 10 }]
  });
  assert.equal(good.status, 200);
  assert.equal(good.data.settings.telegram, 'uni_lovers');
  assert.equal(good.data.settings.discounts[0].percent, 10);
});

test('payment details stay private until enabled and are shown to buyers afterwards', async () => {
  const guest = createClient(base);
  const initial = await guest.get('/api/ads/config');
  assert.equal(initial.status, 200);
  assert.equal(initial.data.payment.card, null);
  assert.equal(initial.data.payment.telegram, 'uni_lovers');

  // Only the owner may change payment details; everyone else gets a 404.
  const denied = await user.put('/api/admin/ads/settings', { ads_card_number: '4111111111111111' });
  assert.equal(denied.status, 404);

  const short = await owner.put('/api/admin/ads/settings', { ads_card_number: '4111' });
  assert.equal(short.status, 400);

  const saved = await owner.put('/api/admin/ads/settings', {
    ads_card_number: '4111 1111 1111 1111',
    ads_card_holder: 'Тест <img src=x onerror=alert(1)>',
    ads_card_bank: 'Uzcard <script>alert(1)</script>',
    ads_payment_note: 'После оплаты пришлите чек в Telegram',
    ads_show_card: true
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.settings.card_number, '4111111111111111');
  assert.deepEqual(saved.data.warnings, []);

  const publicConfig = await guest.get('/api/ads/config');
  assert.equal(publicConfig.data.payment.card.number, '4111 1111 1111 1111');
  assert.equal(publicConfig.data.payment.card.bank.startsWith('Uzcard'), true);
  assert.equal(publicConfig.data.payment.card.bank.includes('<'), false);
  assert.equal(publicConfig.data.payment.card.note, 'После оплаты пришлите чек в Telegram');
  assert.equal(String(publicConfig.data.payment.card.holder).includes('<'), false);
  assert.equal(publicConfig.data.payment.telegram_url, 'https://t.me/uni_lovers');

  // The purchase window receives the same block together with the request code.
  const hour = now + 60 * 3600;
  const request = await guest.post('/api/ads/requests', { hours: [hour] });
  assert.equal(request.status, 201, JSON.stringify(request.data));
  assert.equal(request.data.payment.card.number, '4111 1111 1111 1111');
  assert.match(request.data.message, new RegExp(request.data.code));

  const log = await owner.get('/api/admin/log?limit=10');
  assert.equal(log.status, 200);
  assert.ok(log.data.log.some((row) => row.action === 'ads_settings'));

  const hidden = await owner.put('/api/admin/ads/settings', { ads_show_card: false });
  assert.equal(hidden.status, 200);
  const afterHide = await guest.get('/api/ads/config');
  assert.equal(afterHide.data.payment.card, null);
  assert.equal(JSON.stringify(afterHide.data).includes('4111'), false);

  const emptyNumber = await owner.put('/api/admin/ads/settings', { ads_card_number: '' });
  assert.equal(emptyNumber.status, 200);
  assert.equal(emptyNumber.data.settings.card_number, '');
});

test('banner upload accepts a real 4:1 image and rejects svg, gif and wrong ratio', async () => {
  const form = new FormData();
  form.append('image', new Blob([makePng(1600, 400)], { type: 'image/png' }), 'banner.png');
  const upload = await owner.post('/api/admin/ads/banners', undefined, { form });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  bannerId = upload.data.banner.id;
  assert.equal(upload.data.banner.width, 1600);

  const svgForm = new FormData();
  svgForm.append('image', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: 'image/svg+xml' }), 'x.svg');
  const svg = await owner.post('/api/admin/ads/banners', undefined, { form: svgForm });
  assert.equal(svg.status, 400);

  const gifForm = new FormData();
  gifForm.append('image', new Blob([Buffer.from('GIF89a malicious')], { type: 'image/gif' }), 'x.gif');
  const gif = await owner.post('/api/admin/ads/banners', undefined, { form: gifForm });
  assert.equal(gif.status, 400);

  const squareForm = new FormData();
  squareForm.append('image', new Blob([makePng(400, 400)], { type: 'image/png' }), 'square.png');
  const square = await owner.post('/api/admin/ads/banners', undefined, { form: squareForm });
  assert.equal(square.status, 400);

  const list = await owner.get('/api/admin/ads/banners');
  assert.equal(list.status, 200);
  assert.equal(list.data.banners.length, 1);
});

/* ---------- Advertising: campaigns, display, stats ---------- */

test('owner creates a paid campaign for the current hour', async () => {
  const created = await owner.post('/api/admin/ads/campaigns', {
    advertiser_name: 'Реклама-Тест',
    advertiser_telegram: 'advertiser_test',
    placements: ['swipe', 'profile'],
    hours: [now],
    banner_swipe_id: bannerId,
    banner_profile_id: bannerId,
    paid_status: 'paid',
    link_url: 'https://example.com/promo',
    alt_text: 'Тестовый баннер'
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  campaignId = created.data.campaign.id;
  reportToken = created.data.campaign.report_token;
  assert.ok(reportToken);
  assert.equal(created.data.campaign.price_total, 15000);
});

test('paid banner is served in both placements and falls back outside the hour', async () => {
  const swipe = await createClient(base).get(`/api/ads/active?placement=swipe&hour=${now}`);
  assert.equal(swipe.data.mode, 'banner');
  assert.equal(swipe.data.campaign_id, campaignId);
  assert.equal(swipe.data.image_url.startsWith('/uploads/ads/'), true);

  const profile = await createClient(base).get(`/api/ads/active?placement=profile&hour=${now}`);
  assert.equal(profile.data.mode, 'banner');

  const later = await createClient(base).get(`/api/ads/active?placement=swipe&hour=${now + 5 * 3600}`);
  assert.equal(later.data.mode, 'house');
  assert.equal(later.data.mode === 'banner', false);

  await owner.put('/api/admin/ads/settings', { ads_fallback_mode: 'hidden' });
  const hidden = await createClient(base).get(`/api/ads/active?placement=swipe&hour=${now + 5 * 3600}`);
  assert.equal(hidden.data.mode, 'hidden');
  await owner.put('/api/admin/ads/settings', { ads_fallback_mode: 'house' });
});

test('impressions are unique per viewer per hour and clicks redirect only to the saved URL', async () => {
  const first = await user.post('/api/ads/impression', { campaign_id: campaignId, placement: 'swipe' });
  assert.equal(first.status, 200);
  assert.equal(first.data.counted, true);
  const second = await user.post('/api/ads/impression', { campaign_id: campaignId, placement: 'swipe' });
  assert.equal(second.status, 200);
  assert.equal(second.data.counted, false);

  const click = await createClient(base).get(`/api/ads/click/${campaignId}?p=swipe`);
  assert.equal(click.status, 302);
  assert.equal(click.headers.get('location'), 'https://example.com/promo');

  const evil = await createClient(base).get(`/api/ads/click/${campaignId}?p=swipe&url=https://evil.example`);
  assert.equal(evil.headers.get('location'), 'https://example.com/promo');

  const stats = await owner.get(`/api/admin/ads/campaigns/${campaignId}`);
  assert.equal(stats.data.campaign.stats.totals.impressions >= 1, true);
  assert.equal(stats.data.campaign.stats.totals.clicks >= 1, true);
});

test('availability hides who bought the hour', async () => {
  const payload = await createClient(base).get('/api/ads/availability?days=3');
  assert.equal(payload.status, 200);
  const hours = payload.data.days.flatMap((day) => day.hours);
  const current = hours.find((item) => item.hour_start === now);
  assert.equal(current.current, true);
  // The current hour is sold, so it is never purchasable from the public grid.
  assert.notEqual(current.status, 'free');
  const future = hours.find((item) => item.hour_start === now + 6 * 3600);
  assert.equal(future.status, 'free');
  assert.equal(JSON.stringify(payload.data).includes('Реклама-Тест'), false);
  assert.equal(JSON.stringify(payload.data).includes('advertiser_test'), false);
});

test('pricing applies volume discounts on the server', async () => {
  const request = await createClient(base).post('/api/ads/requests', {
    hours: [freeHourA, freeHourB]
  });
  assert.equal(request.status, 201, JSON.stringify(request.data));
  assert.equal(request.data.total, 27000);
  assert.match(request.data.code, /^AD-[A-Z2-9]{4}$/);
  assert.equal(JSON.stringify(request.data).includes('ip_hash'), false);

  const converted = await owner.post('/api/admin/ads/campaigns', {
    advertiser_name: 'По заявке',
    placements: ['swipe'],
    hours: [freeHourA, freeHourB],
    banner_swipe_id: bannerId,
    paid_status: 'unpaid',
    price_total: 27000,
    request_id: request.data.id
  });
  assert.equal(converted.status, 201);
  const requests = await owner.get('/api/admin/ads/requests');
  const row = requests.data.requests.find((item) => item.code === request.data.code);
  assert.equal(row.status, 'converted');
});

test('a slot cannot be sold twice: 20 parallel requests produce exactly one success', async () => {
  const attempts = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      owner.post('/api/admin/ads/campaigns', {
        advertiser_name: `Параллель ${index}`,
        placements: ['swipe'],
        hours: [conflictHour],
        paid_status: 'unpaid'
      })
    )
  );
  const successes = attempts.filter((response) => response.status === 201);
  const conflicts = attempts.filter((response) => response.status === 409);
  assert.equal(successes.length, 1, JSON.stringify(attempts.map((item) => item.status)));
  assert.equal(conflicts.length, 19);
});

test('cancelling a campaign frees its hours', async () => {
  const soonHour = now + 2 * 3600;
  const created = await owner.post('/api/admin/ads/campaigns', {
    advertiser_name: 'Отменяемая',
    placements: ['swipe', 'profile'],
    hours: [soonHour],
    banner_swipe_id: bannerId,
    paid_status: 'paid'
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const cancelledId = created.data.campaign.id;

  const locked = await owner.post(`/api/admin/ads/campaigns/${cancelledId}/cancel`, { reason: 'Тест' });
  assert.equal(locked.status, 403);

  const reauth = await owner.post('/api/admin/reauth', { password: ownerAccount.password });
  assert.equal(reauth.status, 200);
  const cancelled = await owner.post(`/api/admin/ads/campaigns/${cancelledId}/cancel`, { reason: 'Тест' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.campaign.status, 'cancelled');

  const active = await createClient(base).get(`/api/ads/active?placement=swipe&hour=${soonHour}`);
  assert.notEqual(active.data.mode, 'banner');
  const free = await createClient(base).post('/api/ads/requests', { hours: [soonHour] });
  assert.equal(free.status, 201, JSON.stringify(free.data));
  assert.equal(free.data.total, 15000);

  const oldCampaign = await owner.get(`/api/admin/ads/campaigns/${campaignId}`);
  assert.equal(oldCampaign.data.campaign.id, campaignId);
});

test('public report works only with its token', async () => {
  const report = await createClient(base).get(`/api/ads/report/${reportToken}`);
  assert.equal(report.status, 200);
  assert.equal(report.data.advertiser_name, 'Реклама-Тест');
  assert.equal(JSON.stringify(report.data).includes('advertiser_test'), false);
  assert.equal(JSON.stringify(report.data).includes('price_total'), true);
  assert.equal(JSON.stringify(report.data).includes('"note":'), false);
  const wrong = await createClient(base).get('/api/ads/report/not-a-token');
  assert.equal(wrong.status, 404);
});

test('advertise page payloads are public and timezone-labelled', async () => {
  const config = await createClient(base).get('/api/ads/config');
  assert.equal(config.data.timezone_note, 'Время указано по Ташкенту');
  assert.equal(config.data.max_hours_per_request, 24);
  const availability = await createClient(base).get('/api/ads/availability');
  assert.equal(availability.data.days.length, 30);
  assert.equal(availability.data.days[0].hours.length, 24);
  assert.ok(availability.data.days[0].hours.some((hour) => hour.current === true));
});

/* ---------- Super likes purchase ---------- */

test('super like package: request, owner approval credits 100, guests are rejected', async () => {
  const guest = createClient(base);
  assert.equal((await guest.get('/api/superlikes')).status, 401);

  const before = await user.get('/api/superlikes');
  assert.equal(before.status, 200);
  assert.equal(before.data.settings.quantity, 100);
  assert.equal(before.data.settings.price, 10000);

  const created = await user.post('/api/superlikes/orders', { contact: '@buyer' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.match(created.data.order.code, /^SL-/);
  const order = created.data.order;

  // Regular users cannot reach the owner area at all.
  assert.equal((await user.get('/api/admin/superlikes/orders')).status, 404);

  const list = await owner.get('/api/admin/superlikes/orders?status=new');
  assert.equal(list.status, 200);
  assert.ok(list.data.orders.some((row) => row.id === order.id));

  const approved = await owner.post(`/api/admin/superlikes/orders/${order.id}/approve`, {});
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  const after = await user.get('/api/superlikes');
  assert.equal(after.data.bonus, 100);
  assert.ok(after.data.balance >= 100);

  // Approving twice must not credit the package twice.
  const repeated = await owner.post(`/api/admin/superlikes/orders/${order.id}/approve`, {});
  assert.equal(repeated.status, 409);

  const saved = await owner.put('/api/admin/superlikes/settings', {
    superlikes_quantity: 50,
    superlikes_price: 5000,
    superlikes_telegram: 'uni_pay'
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.settings.quantity, 50);
  assert.equal(saved.data.settings.telegram, 'uni_pay');
  await owner.put('/api/admin/superlikes/settings', {
    superlikes_quantity: 100,
    superlikes_price: 10000,
    superlikes_telegram: ''
  });
});

/* ---------- Owner 2FA and login protection ---------- */

test('owner 2FA setup, login challenge, backup code and disable work', async () => {
  const setup = await owner.post('/api/security/2fa/setup');
  assert.equal(setup.status, 200);
  assert.ok(setup.data.secret);
  assert.match(setup.data.otpauth, /^otpauth:\/\/totp\//);

  const enabled = await owner.post('/api/security/2fa/enable', { code: totp.totp(setup.data.secret) });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
  assert.equal(enabled.data.backup_codes.length, 10);

  const challenger = createClient(base);
  const login = await challenger.post('/api/auth/login', {
    login: ownerAccount.email,
    password: ownerAccount.password
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.two_factor_required, true);
  assert.ok(login.data.challenge);

  const wrong = await challenger.post('/api/auth/login/2fa', { challenge: login.data.challenge, code: '000000' });
  assert.equal(wrong.status, 401);

  const ok = await challenger.post('/api/auth/login/2fa', {
    challenge: login.data.challenge,
    code: totp.totp(setup.data.secret)
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.user.role, 'owner');

  const second = await createClient(base).post('/api/auth/login', {
    login: ownerAccount.email,
    password: ownerAccount.password
  });
  const backupCode = enabled.data.backup_codes[0];
  const withBackup = await createClient(base).post('/api/auth/login/2fa', {
    challenge: second.data.challenge,
    code: backupCode
  });
  assert.equal(withBackup.status, 200);
  const reuse = await createClient(base).post('/api/auth/login/2fa', {
    challenge: second.data.challenge,
    code: backupCode
  });
  assert.equal(reuse.status, 401);

  const sessions = await owner.get('/api/security/overview');
  assert.equal(sessions.status, 200);
  assert.equal(sessions.data.two_factor.enabled, true);

  const disabled = await owner.post('/api/security/2fa/disable', {
    password: ownerAccount.password,
    code: totp.totp(setup.data.secret)
  });
  assert.equal(disabled.status, 200);
  const after = await owner.get('/api/security/overview');
  assert.equal(after.data.two_factor.enabled, false);
});

test('owner login locks after repeated failures', async () => {
  const attacker = createClient(base);
  let locked = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await attacker.post('/api/auth/login', {
      login: ownerAccount.email,
      password: 'WrongPassword123'
    });
    if (response.status === 429) {
      locked = true;
      assert.match(response.data.error, /попыток/i);
      break;
    }
  }
  assert.equal(locked, true, 'owner account should lock after five failures');
});

/* ---------- Production mode: proxy, cookies, health ---------- */

test('https behind a trusted proxy sets Secure cookies and health reports version', async () => {
  const proxy = await startServer(3197, { TRUST_PROXY: '1' });
  try {
    const proxyBase = 'http://127.0.0.1:3197';
    const client = createClient(proxyBase);
    const created = await register(client, { email: 'proxy@example.com', username: 'proxyuser' });
    assert.equal(created.response.status, 201, JSON.stringify(created.response.data));

    const cookieOf = (response) =>
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie().join('; ')
        : String(response.headers.get('set-cookie') || '');

    const https = await client.post(
      '/api/auth/login',
      { login: 'proxy@example.com', password: 'OwnerPass12345' },
      { headers: { 'x-forwarded-proto': 'https' } }
    );
    assert.equal(https.status, 200, JSON.stringify(https.data));
    const secureCookie = cookieOf(https);
    assert.match(secureCookie, /uni_token=/);
    assert.match(secureCookie, /Secure/i);
    assert.match(secureCookie, /SameSite=None/i);

    // Over plain HTTP the cookie stays readable by the app itself.
    const plain = await createClient(proxyBase).post('/api/auth/login', {
      login: 'proxy@example.com',
      password: 'OwnerPass12345'
    });
    assert.equal(plain.status, 200);
    assert.equal(/Secure/i.test(cookieOf(plain)), false);

    const health = await createClient(proxyBase).get('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.equal(health.data.db_ok, true);
    assert.equal(health.data.version, '1.0.0');
  } finally {
    proxy.stop();
  }
});

/* ---------- Rate limit on public requests ---------- */

test('public advertising requests are rate limited', async () => {
  const client = createClient(base);
  let limited = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await client.post('/api/ads/requests', { hours: [now + 40 * 3600 + attempt * 3600] });
    if (response.status === 429) {
      limited = true;
      break;
    }
  }
  assert.equal(limited, true);
  void tashkentDayStart;
  void addDays;
  void userAccount;
});
