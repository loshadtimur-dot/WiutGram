'use strict';

const express = require('express');
const db = require('../../db');
const { adminLog } = require('../../lib/activity');
const { notify } = require('../../lib/notify');
const { toInt, clamp, cleaned } = require('../../middleware/validate');
const { BANNER_MAP, BADGE_MAP, GIFT_MAP, RARITIES, fullCatalog } = require('../../lib/cosmetics/catalog');
const store = require('../../lib/cosmetics/store');

const router = express.Router();

function findUser(body) {
  const username = cleaned(body && body.username, 24).toLowerCase().replace(/^@/, '');
  if (!username) return null;
  return db.get('SELECT id, username, display_name, role FROM users WHERE username = ?', [username]);
}

function grantMonths(body) {
  if (body && body.permanent) return 0;
  const months = toInt(body && body.months, 1);
  return months === 12 ? 12 : 1;
}

router.get('/overview', (req, res) => {
  res.json({
    catalog: fullCatalog(db.all('SELECT * FROM gift_overrides')),
    rarities: RARITIES,
    settings: {
      owner_telegram: db.getSetting('owner_telegram', ''),
      gifts_enabled: db.getSetting('gifts_enabled', '1') === '1',
      badges_enabled: db.getSetting('badges_enabled', '1') === '1',
      banners_enabled: db.getSetting('banners_enabled', '1') === '1'
    },
    stats: {
      badges_granted: db.get('SELECT COUNT(*) AS t FROM user_badges').t,
      banners_granted: db.get('SELECT COUNT(*) AS t FROM user_banners').t,
      gifts_granted: db.get('SELECT COUNT(*) AS t FROM user_gifts').t,
      followers: db.get('SELECT COUNT(*) AS t FROM follows').t
    },
    recent_badges: db.all(
      `SELECT ub.*, u.username, u.display_name FROM user_badges ub
       JOIN users u ON u.id = ub.user_id ORDER BY ub.id DESC LIMIT 20`
    ),
    recent_gifts: db.all(
      `SELECT ug.*, u.username, u.display_name FROM user_gifts ug
       JOIN users u ON u.id = ug.user_id ORDER BY ug.id DESC LIMIT 20`
    )
  });
});

router.get('/users/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const user = db.get('SELECT id, username, display_name, role, email, is_banned FROM users WHERE username = ?', [
    username
  ]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const grants = {
    badges: db.all('SELECT * FROM user_badges WHERE user_id = ? ORDER BY id DESC', [user.id]),
    banners: db.all('SELECT * FROM user_banners WHERE user_id = ? ORDER BY id DESC', [user.id])
  };
  res.json({
    user,
    grants,
    profile: store.profileCosmetics(user.id, { self: true }),
    inventory: store.giftInventory(user.id)
  });
});

router.post('/grant/badge', (req, res) => {
  const user = findUser(req.body);
  if (!user) return res.status(404).json({ error: 'Пользователь с таким username не найден' });
  const badgeId = String((req.body && req.body.badge_id) || '');
  const badge = BADGE_MAP.get(badgeId);
  if (!badge) return res.status(400).json({ error: 'Значок не найден' });
  const months = grantMonths(req.body);
  const grant = store.grantBadge(user.id, badgeId, months, req.user.id);
  notify({
    userId: user.id,
    type: 'badge',
    text: `Владелец выдал вам значок «${badge.name}»${months ? ` на ${months} мес.` : ' навсегда'}`
  });
  adminLog(req, 'grant_badge', `user:${user.id}`, { meta: { badge: badgeId, months } });
  res.json({ ok: true, username: user.username, badge: badge.name, grant });
});

router.post('/grant/banner', (req, res) => {
  const user = findUser(req.body);
  if (!user) return res.status(404).json({ error: 'Пользователь с таким username не найден' });
  const bannerId = String((req.body && req.body.banner_id) || '');
  const banner = BANNER_MAP.get(bannerId);
  if (!banner) return res.status(400).json({ error: 'Баннер не найден' });
  const months = grantMonths(req.body);
  const grant = store.grantBanner(user.id, bannerId, months, req.user.id);
  notify({
    userId: user.id,
    type: 'banner',
    text: `Владелец выдал вам баннер «${banner.name}»${months ? ` на ${months} мес.` : ' навсегда'}`
  });
  adminLog(req, 'grant_banner', `user:${user.id}`, { meta: { banner: bannerId, months } });
  res.json({ ok: true, username: user.username, banner: banner.name, grant });
});

router.post('/grant/gift', (req, res) => {
  const user = findUser(req.body);
  if (!user) return res.status(404).json({ error: 'Пользователь с таким username не найден' });
  const giftId = String((req.body && req.body.gift_id) || '');
  const gift = GIFT_MAP.get(giftId);
  if (!gift) return res.status(400).json({ error: 'Подарок не найден' });
  const quantity = clamp(toInt(req.body && req.body.quantity, 1), 1, 100);
  const created = store.grantGift(user.id, giftId, quantity, req.user.id);
  notify({
    userId: user.id,
    type: 'gift',
    text: `Владелец подарил вам «${gift.name}»${created > 1 ? ` ×${created}` : ''}`
  });
  adminLog(req, 'grant_gift', `user:${user.id}`, { meta: { gift: giftId, quantity: created } });
  res.json({ ok: true, username: user.username, gift: gift.name, created });
});

router.post('/revoke/badge', (req, res) => {
  const user = findUser(req.body);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const badgeId = String((req.body && req.body.badge_id) || '');
  if (!BADGE_MAP.has(badgeId)) return res.status(400).json({ error: 'Значок не найден' });
  store.revokeBadge(user.id, badgeId);
  adminLog(req, 'revoke_badge', `user:${user.id}`, { meta: { badge: badgeId } });
  res.json({ ok: true });
});

router.post('/revoke/banner', (req, res) => {
  const user = findUser(req.body);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const bannerId = String((req.body && req.body.banner_id) || '');
  if (!BANNER_MAP.has(bannerId)) return res.status(400).json({ error: 'Баннер не найден' });
  store.revokeBanner(user.id, bannerId);
  adminLog(req, 'revoke_banner', `user:${user.id}`, { meta: { banner: bannerId } });
  res.json({ ok: true });
});

router.put('/gifts/:giftId', (req, res) => {
  const giftId = String(req.params.giftId || '');
  if (!GIFT_MAP.has(giftId)) return res.status(400).json({ error: 'Подарок не найден' });
  const rarity = req.body && req.body.rarity;
  const price = req.body && req.body.price;
  if (rarity !== undefined && !RARITIES[rarity]) {
    return res.status(400).json({ error: 'Неизвестная редкость' });
  }
  store.setGiftOverride(giftId, {
    rarity: rarity === undefined ? null : rarity,
    price: price === undefined ? null : price
  });
  adminLog(req, 'gift_override', `gift:${giftId}`, { meta: { rarity, price } });
  res.json({ ok: true, gift: fullCatalog(db.all('SELECT * FROM gift_overrides')).gifts.find((g) => g.id === giftId) });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  if (body.owner_telegram !== undefined) {
    const handle = cleaned(body.owner_telegram, 40).replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
    db.setSetting('owner_telegram', /^[a-z0-9_]{3,40}$/i.test(handle) ? handle : '');
  }
  for (const key of ['gifts_enabled', 'badges_enabled', 'banners_enabled']) {
    if (body[key] !== undefined) db.setSetting(key, body[key] ? '1' : '0');
  }
  adminLog(req, 'cosmetics_settings', 'site', { meta: body });
  res.json({
    ok: true,
    settings: {
      owner_telegram: db.getSetting('owner_telegram', ''),
      gifts_enabled: db.getSetting('gifts_enabled', '1') === '1',
      badges_enabled: db.getSetting('badges_enabled', '1') === '1',
      banners_enabled: db.getSetting('banners_enabled', '1') === '1'
    }
  });
});

module.exports = router;
