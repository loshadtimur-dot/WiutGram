'use strict';

const express = require('express');
const { GIFTS, giftArt } = require('../../lib/design/gifts');
const { GLASS, GLASS_PACKS } = require('../../lib/design/glass');
const { BANNERS, BACKGROUNDS } = require('../../lib/design/themes');

const router = express.Router();

// Everything the visual QA page needs in one payload.
router.get('/assets', (req, res) => {
  res.json({
    gifts: GIFTS.map((gift) => ({
      id: gift.id,
      name: gift.name,
      rarity: gift.rarity,
      tags: gift.tags || [],
      svg: giftArt(gift.id)
    })),
    glass: GLASS.map((item) => ({ id: item.id, name: item.name, pack: item.pack })),
    packs: GLASS_PACKS.map((pack) => ({
      id: pack.id,
      title: pack.title,
      price: pack.price,
      free: !!pack.free,
      items: pack.items
    })),
    banners: BANNERS,
    backgrounds: BACKGROUNDS
  });
});

module.exports = router;
