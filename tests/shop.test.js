'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createClient, register } = require('./helpers');

const PORT = Number(process.env.SHOP_TEST_PORT || 3211);
const base = `http://127.0.0.1:${PORT}`;

let server;
let owner;

async function makeUser(label, password = 'UserPass12345') {
  const client = createClient(base);
  const result = await register(client, {
    email: `${label}@example.com`,
    username: label,
    password
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.response.data));
  return client;
}

async function reauth(client, password = 'OwnerPass12345') {
  const response = await client.post('/api/admin/reauth', { password });
  assert.equal(response.status, 200, JSON.stringify(response.data));
}

test.before(async () => {
  server = await startServer(PORT);
  owner = createClient(base);
  const result = await register(owner, { email: 'owner@example.com', username: 'shopowner' });
  assert.equal(result.response.status, 201, JSON.stringify(result.response.data));
});

test.after(() => {
  if (server) server.stop();
});

test('catalogue exposes gifts, banners, backgrounds and emoji packs', async () => {
  const catalog = await owner.get('/api/shop/catalog');
  assert.equal(catalog.status, 200);
  const kinds = new Set(catalog.data.items.map((item) => item.kind));
  for (const kind of ['gift', 'banner', 'background', 'emoji_pack']) assert.equal(kinds.has(kind), true, kind);
  const gift = catalog.data.items.find((item) => item.kind === 'gift' && item.price > 0);
  assert.ok(gift.svg || gift.asset);
  assert.equal(gift.asset.sprite.startsWith('gift-'), true);
});

test('order price always comes from the database', async () => {
  const buyer = await makeUser('pricebuyer');
  const catalog = await buyer.get('/api/shop/catalog?kind=gift');
  const gift = catalog.data.items.find((item) => item.kind === 'gift' && item.price > 0);
  const order = await buyer.post('/api/shop/orders', {
    item_id: gift.id,
    recipient_username: 'shopowner',
    price_total: 1,
    message: 'С днём рождения!'
  });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal(order.data.order.price_total, gift.price);
  assert.match(order.data.order.code, /^SH-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(order.data.order.status, 'new');
  assert.equal(order.data.purchase.telegram !== undefined, true);
});

test('a gift cannot be sent to yourself', async () => {
  const buyer = await makeUser('selfgift');
  const catalog = await buyer.get('/api/shop/catalog?kind=gift');
  const gift = catalog.data.items.find((item) => item.kind === 'gift' && item.price > 0);
  const response = await buyer.post('/api/shop/orders', {
    item_id: gift.id,
    recipient_username: 'selfgift'
  });
  assert.equal(response.status, 400);
});

test('only the owner can fulfil orders, and fulfilment is idempotent', async () => {
  const buyer = await makeUser('fulfilbuyer');
  const catalog = await buyer.get('/api/shop/catalog?kind=gift');
  const gift = catalog.data.items.find((item) => item.kind === 'gift' && item.price > 0);
  const created = await buyer.post('/api/shop/orders', {
    item_id: gift.id,
    recipient_username: 'fulfilbuyer2'
  });
  // The recipient must exist, so create them first on a fresh attempt.
  assert.equal(created.status, 404);
  await makeUser('fulfilbuyer2');
  const order = await buyer.post('/api/shop/orders', {
    item_id: gift.id,
    recipient_username: 'fulfilbuyer2'
  });
  assert.equal(order.status, 201, JSON.stringify(order.data));

  const forbidden = await buyer.post(`/api/admin/shop/orders/${order.data.order.id}/fulfill`);
  assert.equal(forbidden.status, 404);

  const first = await owner.post(`/api/admin/shop/orders/${order.data.order.id}/fulfill`);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.order.status, 'delivered');
  const second = await owner.post(`/api/admin/shop/orders/${order.data.order.id}/fulfill`);
  assert.equal(second.status, 200);
  assert.equal(second.data.already, true);
});

test('anonymous sender is hidden from the recipient and public API', async () => {
  const buyer = await makeUser('anonbuyer');
  const recipient = await makeUser('anonrecipient');
  const catalog = await recipient.get('/api/shop/catalog?kind=gift');
  const gift = catalog.data.items.find((item) => item.kind === 'gift' && item.price > 0);
  const order = await buyer.post('/api/shop/orders', {
    item_id: gift.id,
    recipient_username: 'anonrecipient',
    is_anonymous: true,
    message: 'Тайно'
  });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  const fulfilled = await owner.post(`/api/admin/shop/orders/${order.data.order.id}/fulfill`);
  assert.equal(fulfilled.status, 200, JSON.stringify(fulfilled.data));

  const mine = await recipient.get('/api/gifts/mine');
  assert.equal(mine.status, 200);
  const received = mine.data.gifts.find((entry) => entry.name === gift.title);
  assert.ok(received, 'gift should be in the inventory');
  assert.equal(received.hidden_sender, true);
  assert.equal(received.sender, null);
  assert.equal(JSON.stringify(mine.data).includes('anonbuyer'), false);

  const stranger = await makeUser('anonviewer');
  const publicProfile = await stranger.get('/api/decor/users/anonrecipient');
  assert.equal(publicProfile.status, 200);
  assert.equal(JSON.stringify(publicProfile.data).includes('anonbuyer'), false);
});

test('owner-only background cannot be equipped by a regular user', async () => {
  const user = await makeUser('ownerbg');
  const catalog = await user.get('/api/shop/catalog?kind=background');
  const ownerOnly = catalog.data.items.find((item) => item.is_owner_only);
  assert.equal(ownerOnly, undefined, 'owner-only items stay out of the public catalogue');
});

test('owner can grant and revoke an item with sudo', async () => {
  const user = await makeUser('grantee');
  const catalog = await owner.get('/api/shop/catalog?kind=banner');
  const banner = catalog.data.items.find((item) => item.kind === 'banner');
  const denied = await owner.post('/api/admin/shop/grant', {
    username: 'grantee',
    item_id: banner.id
  });
  assert.equal(denied.status, 403);
  await reauth(owner);
  const granted = await owner.post('/api/admin/shop/grant', {
    username: 'grantee',
    item_id: banner.id
  });
  assert.equal(granted.status, 200, JSON.stringify(granted.data));
  const decor = await user.get('/api/decor/me');
  assert.equal(decor.status, 200);
  const applied = await user.post('/api/decor/banner', { item_id: banner.id });
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.equal(applied.data.banner.name, banner.title);
});

test('30 parallel fulfilments of the last limited edition produce exactly one winner', async () => {
  await reauth(owner);
  const created = await owner.post('/api/admin/shop/items', {
    kind: 'gift',
    slug: 'test-limited-one',
    title: 'Лимитный тестовый подарок',
    price: 10000,
    rarity: 'legendary',
    edition_limit: 1
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const itemId = created.data.item.id;

  const buyers = [];
  for (let index = 0; index < 6; index += 1) {
    buyers.push(await makeUser(`race${index}`));
  }
  const orderIds = [];
  for (const buyer of buyers) {
    for (let index = 0; index < 5; index += 1) {
      const order = await buyer.post('/api/shop/orders', {
        item_id: itemId,
        recipient_username: 'shopowner'
      });
      assert.equal(order.status, 201, JSON.stringify(order.data));
      orderIds.push(order.data.order.id);
    }
  }
  assert.equal(orderIds.length, 30);

  const results = await Promise.all(
    orderIds.map((id) => owner.post(`/api/admin/shop/orders/${id}/fulfill`))
  );
  const winners = results.filter((response) => response.status === 200 && !response.data.already);
  const losers = results.filter((response) => response.status === 409);
  assert.equal(winners.length, 1, `winners=${winners.length}`);
  assert.equal(losers.length, 29);
  const items = await owner.get('/api/admin/shop/items?kind=gift');
  const limited = items.data.items.find((entry) => entry.slug === 'test-limited-one');
  assert.equal(limited.edition_sold, 1);
});

test('shop statistics and CSV export are owner-only', async () => {
  const stats = await owner.get('/api/admin/shop/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.data.revenue >= 0);
  const csv = await owner.get('/api/admin/shop/orders.csv');
  assert.equal(csv.status, 200);
  const buyer = await makeUser('statbuyer');
  const denied = await buyer.get('/api/admin/shop/stats');
  assert.equal(denied.status, 404);
});
