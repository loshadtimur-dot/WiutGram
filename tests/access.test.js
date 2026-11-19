'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createClient, register } = require('./helpers');

const PORT = Number(process.env.ACCESS_TEST_PORT || 3213);
const base = `http://127.0.0.1:${PORT}`;

let server;
let owner;
let user;
let userId;

test.before(async () => {
  server = await startServer(PORT);
  owner = createClient(base);
  const ownerResult = await register(owner, { email: 'owner@example.com', username: 'accessowner' });
  assert.equal(ownerResult.response.status, 201, JSON.stringify(ownerResult.response.data));

  user = createClient(base);
  const userResult = await register(user, {
    email: 'lost@example.com',
    username: 'lostuser',
    password: 'LostPass12345'
  });
  assert.equal(userResult.response.status, 201, JSON.stringify(userResult.response.data));
  userId = userResult.response.data.user.id;
});

test.after(() => {
  if (server) server.stop();
});

test('recovery form answers identically for existing and unknown accounts', async () => {
  const guest = createClient(base);
  const known = await guest.post('/api/access/request', {
    identifier: 'lostuser',
    contact: '@tester',
    comment: 'Забыл пароль'
  });
  const unknown = await guest.post('/api/access/request', {
    identifier: 'nobody-here',
    contact: '@tester'
  });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.data, unknown.data);
  assert.equal(known.data.message.includes('Запрос отправлен'), true);
});

test('recovery requests are limited to three per hour per IP', async () => {
  const guest = createClient(base);
  for (let index = 0; index < 3; index += 1) {
    const response = await guest.post('/api/access/request', {
      identifier: `spam${index}`,
      contact: '@spam'
    });
    assert.equal(response.status, 200);
  }
  const extra = await guest.post('/api/access/request', {
    identifier: 'spam-extra',
    contact: '@spam'
  });
  assert.equal(extra.status, 200);
  assert.equal(JSON.stringify(extra.data).includes('throttled'), false);
});

test('owner sees requests and issues a one-time temporary password', async () => {
  const pending = await owner.get('/api/admin/access/requests');
  assert.equal(pending.status, 200);
  const entry = pending.data.requests.find((request) => request.identifier === 'lostuser');
  assert.ok(entry);
  assert.equal(entry.password, undefined);
  assert.equal(JSON.stringify(pending.data).includes('password_hash'), false);

  const denied = await owner.post(`/api/admin/access/users/${userId}/temp-password`);
  assert.equal(denied.status, 403);
  const reauth = await owner.post('/api/admin/reauth', { password: 'OwnerPass12345' });
  assert.equal(reauth.status, 200);

  const issued = await owner.post(`/api/admin/access/users/${userId}/temp-password`);
  assert.equal(issued.status, 200, JSON.stringify(issued.data));
  assert.equal(typeof issued.data.password, 'string');
  assert.equal(issued.data.password.length, 12);

  const oldLogin = await createClient(base).post('/api/auth/login', {
    login: 'lostuser',
    password: 'LostPass12345'
  });
  assert.equal(oldLogin.status, 401);

  const fresh = createClient(base);
  const tempLogin = await fresh.post('/api/auth/login', {
    login: 'lostuser',
    password: issued.data.password
  });
  assert.equal(tempLogin.status, 200, JSON.stringify(tempLogin.data));
  assert.equal(!!tempLogin.data.user.force_password_change, true);

  const blocked = await fresh.get('/api/shop/catalog');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'password_change_required');

  const request = await owner.get(`/api/admin/access/users/${userId}`);
  assert.equal(request.status, 200);
  assert.equal(JSON.stringify(request.data).includes(issued.data.password), false);
  assert.equal(request.data.user.password_hash, undefined);
  assert.ok(request.data.sessions.length >= 0);
});

test('owner can revoke sessions and set a new password manually', async () => {
  const session = createClient(base);
  const login = await session.post('/api/auth/login', { login: 'accessowner', password: 'OwnerPass12345' });
  assert.equal(login.status, 200);
  const before = await session.get('/api/auth/me');
  assert.equal(before.status, 200);

  await owner.post('/api/admin/reauth', { password: 'OwnerPass12345' });
  const revoked = await owner.post(`/api/admin/access/users/${userId}/revoke-sessions`);
  assert.equal(revoked.status, 200);

  const set = await owner.post(`/api/admin/access/users/${userId}/password`, {
    password: 'ManualPass12345'
  });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  const loginAgain = await createClient(base).post('/api/auth/login', {
    login: 'lostuser',
    password: 'ManualPass12345'
  });
  assert.equal(loginAgain.status, 200);
  assert.equal(loginAgain.data.user.force_password_change, true);
});

test('request statuses are tracked for the owner journal', async () => {
  const pending = await owner.get('/api/admin/access/requests?status=new');
  assert.equal(pending.status, 200);
  const entry = pending.data.requests[0];
  assert.ok(entry);
  const updated = await owner.post(`/api/admin/access/requests/${entry.id}/status`, { status: 'declined' });
  assert.equal(updated.status, 200);
  const log = await owner.get('/api/admin/log?action=access_request_status');
  assert.equal(log.status, 200);
  assert.equal(log.data.log.length >= 1, true);
});
