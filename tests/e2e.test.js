'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { startServer, createClient, register, makePng, nowHourStart } = require('./helpers');

const PORT = Number(process.env.E2E_PORT || 3198);
const base = `http://127.0.0.1:${PORT}`;
const SCREENSHOTS = path.join(__dirname, '..', 'screenshots');

let server;
let browser;
let ownerClient;
let userClient;
let ownerAccount;
let userAccount;
let campaignId;

function executablePath() {
  const exe = chromium.executablePath();
  if (!fs.existsSync(exe)) {
    throw new Error(`Chromium not installed at ${exe}. Run: npx playwright install chromium`);
  }
  return exe;
}

async function newContext(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    colorScheme: options.colorScheme || 'light',
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    failed.push(`${request.method()} ${request.url()} ${request.failure() ? request.failure().errorText : ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/auth/me')) {
      failed.push(`${response.status()} ${response.url()}`);
    }
  });
  return { context, page, errors, failed };
}

async function shot(page, name, fullPage = true) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, name), fullPage });
}

async function noHorizontalScroll(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 2, `${label}: horizontal overflow ${overflow}px`);
}

async function loginUi(page, login, password) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="login"]', login);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/swipe', { timeout: 15000 });
  await page.waitForSelector('.deck-page', { timeout: 15000 });
}

test.before(async () => {
  server = await startServer(PORT);
  browser = await chromium.launch({
    executablePath: executablePath(),
    args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage']
  });

  ownerClient = createClient(base);
  userClient = createClient(base);
  const owner = await register(ownerClient, { email: 'owner@example.com', username: 'siteowner' });
  assert.equal(owner.response.status, 201, JSON.stringify(owner.response.data));
  ownerAccount = owner.payload;
  const user = await register(userClient, {
    email: 'user@example.com',
    username: 'siteuser',
    password: 'UserPass12345'
  });
  assert.equal(user.response.status, 201, JSON.stringify(user.response.data));
  userAccount = user.payload;

  // Telegram contact, banner and a paid campaign for the current hour.
  await ownerClient.put('/api/admin/ads/settings', { ads_telegram: 'uni_lovers' });
  const form = new FormData();
  form.append('image', new Blob([makePng(1600, 400)], { type: 'image/png' }), 'banner.png');
  const upload = await ownerClient.post('/api/admin/ads/banners', undefined, { form });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const bannerId = upload.data.banner.id;
  const created = await ownerClient.post('/api/admin/ads/campaigns', {
    advertiser_name: 'Студенческая кофейня',
    advertiser_telegram: 'coffee_students',
    placements: ['swipe', 'profile'],
    hours: [nowHourStart(), nowHourStart() + 3600],
    banner_swipe_id: bannerId,
    banner_profile_id: bannerId,
    paid_status: 'paid',
    link_url: 'https://example.com/coffee',
    alt_text: 'Кофейня для студентов'
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  campaignId = created.data.campaign.id;
});

test.after(async () => {
  if (browser) await browser.close().catch(() => {});
  if (server) server.stop();
});

test('landing page renders on phone, tablet and desktop without console errors', async () => {
  for (const width of [375, 768, 1440]) {
    const { context, page, errors, failed } = await newContext({ viewport: { width, height: width === 1440 ? 900 : 1024 } });
    await page.goto(base);
    await page.waitForSelector('.landing');
    await noHorizontalScroll(page, `landing ${width}`);
    await shot(page, `e2e-landing-${width}.png`);
    assert.deepEqual(errors, [], `landing ${width} console errors`);
    assert.deepEqual(failed, [], `landing ${width} failed requests`);
    await context.close();
  }
});

test('public /advertise grid selects hours, shows the sum and opens the Telegram instructions', async () => {
  const { context, page, errors, failed } = await newContext({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/advertise`);
  await page.waitForSelector('.adv-grid');
  assert.equal(await page.locator('.adv-grid .adv-hour').count(), 24);
  assert.equal(await page.locator('.adv-day').count() >= 30, true);
  await noHorizontalScroll(page, 'advertise 1440');

  const freeCell = page.locator('.adv-hour.is-free:not([disabled])').first();
  await freeCell.click();
  await page.waitForSelector('.adv-bar.is-visible');
  assert.match(await page.textContent('.adv-bar__text'), /Выбрано: 1 час/);
  assert.match(await page.textContent('.adv-bar__sum'), /15\s000 сум/);
  await shot(page, 'e2e-advertise-1440.png');

  // Week heatmap view.
  await page.click('.segmented__item:has-text("Неделя")');
  await page.waitForSelector('.adv-week__grid');
  assert.equal(await page.locator('.adv-week__cell').count(), 7 * 24);
  await page.click('.segmented__item:has-text("День")');
  await page.waitForSelector('.adv-grid');

  await page.click('.adv-bar .btn-primary');
  await page.waitForSelector('.adv-modal');
  assert.match(await page.textContent('.adv-modal'), /Напишите администратору/);
  assert.match(await page.textContent('.adv-modal'), /@uni_lovers/);
  assert.match(await page.textContent('.adv-modal__code'), /^Код заявкиAD-[A-Z2-9]{4}$/);
  assert.equal(await page.locator('.adv-modal__actions a.btn-primary').getAttribute('href').then((href) => href.startsWith('https://t.me/uni_lovers?text=')), true);
  await shot(page, 'e2e-advertise-modal-1440.png', false);

  assert.deepEqual(errors, [], 'advertise console errors');
  assert.deepEqual(failed, [], 'advertise failed requests');
  await context.close();
});

test('advertise page is usable on a 375px phone in dark theme', async () => {
  const { context, page, errors } = await newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
  await page.goto(`${base}/advertise`);
  await page.waitForSelector('.adv-grid');
  await noHorizontalScroll(page, 'advertise 375');
  const columns = await page.evaluate(() => getComputedStyle(document.querySelector('.adv-grid')).gridTemplateColumns.split(' ').length);
  assert.equal(columns, 4);
  await page.locator('.adv-hour.is-free:not([disabled])').first().click();
  await page.waitForSelector('.adv-bar.is-visible');
  await shot(page, 'e2e-advertise-375-dark.png');
  assert.deepEqual(errors, [], 'advertise mobile console errors');
  await context.close();
});

test('paid banner appears on the swipe screen and in the profile', async () => {
  const { context, page, errors, failed } = await newContext({ viewport: { width: 1440, height: 900 } });
  await loginUi(page, ownerAccount.email, ownerAccount.password);
  await page.waitForSelector('.ad-slot--paid img', { timeout: 15000 });
  const src = await page.getAttribute('.ad-slot--paid img', 'src');
  assert.match(src, /^\/uploads\/ads\//);
  const badge = await page.textContent('.ad-slot--paid .ad-badge');
  assert.equal(badge, 'Реклама');
  await shot(page, 'e2e-swipe-1440.png');

  await page.goto(`${base}/profile`);
  await page.waitForSelector('.ad-slot-host--profile .ad-slot--paid img', { timeout: 15000 });
  await shot(page, 'e2e-profile-1440.png');
  await noHorizontalScroll(page, 'profile 1440');

  assert.deepEqual(errors, [], 'banner console errors');
  assert.deepEqual(failed, [], 'banner failed requests');
  await context.close();
});

test('owner advertising panel renders calendar, opens booking and saves settings', async () => {
  const { context, page, errors } = await newContext({ viewport: { width: 1440, height: 900 } });
  await loginUi(page, ownerAccount.email, ownerAccount.password);
  await page.goto(`${base}/admin?section=ads`);
  await page.waitForSelector('.ads-cal');
  assert.equal(await page.locator('.ads-cell').count(), 7 * 24);
  const booked = await page.locator('.ads-cell:not(.is-free)').count();
  assert.ok(booked >= 1, 'current hour should be booked');
  await shot(page, 'e2e-admin-ads-1440.png');

  await page.locator('.ads-cell.is-free').first().click();
  await page.click('.admin-head .btn-primary');
  await page.waitForSelector('.modal');
  assert.match(await page.textContent('.modal__title'), /Новая бронь/);
  await shot(page, 'e2e-admin-booking-1440.png', false);
  await page.keyboard.press('Escape');

  await page.click('.ads-tab[data-tab="settings"]');
  await page.waitForSelector('input.input');
  const telegram = page.locator('.admin-panel input.input').first();
  assert.equal(await telegram.inputValue(), 'uni_lovers');
  await shot(page, 'e2e-admin-ads-settings-1440.png');

  await page.click('.ads-tab[data-tab="campaigns"]');
  await page.waitForSelector('.ads-list__row');
  assert.match(await page.textContent('.ads-list'), /Студенческая кофейня/);

  assert.deepEqual(errors, [], 'admin ads console errors');
  await context.close();
});

test('owner security page renders 2FA, sessions and login history', async () => {
  const { context, page, errors } = await newContext({ viewport: { width: 1440, height: 900 } });
  await loginUi(page, ownerAccount.email, ownerAccount.password);
  await page.goto(`${base}/admin?section=security`);
  await page.waitForSelector('.admin-panel');
  const text = await page.textContent('body');
  assert.match(text, /Двухфакторная аутентификация/);
  assert.match(text, /Активные сессии/);
  assert.match(text, /Последние входы/);
  await shot(page, 'e2e-admin-security-1440.png');
  assert.deepEqual(errors, [], 'security console errors');
  await context.close();
});

test('admin panel has no horizontal page scroll on a phone', async () => {
  const { context, page, errors } = await newContext({ viewport: { width: 375, height: 812 } });
  await loginUi(page, ownerAccount.email, ownerAccount.password);
  await page.goto(`${base}/admin?section=ads`);
  await page.waitForSelector('.ads-day-card');
  assert.equal(await page.locator('.ads-day-card').count(), 7);
  await noHorizontalScroll(page, 'admin ads 375');
  await shot(page, 'e2e-admin-ads-375.png');
  await page.goto(`${base}/admin?section=ads&tab=campaigns`);
  await page.waitForSelector('.ads-list__row');
  await noHorizontalScroll(page, 'admin campaigns 375');
  assert.deepEqual(errors, [], 'mobile admin console errors');
  await context.close();
});

test('a regular user cannot open the owner panel or the ads API', async () => {
  const { context, page } = await newContext({ viewport: { width: 1440, height: 900 } });
  await loginUi(page, userAccount.email, userAccount.password);
  await page.goto(`${base}/admin?section=ads`);
  await page.waitForSelector('.empty__title');
  assert.match(await page.textContent('.empty__title'), /не найдена/i);

  const api = await page.evaluate(async () => {
    const response = await fetch('/api/admin/ads/overview');
    return response.status;
  });
  assert.equal(api, 404);
  await context.close();
  void campaignId;
});
