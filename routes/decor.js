'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { toInt, cleaned } = require('../middleware/validate');
const decor = require('../lib/decor/service');
const shop = require('../lib/shop/service');
const { GLASS, GLASS_PACKS } = require('../lib/design/glass');
const { notify } = require('../lib/notify');

const router = express.Router();
// Scoped auth so mounting on /api does not guard unrelated endpoints.
for (const prefix of ['/decor', '/gifts', '/emoji']) router.use(prefix, requireAuth);

function packsPayload(userId) {
  const ownedItems = shop.ownedItemIds(userId);
  return GLASS_PACKS.map((pack) => {
    const item = db.get('SELECT id FROM shop_items WHERE kind = ? AND asset_key = ?', [
      'emoji_pack',
      `emoji:${pack.id}`
    ]);
    return {
      id: pack.id,
      title: pack.title,
      description: pack.description,
      price: pack.price,
      rarity: pack.rarity,
      free: !!pack.free,
      item_id: item ? item.id : null,
      owned: !!pack.free || (item ? ownedItems.has(item.id) : false),
      items: GLASS.filter((glass) => glass.pack === pack.id).map((glass) => ({
        id: glass.id,
        name: glass.name,
        pack: glass.pack
      }))
    };
  });
}

router.get('/decor/me', (req, res) => {
  const decorState = decor.decorFor(req.user.id, req.user.id);
  res.json({
    decor: decorState,
    banners: decor.ownedItemsOfKind(req.user.id, 'banner').map((item) => decor.bannerView(item, req.user.id)),
    backgrounds: decor
      .ownedItemsOfKind(req.user.id, 'background')
      .map((item) => decor.backgroundView(item, req.user.id)),
    packs: packsPayload(req.user.id),
    durations: decor.STATUS_DURATIONS,
    gifts: decor.giftsFor(req.user.id, req.user),
    stats: decor.giftStats(req.user.id),
    custom_banner: {
      enabled: db.getSetting('shop_allow_custom_banner', '1') === '1',
      path: decorState.custom_banner_path
    },
    settings: shop.purchaseSettings()
  });
});

router.get('/decor/users/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const target = db.get('SELECT id, role, is_banned FROM users WHERE username = ?', [username]);
  if (!target || target.is_banned) return res.status(404).json({ error: 'Профиль не найден' });
  const gifts = decor.giftsFor(target.id, req.user);
  return res.json({
    decor: decor.decorFor(target.id, req.user.id),
    is_self: target.id === req.user.id,
    gifts_count: gifts.length,
    gifts: gifts.slice(0, 24)
  });
});

router.post('/decor/banner', (req, res) => {
  const result = decor.applyBanner(req.user.id, toInt(req.body && req.body.item_id, 0) || null);
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  return res.json(result);
});

router.post('/decor/background', (req, res) => {
  const result = decor.applyBackground(req.user.id, toInt(req.body && req.body.item_id, 0) || null);
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  return res.json(result);
});

router.post('/decor/status', (req, res) => {
  const body = req.body || {};
  const result = decor.setStatus(req.user.id, {
    emoji: body.emoji ? String(body.emoji).slice(0, 40) : null,
    text: cleaned(body.text, 60),
    duration: String(body.duration || 'never')
  });
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  return res.json(result);
});

router.post('/decor/custom-banner', (req, res) => {
  if (db.getSetting('shop_allow_custom_banner', '1') !== '1') {
    return res.status(403).json({ error: 'Свои баннеры отключены' });
  }
  const item = db.get("SELECT id FROM shop_items WHERE slug = 'banner-custom'");
  const owned = item
    ? db.get('SELECT id FROM user_items WHERE user_id = ? AND item_id = ?', [req.user.id, item.id])
    : null;
  if (!owned && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Свой баннер нужно купить у владельца' });
  }
  const path = cleaned(req.body && req.body.image_path, 300);
  if (path && !path.startsWith('/uploads/')) return res.status(400).json({ error: 'Некорректное изображение' });
  db.run('UPDATE profile_decor SET custom_banner_path = ?, updated_at = ? WHERE user_id = ?', [
    path || null,
    new Date().toISOString(),
    req.user.id
  ]);
  return res.json({ ok: true, path: path || null });
});

/* ---------- Gifts ---------- */

router.get('/gifts/mine', (req, res) => {
  res.json({
    gifts: decor.giftsFor(req.user.id, req.user),
    stats: decor.giftStats(req.user.id),
    privacy: db.getSetting('gift_privacy_' + req.user.id, 'all')
  });
});

router.get('/gifts/:id', (req, res) => {
  const gift = decor.giftById(toInt(req.params.id, 0), req.user);
  if (!gift) return res.status(404).json({ error: 'Подарок не найден' });
  return res.json({ gift });
});

router.post('/gifts/:id/pin', (req, res) => {
  const result = decor.togglePin(req.user.id, toInt(req.params.id, 0), !!(req.body && req.body.pinned));
  if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
  return res.json(result);
});

router.post('/gifts/:id/hide', (req, res) => {
  const result = decor.setHidden(req.user.id, toInt(req.params.id, 0), !!(req.body && req.body.hidden));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

router.post('/gifts/:id/regift', (req, res) => {
  const result = decor.regift(req.user.id, toInt(req.params.id, 0), cleaned(req.body && req.body.username, 24));
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  notify({ userId: req.user.id, type: 'gift', text: 'Подарок переподарён' });
  return res.json(result);
});

router.get('/emoji/packs', (req, res) => {
  res.json({ packs: packsPayload(req.user.id) });
});

module.exports = router;
