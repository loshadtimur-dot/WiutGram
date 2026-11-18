'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { matchForUser } = require('../lib/matches');
const { isBlockedBetween } = require('../lib/blocks');
const { notify } = require('../lib/notify');
const { emitToUser } = require('../lib/io');
const { toInt, cleaned } = require('../middleware/validate');
const { nowIso } = require('../utils/time');
const { BADGE_MAP, GIFT_MAP } = require('../lib/cosmetics/catalog');
const store = require('../lib/cosmetics/store');

const router = express.Router();
router.use(requireAuth);

function settingsPayload() {
  return {
    owner_telegram: db.getSetting('owner_telegram', ''),
    gifts_enabled: db.getSetting('gifts_enabled', '1') === '1',
    badges_enabled: db.getSetting('badges_enabled', '1') === '1',
    banners_enabled: db.getSetting('banners_enabled', '1') === '1'
  };
}

/* ---------- Catalog and profile cosmetics ---------- */

router.get('/cosmetics/catalog', (req, res) => {
  res.json({ catalog: store.catalogFor(req.user.id), settings: settingsPayload() });
});

router.get('/cosmetics/me', (req, res) => {
  res.json({
    catalog: store.catalogFor(req.user.id),
    profile: store.profileCosmetics(req.user.id, { self: true }),
    settings: settingsPayload()
  });
});

router.get('/cosmetics/users/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const target = db.get('SELECT id, role, is_banned FROM users WHERE username = ?', [username]);
  if (!target || target.is_banned) return res.status(404).json({ error: 'Профиль не найден' });
  const self = target.id === req.user.id;
  res.json({
    profile: store.profileCosmetics(target.id, { self }),
    is_self: self,
    is_following: store.isFollowing(req.user.id, target.id),
    settings: settingsPayload()
  });
});

/* ---------- Banners ---------- */

router.post('/cosmetics/banner', (req, res) => {
  if (db.getSetting('banners_enabled', '1') !== '1') {
    return res.status(403).json({ error: 'Баннеры временно отключены' });
  }
  const bannerId = req.body && req.body.banner_id ? String(req.body.banner_id) : null;
  if (!store.equipBanner(req.user.id, bannerId)) {
    return res.status(403).json({ error: 'Этот баннер вам недоступен' });
  }
  const banner = bannerId ? require('../lib/cosmetics/catalog').BANNER_MAP.get(bannerId) : null;
  res.json({ ok: true, banner });
});

/* ---------- Badges ---------- */

// Locked badges are shown to everyone; only the owner can grant access.
router.get('/cosmetics/badges', (req, res) => {
  res.json({
    badges: store.catalogFor(req.user.id).badges,
    settings: settingsPayload()
  });
});

/* ---------- Gifts ---------- */

router.post('/cosmetics/gift/equip', (req, res) => {
  const giftId = req.body && req.body.gift_id ? String(req.body.gift_id) : null;
  if (!store.equipGift(req.user.id, giftId)) {
    return res.status(403).json({ error: 'Этого подарка нет в вашей коллекции' });
  }
  res.json({ ok: true, equipped_gift: store.equippedGift(req.user.id) });
});

router.post('/cosmetics/gift/hide', (req, res) => {
  const giftId = String((req.body && req.body.gift_id) || '');
  if (!GIFT_MAP.has(giftId)) return res.status(400).json({ error: 'Подарок не найден' });
  const hidden = !!(req.body && req.body.hidden);
  if (!store.setGiftHidden(req.user.id, giftId, hidden)) {
    return res.status(404).json({ error: 'Этого подарка нет в вашей коллекции' });
  }
  res.json({ ok: true, hidden });
});

router.post('/cosmetics/gift/send', (req, res) => {
  const matchId = toInt(req.body && req.body.match_id, 0);
  const giftId = String((req.body && req.body.gift_id) || '');
  const info = matchId ? matchForUser(matchId, req.user.id) : null;
  if (!info || !info.match.is_active) return res.status(404).json({ error: 'Диалог не найден' });
  if (isBlockedBetween(req.user.id, info.other.id)) {
    return res.status(403).json({ error: 'Диалог недоступен' });
  }
  if (info.other.is_banned) return res.status(403).json({ error: 'Пользователь заблокирован' });
  const gift = GIFT_MAP.get(giftId);
  if (!gift) return res.status(400).json({ error: 'Подарок не найден' });
  if (db.getSetting('gifts_enabled', '1') !== '1') {
    return res.status(403).json({ error: 'Подарки временно отключены' });
  }

  const admin = req.user.role === 'owner';
  if (!admin) {
    const owned = db.get('SELECT id FROM user_gifts WHERE user_id = ? AND gift_id = ? LIMIT 1', [
      req.user.id,
      giftId
    ]);
    if (!owned) {
      return res.status(400).json({
        error: 'Этого подарка нет в вашей коллекции. Его можно купить у администратора в Telegram.'
      });
    }
  }

  const transferred = store.transferGift({
    fromId: req.user.id,
    toId: info.other.id,
    giftId,
    admin
  });
  if (!transferred) return res.status(400).json({ error: 'Не удалось передать подарок' });

  const createdAt = nowIso();
  const result = db.run(
    `INSERT INTO messages (match_id, sender_id, type, body, image_path, created_at)
     VALUES (?, ?, 'gift', ?, NULL, ?)`,
    [info.match.id, req.user.id, giftId, createdAt]
  );
  const row = db.get('SELECT * FROM messages WHERE id = ?', [Number(result.lastInsertRowid)]);
  const view = {
    id: row.id,
    match_id: row.match_id,
    sender_id: row.sender_id,
    type: 'gift',
    body: giftId,
    image_path: null,
    created_at: row.created_at,
    read_at: null,
    reaction: null,
    deleted: false,
    mine: true
  };
  emitToUser(req.user.id, 'message:new', { message: view, match_id: info.match.id });
  emitToUser(info.other.id, 'message:new', {
    message: { ...view, mine: false },
    match_id: info.match.id
  });
  notify({
    userId: info.other.id,
    type: 'gift',
    actorId: req.user.id,
    refId: info.match.id,
    text: `Вам подарили «${gift.name}»`
  });
  res.status(201).json({
    message: view,
    gift: {
      id: gift.id,
      name: gift.name,
      rarity: gift.rarity,
      svg: gift.svg
    }
  });
});

// Moves a received gift to another user from the profile, not a chat.
router.post('/cosmetics/gift/regift', (req, res) => {
  const giftId = String((req.body && req.body.gift_id) || '');
  const username = cleaned(req.body && req.body.username, 24).toLowerCase().replace(/^@/, '');
  if (!GIFT_MAP.has(giftId)) return res.status(400).json({ error: 'Подарок не найден' });
  if (!username) return res.status(400).json({ error: 'Укажите username получателя' });
  const target = db.get('SELECT id, username, is_banned, is_demo FROM users WHERE username = ?', [username]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Нельзя подарить подарок самому себе' });
  if (target.is_banned || target.is_demo) {
    return res.status(400).json({ error: 'Этому пользователю нельзя подарить подарок' });
  }
  const transferred = store.transferGift({
    fromId: req.user.id,
    toId: target.id,
    giftId,
    admin: req.user.role === 'owner'
  });
  if (!transferred) return res.status(400).json({ error: 'Этого подарка нет в вашей коллекции' });
  const gift = GIFT_MAP.get(giftId);
  notify({
    userId: target.id,
    type: 'gift',
    actorId: req.user.id,
    text: `Вам подарили «${gift.name}»`
  });
  res.json({ ok: true, username: target.username, gift: { id: gift.id, name: gift.name, rarity: gift.rarity } });
});

/* ---------- Followers ---------- */

router.post('/follows/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const target = db.get('SELECT id, is_banned, is_demo FROM users WHERE username = ?', [username]);
  if (!target || target.is_banned || target.is_demo) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if (target.id === req.user.id) return res.status(400).json({ error: 'Нельзя подписаться на себя' });
  if (isBlockedBetween(req.user.id, target.id)) {
    return res.status(403).json({ error: 'Подписка недоступна' });
  }
  store.follow(req.user.id, target.id);
  notify({ userId: target.id, type: 'follow', actorId: req.user.id, text: 'подписался(ась) на ваш профиль' });
  res.json({ ok: true, following: true, followers: store.followCounts(target.id).followers });
});

router.delete('/follows/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const target = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  store.unfollow(req.user.id, target.id);
  res.json({ ok: true, following: false, followers: store.followCounts(target.id).followers });
});

router.get('/aura', (req, res) => {
  const limit = Math.max(1, Math.min(100, toInt(req.query.limit, 50)));
  const table = store.auraTable({ limit, viewerId: req.user.id });
  const ids = table.leaders.map((row) => row.id);
  const badges = ids.length
    ? db.all(
        `SELECT ub.user_id, ub.badge_id FROM user_badges ub
         WHERE ub.user_id IN ${db.inClause(ids.length)}
           AND (ub.expires_at IS NULL OR ub.expires_at > ?)`,
        [...ids, nowIso()]
      )
    : [];
  const byUser = new Map();
  for (const row of badges) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    const badge = BADGE_MAP.get(row.badge_id);
    if (badge) byUser.get(row.user_id).push({ id: badge.id, name: badge.name, rarity: badge.rarity, svg: badge.svg });
  }
  res.json({
    leaders: table.leaders.map((row) => ({ ...row, badges: byUser.get(row.id) || [] })),
    me: table.me,
    total: db.get('SELECT COUNT(*) AS t FROM users WHERE is_demo = 0 AND is_banned = 0').t
  });
});

module.exports = router;
