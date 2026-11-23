'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createClient, register, makePng } = require('./helpers');

const PORT = Number(process.env.SOCIAL_TEST_PORT || 3214);
const base = `http://127.0.0.1:${PORT}`;

let server;
let alice;
let bob;

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

function imageForm(caption, name = 'photo.png') {
  const form = new FormData();
  form.append('image', new Blob([makePng(24, 24)], { type: 'image/png' }), name);
  form.append('caption', caption);
  return form;
}

test.before(async () => {
  server = await startServer(PORT);
  alice = await makeUser('socialalice');
  bob = await makeUser('socialbob');
});

test.after(() => {
  if (server) server.stop();
});

test('a post can be created, liked, commented on, viewed and deleted', async () => {
  const created = await alice.post('/api/posts', undefined, { form: imageForm('Мой первый пост') });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const post = created.data.post;
  assert.equal(post.caption, 'Мой первый пост');
  assert.equal(post.likes, 0);

  const feed = await bob.get('/api/feed');
  assert.equal(feed.status, 200);
  assert.ok(feed.data.posts.some((entry) => entry.id === post.id), 'the post reaches the feed');

  const liked = await bob.post(`/api/posts/${post.id}/like`, {});
  assert.equal(liked.status, 200, JSON.stringify(liked.data));
  assert.equal(liked.data.liked, true);
  assert.equal(liked.data.likes, 1);
  const duplicate = await bob.post(`/api/posts/${post.id}/like`, {});
  assert.equal(duplicate.data.likes, 1, 'liking twice does not double count');
  const unliked = await bob.delete(`/api/posts/${post.id}/like`);
  assert.equal(unliked.data.likes, 0);

  const comment = await bob.post(`/api/posts/${post.id}/comments`, { body: 'Круто!' });
  assert.equal(comment.status, 201, JSON.stringify(comment.data));
  const comments = await alice.get(`/api/posts/${post.id}/comments`);
  assert.equal(comments.status, 200);
  assert.equal(comments.data.comments.length, 1);
  assert.equal(comments.data.comments[0].body, 'Круто!');

  const viewed = await bob.post(`/api/posts/${post.id}/view`, {});
  assert.equal(viewed.status, 200, JSON.stringify(viewed.data));
  assert.equal(viewed.data.views, 1);
  const viewedAgain = await bob.post(`/api/posts/${post.id}/view`, {});
  assert.equal(viewedAgain.data.views, 1, 'views are unique per user');

  const foreign = await bob.delete(`/api/posts/${post.id}`);
  assert.equal(foreign.status, 403, 'only the author can delete a post');

  const removed = await alice.delete(`/api/posts/${post.id}`);
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  const gone = await bob.get(`/api/posts/${post.id}`);
  assert.equal(gone.status, 404);
});

test('a story appears in the rail, is viewed once and can be deleted', async () => {
  const created = await alice.post('/api/stories', undefined, { form: imageForm('На кампусе') });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const story = created.data.story;
  assert.equal(story.caption, 'На кампусе');

  const rail = await bob.get('/api/stories');
  assert.equal(rail.status, 200);
  const group = rail.data.feeds.find((entry) => entry.user.username === 'socialalice');
  assert.ok(group, 'the author has a story rail');
  assert.ok(group.stories.some((entry) => entry.id === story.id));
  assert.equal(group.all_viewed, false);

  const viewed = await bob.post(`/api/stories/${story.id}/view`, {});
  assert.equal(viewed.status, 200, JSON.stringify(viewed.data));
  const after = await bob.get('/api/stories');
  const seen = after.data.feeds.find((entry) => entry.user.username === 'socialalice');
  assert.equal(seen.all_viewed, true, 'the rail marks the story as viewed');

  const highlight = await alice.post('/api/highlights', {
    title: 'Кампус',
    story_ids: [story.id]
  });
  assert.equal(highlight.status, 201, JSON.stringify(highlight.data));
  assert.equal(highlight.data.highlight.title, 'Кампус');
  const highlights = await bob.get('/api/highlights?username=socialalice');
  assert.equal(highlights.status, 200);
  assert.ok(highlights.data.highlights.some((entry) => entry.title === 'Кампус'));
  assert.equal((await bob.delete(`/api/highlights/${highlight.data.highlight.id}`)).status, 403);
  assert.equal((await alice.delete(`/api/highlights/${highlight.data.highlight.id}`)).status, 200);

  const foreign = await bob.delete(`/api/stories/${story.id}`);
  assert.equal(foreign.status, 403);

  const removed = await alice.delete(`/api/stories/${story.id}`);
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  const railAfter = await bob.get('/api/stories');
  assert.equal(railAfter.data.feeds.some((entry) => entry.user.username === 'socialalice'), false);
});
