'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createClient, register, makePng } = require('./helpers');

const PORT = Number(process.env.ADMIN_TEST_PORT || 3216);
const base = `http://127.0.0.1:${PORT}`;

let server;
let owner;
let alice;
let bob;
let aliceId;
let postId;

function imageForm(caption) {
  const form = new FormData();
  form.append('image', new Blob([makePng(24, 24)], { type: 'image/png' }), 'photo.png');
  form.append('caption', caption);
  return form;
}

async function makeUser(label) {
  const client = createClient(base);
  const result = await register(client, {
    email: `${label}@example.com`,
    username: label,
    password: 'UserPass12345'
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.response.data));
  return client;
}

test.before(async () => {
  server = await startServer(PORT);
  owner = await makeUser('adminowner');
  alice = await makeUser('adminalice');
  bob = await makeUser('adminbob');
  aliceId = (await alice.get('/api/auth/me')).data.user.id;
});

test.after(() => {
  if (server) server.stop();
});

test('admin content lists authors, stories and comments with pagination totals', async () => {
  const created = await alice.post('/api/posts', undefined, { form: imageForm('Пост для админки') });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  postId = created.data.post.id;
  const comment = await bob.post(`/api/posts/${postId}/comments`, { body: 'Комментарий для админки' });
  assert.equal(comment.status, 201);

  const posts = await owner.get('/api/admin/content/posts?limit=10');
  assert.equal(posts.status, 200);
  assert.equal(posts.data.total, 1);
  const post = posts.data.posts.find((entry) => entry.id === postId);
  assert.ok(post, 'the post is listed');
  assert.equal(post.author.display_name, 'Тест 2');
  assert.equal(post.author.username, 'adminalice');
  assert.equal(post.comments, 1);
  assert.equal(post.caption, 'Пост для админки');

  const comments = await owner.get('/api/admin/content/comments?limit=10');
  assert.equal(comments.status, 200);
  assert.equal(comments.data.total, 1);
  assert.equal(comments.data.comments[0].author.username, 'adminbob');
  assert.equal(comments.data.comments[0].body, 'Комментарий для админки');

  const stories = await owner.get('/api/admin/content/stories?limit=10');
  assert.equal(stories.status, 200);
  assert.equal(stories.data.total, 0);

  assert.equal((await alice.get('/api/admin/content/posts')).status, 404);
});

test('resolving a report hides the post from every feed', async () => {
  const report = await bob.post('/api/reports', {
    reported_id: aliceId,
    post_id: postId,
    reason: 'spam',
    details: 'Скрыть этот пост'
  });
  assert.equal(report.status, 201, JSON.stringify(report.data));

  const queue = await owner.get('/api/admin/reports?status=new');
  assert.equal(queue.status, 200);
  assert.equal(queue.data.reports.length, 1);
  assert.equal(queue.data.reports[0].reported_username, 'adminalice');
  assert.equal(queue.data.reports[0].reporter_username, 'adminbob');
  assert.equal(queue.data.reports[0].post_id, postId);

  const resolved = await owner.post(`/api/admin/reports/${queue.data.reports[0].id}/resolve`, {
    action: 'hide_post'
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.data));

  const feed = await bob.get('/api/feed');
  assert.equal(feed.data.posts.some((entry) => entry.id === postId), false, 'hidden post leaves the feed');
  assert.equal((await bob.get(`/api/posts/${postId}`)).status, 404);
  const profilePosts = await bob.get('/api/feed?username=adminalice');
  assert.equal(profilePosts.data.posts.some((entry) => entry.id === postId), false, 'hidden post leaves the profile');
  assert.equal(profilePosts.data.total, 0);
  const explore = await bob.get('/api/discover/explore');
  assert.equal(explore.status, 200, JSON.stringify(explore.data));
  assert.ok(Array.isArray(explore.data.posts), JSON.stringify(explore.data).slice(0, 500));
  assert.equal(explore.data.posts.some((entry) => entry.id === postId), false, 'hidden post leaves explore');

  const adminPosts = await owner.get('/api/admin/content/posts');
  const hidden = adminPosts.data.posts.find((entry) => entry.id === postId);
  assert.ok(hidden, 'the admin still sees the hidden post');
  assert.equal(hidden.is_hidden, true);

  const closed = await owner.get('/api/admin/reports?status=closed');
  assert.ok(closed.data.reports.some((entry) => entry.status === 'closed'));
});

test('group reports are created by members and handled by the owner', async () => {
  const created = await owner.post('/api/conversations', {
    title: 'Тестовая группа',
    usernames: ['adminalice'],
    is_public: false,
    join_mode: 'open'
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const conversationId = created.data.conversation.id;

  const reported = await alice.post(`/api/conversations/${conversationId}/report`, {
    reason: 'spam',
    details: 'Реклама в группе'
  });
  assert.equal(reported.status, 201, JSON.stringify(reported.data));
  const repeated = await alice.post(`/api/conversations/${conversationId}/report`, {
    reason: 'spam'
  });
  assert.equal(repeated.status, 409, 'the same member cannot duplicate an open report');

  const list = await owner.get('/api/admin/groups/reports');
  assert.equal(list.status, 200);
  assert.equal(list.data.reports.length, 1);
  assert.equal(list.data.reports[0].reporter_username, 'adminalice');
  assert.equal(list.data.reports[0].conversation_title, 'Тестовая группа');
  assert.equal(list.data.reports[0].status, 'new');

  const handled = await owner.post(`/api/admin/groups/reports/${list.data.reports[0].id}/status`, {
    status: 'reviewed'
  });
  assert.equal(handled.status, 200, JSON.stringify(handled.data));
  const after = await owner.get('/api/admin/groups/reports');
  assert.equal(after.data.reports[0].status, 'reviewed');

  assert.equal((await alice.get('/api/admin/groups')).status, 404);
});
