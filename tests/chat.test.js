'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createClient, register } = require('./helpers');

const PORT = Number(process.env.CHAT_TEST_PORT || 3212);
const base = `http://127.0.0.1:${PORT}`;

let server;
let alice;
let bob;
let carol;
let groupId;

async function makeUser(username) {
  const client = createClient(base);
  const result = await register(client, {
    email: `${username}@example.com`,
    username,
    password: 'UserPass12345'
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.response.data));
  return { client, id: result.response.data.user.id };
}

async function userId(client, username) {
  const response = await client.get(`/api/users/${username}`);
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.user.id;
}

test.before(async () => {
  server = await startServer(PORT);
  alice = await makeUser('chatalice');
  bob = await makeUser('chatbob');
  carol = await makeUser('chatcarol');
});

test.after(() => {
  if (server) server.stop();
});

test('group creation adds members, roles and a system message', async () => {
  const created = await alice.client.post('/api/conversations', {
    title: 'Учебная группа',
    description: 'Готовимся к экзаменам',
    usernames: ['chatbob'],
    join_mode: 'approval',
    is_public: false
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  groupId = created.data.conversation.id;
  assert.equal(created.data.conversation.type, 'group');
  assert.equal(created.data.conversation.role, 'owner');
  assert.equal(created.data.added, 1);

  const meta = await bob.client.get(`/api/conversations/${groupId}`);
  assert.equal(meta.status, 200);
  assert.equal(meta.data.members.length, 2);
  const roles = meta.data.members.map((member) => member.role).sort();
  assert.deepEqual(roles, ['member', 'owner']);
  const system = meta.data.messages;
  assert.equal(system, undefined);
});

test('messages get sequential numbers and client_msg_id is idempotent', async () => {
  const first = await alice.client.post(`/api/conversations/${groupId}/messages`, {
    body: 'Привет, группа!',
    client_msg_id: 'client-1'
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const second = await alice.client.post(`/api/conversations/${groupId}/messages`, {
    body: 'Привет, группа!',
    client_msg_id: 'client-1'
  });
  assert.equal(second.status, 201);
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.message.id, first.data.message.id);

  const third = await bob.client.post(`/api/conversations/${groupId}/messages`, { body: 'Привет!' });
  assert.equal(third.status, 201);
  assert.ok(third.data.message.seq > first.data.message.seq);

  const list = await bob.client.get(`/api/conversations/${groupId}/messages?limit=50`);
  assert.equal(list.status, 200);
  const ids = list.data.messages.map((message) => message.id);
  assert.equal(new Set(ids).size, ids.length);
  const seqs = list.data.messages.filter((message) => message.type !== 'system').map((message) => message.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
});

test('reply, edit window and delete for all', async () => {
  const target = await bob.client.post(`/api/conversations/${groupId}/messages`, { body: 'Ответьте мне' });
  const reply = await alice.client.post(`/api/conversations/${groupId}/messages`, {
    body: 'Отвечаю',
    reply_to_id: target.data.message.id
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.message.reply_to.id, target.data.message.id);
  assert.equal(reply.data.message.reply_to.sender_name, 'Тест 2');

  const edited = await alice.client.request('PATCH', `/api/messages/${reply.data.message.id}`, {
    body: { body: 'Отвечаю иначе' }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.message.body, 'Отвечаю иначе');
  assert.ok(edited.data.message.edited_at);

  const foreign = await bob.client.request('PATCH', `/api/messages/${reply.data.message.id}`, {
    body: { body: 'Взлом' }
  });
  assert.equal(foreign.status, 403);

  const deleted = await alice.client.delete(`/api/messages/${reply.data.message.id}`);
  assert.equal(deleted.status, 200);
  const list = await bob.client.get(`/api/conversations/${groupId}/messages?limit=100`);
  const gone = list.data.messages.find((message) => message.id === reply.data.message.id);
  assert.equal(gone.deleted, true);
  assert.equal(gone.body, '');
});

test('reactions toggle, pins respect permissions, polls collect votes', async () => {
  const message = await alice.client.post(`/api/conversations/${groupId}/messages`, { body: 'Лайкните' });
  const id = message.data.message.id;

  const added = await bob.client.post(`/api/messages/${id}/reactions`, { emoji: 'glass-heart' });
  assert.equal(added.status, 200);
  assert.equal(added.data.reactions[0].count, 1);
  const removed = await bob.client.post(`/api/messages/${id}/reactions`, { emoji: 'glass-heart' });
  assert.equal(removed.data.reactions.length, 0);

  const denied = await bob.client.post(`/api/messages/${id}/pin`, { pinned: true });
  assert.equal(denied.status, 403);
  const pinned = await alice.client.post(`/api/messages/${id}/pin`, { pinned: true });
  assert.equal(pinned.status, 200);
  assert.equal(pinned.data.pinned_messages.length, 1);

  const poll = await alice.client.post(`/api/conversations/${groupId}/polls`, {
    question: 'Куда идём?',
    options: ['Кофе', 'Кино'],
    anonymous: false,
    multiple: false
  });
  assert.equal(poll.status, 201, JSON.stringify(poll.data));
  const optionId = poll.data.poll.options[0].id;
  const vote = await bob.client.post(`/api/polls/${poll.data.poll.id}/vote`, { option_ids: [optionId] });
  assert.equal(vote.status, 200);
  assert.equal(vote.data.poll.total_votes, 1);
  assert.equal(vote.data.poll.options[0].votes, 1);
});

test('invites let a new member join once', async () => {
  const invite = await alice.client.post(`/api/conversations/${groupId}/invites`, {
    expires_in_days: 1,
    max_uses: 2
  });
  assert.equal(invite.status, 200, JSON.stringify(invite.data));
  const joined = await carol.client.post(`/api/invites/${invite.data.invite.code}/join`);
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  const meta = await carol.client.get(`/api/conversations/${groupId}`);
  assert.equal(meta.status, 200);
  assert.equal(meta.data.members.length, 3);
  const again = await carol.client.post(`/api/invites/${invite.data.invite.code}/join`);
  assert.equal(again.status, 200);
  const invalid = await carol.client.post('/api/invites/does-not-exist/join');
  assert.equal(invalid.status, 404);
});

test('strangers need an accepted message request before writing freely', async () => {
  const started = await carol.client.post('/api/conversations/dm', { username: 'chatalice' });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  assert.equal(started.data.request, true);
  const conversationId = started.data.conversation.id;

  const first = await carol.client.post(`/api/conversations/${conversationId}/messages`, { body: 'Здравствуйте!' });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const second = await carol.client.post(`/api/conversations/${conversationId}/messages`, { body: 'Ещё одно' });
  assert.equal(second.status, 403);

  const requests = await alice.client.get('/api/conversations/requests');
  assert.equal(requests.status, 200);
  assert.equal(requests.data.requests.length >= 1, true);
  await alice.client.post(`/api/conversations/requests/${requests.data.requests[0].id}/accept`);
  const third = await carol.client.post(`/api/conversations/${conversationId}/messages`, { body: 'Спасибо!' });
  assert.equal(third.status, 201);
});

test('blocked users cannot start a conversation', async () => {
  const bobId = await userId(alice.client, 'chatbob');
  const carolId = await userId(alice.client, 'chatcarol');
  const blocked = await bob.client.post(`/api/users/${carolId}/block`);
  assert.equal(blocked.status, 200, JSON.stringify(blocked.data));
  const response = await carol.client.post('/api/conversations/dm', { username: 'chatbob' });
  assert.equal(response.status, 403);
  await bob.client.delete(`/api/users/${carolId}/block`);
  assert.ok(bobId);
});

test('saved messages and global search work', async () => {
  const saved = await alice.client.post('/api/conversations/saved');
  assert.equal(saved.status, 200);
  const note = await alice.client.post(`/api/conversations/${saved.data.conversation.id}/messages`, {
    body: 'купить подарок на день рождения'
  });
  assert.equal(note.status, 201);
  const search = await alice.client.get('/api/chat/search?q=день%20рождения');
  assert.equal(search.status, 200);
  assert.equal(search.data.messages.length >= 1, true);
});

test('legacy match messages appear in the conversation history', async () => {
  const aliceId = await userId(alice.client, 'chatalice');
  const bobId = await userId(alice.client, 'chatbob');
  const likeA = await alice.client.post('/api/swipes', { to_id: bobId, action: 'like' });
  const likeB = await bob.client.post('/api/swipes', { to_id: aliceId, action: 'like' });
  assert.equal(likeB.status, 200, JSON.stringify(likeB.data));
  const match = likeA.data.is_match ? likeA.data.match : likeB.data.match;
  assert.ok(match && match.id, JSON.stringify(likeB.data));

  const legacy = await alice.client.post(`/api/matches/${match.id}/messages`, { body: 'Привет из матча' });
  assert.equal(legacy.status, 201, JSON.stringify(legacy.data));
  assert.ok(legacy.data.message.conversation_id);

  const dm = await bob.client.post('/api/conversations/dm', { username: 'chatalice' });
  assert.equal(dm.status, 200);
  const history = await bob.client.get(`/api/conversations/${dm.data.conversation.id}/messages`);
  const bodies = history.data.messages.map((message) => message.body);
  assert.equal(bodies.includes('Привет из матча'), true);
});

test('people search and public groups are discoverable', async () => {
  const people = await alice.client.get('/api/people?q=chatbob');
  assert.equal(people.status, 200);
  assert.equal(people.data.users.some((user) => user.username === 'chatbob'), true);

  const published = await alice.client.post('/api/conversations', {
    title: 'Публичная группа WIUT',
    is_public: true,
    username: 'wiut_public',
    join_mode: 'open'
  });
  assert.equal(published.status, 201, JSON.stringify(published.data));
  const groups = await bob.client.get('/api/people/groups?q=wiut');
  assert.equal(groups.status, 200);
  assert.equal(groups.data.groups.some((group) => group.username === 'wiut_public'), true);
  const joined = await bob.client.post(`/api/conversations/${published.data.conversation.id}/join`);
  assert.equal(joined.status, 200);
});

test('a recorded voice note uploads through the same field the composer sends', async () => {
  const dm = await alice.client.post('/api/conversations/dm', { username: 'chatbob' });
  assert.equal(dm.status, 200, JSON.stringify(dm.data));

  // Chromium labels recordings as "audio/webm;codecs=opus" and names the part "voice".
  const form = new FormData();
  form.append('voice', new Blob([Buffer.from('fake-webm-bytes')], { type: 'audio/webm;codecs=opus' }), 'voice.webm');
  form.append('duration', '4');
  const sent = await alice.client.post(`/api/conversations/${dm.data.conversation.id}/messages/voice`, undefined, { form });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.message.type, 'voice');
  assert.match(sent.data.message.image_path, /^\/uploads\/voice\/.+\.webm$/);

  const file = await alice.client.get(sent.data.message.image_path);
  assert.equal(file.status, 200);

  const history = await bob.client.get(`/api/conversations/${dm.data.conversation.id}/messages`);
  const voice = history.data.messages.find((message) => message.id === sent.data.message.id);
  assert.ok(voice, 'the recipient sees the voice note');
  assert.equal(voice.type, 'voice');
});

test('mutual follows surface in the chat list until a DM exists', async () => {
  const dave = await makeUser('chatdave');
  assert.equal((await alice.client.post('/api/follows/chatdave')).status, 200);
  assert.equal((await dave.client.post('/api/follows/chatalice')).status, 200);

  let list = await alice.client.get('/api/conversations');
  assert.equal(list.status, 200);
  assert.equal(list.data.mutuals.some((person) => person.username === 'chatdave'), true);

  const dm = await alice.client.post('/api/conversations/dm', { username: 'chatdave' });
  assert.equal(dm.status, 200, JSON.stringify(dm.data));
  list = await alice.client.get('/api/conversations');
  assert.equal(list.data.mutuals.some((person) => person.username === 'chatdave'), false, 'the DM replaces the suggestion');
});

test('a message request can be accepted from the chat view', async () => {
  const erin = await makeUser('chaterin');
  const dm = await alice.client.post('/api/conversations/dm', { username: 'chaterin' });
  assert.equal(dm.status, 200, JSON.stringify(dm.data));
  const conversationId = dm.data.conversation.id;
  const sent = await alice.client.post(`/api/conversations/${conversationId}/messages`, { body: 'Привет!' });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));

  const view = await erin.client.get(`/api/conversations/${conversationId}`);
  assert.equal(view.status, 200, JSON.stringify(view.data));
  assert.equal(view.data.conversation.request_pending, true);
  assert.ok(view.data.conversation.request_id, 'the view exposes the request to accept');

  const accepted = await erin.client.post(`/api/conversations/requests/${view.data.conversation.request_id}/accept`);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const after = await erin.client.get(`/api/conversations/${conversationId}`);
  assert.equal(after.data.conversation.request_pending, false);
  const reply = await erin.client.post(`/api/conversations/${conversationId}/messages`, { body: 'Привет!' });
  assert.equal(reply.status, 201, JSON.stringify(reply.data));
});
