'use strict';

const { GIFTS, giftArt } = require('./gifts');
const { GLASS, GLASS_PACKS } = require('./glass');
const { BANNERS, BACKGROUNDS } = require('./themes');

const RARITY_RANK = { common: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_LABEL = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
  admin: 'Админский'
};

// Uniform catalogue rows for the shop, the admin panel and the design preview.
function shopSeed() {
  const rows = [];
  let order = 0;

  for (const gift of GIFTS) {
    order += 10;
    const ownerOnly = gift.rarity === 'admin';
    const limited = (gift.tags || []).includes('limited');
    rows.push({
      kind: 'gift',
      slug: `gift-${gift.id}`,
      title: gift.name,
      description: `${RARITY_LABEL[gift.rarity]} подарок`,
      price: gift.price,
      asset_key: `gift-${gift.id}`,
      rarity: gift.rarity === 'admin' ? 'legendary' : gift.rarity,
      edition_limit: limited ? 500 : null,
      is_owner_only: ownerOnly ? 1 : 0,
      tags: JSON.stringify(gift.tags || []),
      sort_order: order
    });
  }

  for (const [index, banner] of BANNERS.entries()) {
    rows.push({
      kind: 'banner',
      slug: banner.slug,
      title: banner.name,
      description: banner.description,
      price: banner.price,
      asset_key: `banner:${banner.id}`,
      rarity: banner.rarity,
      is_owner_only: banner.ownerOnly ? 1 : 0,
      tags: JSON.stringify([banner.pattern]),
      sort_order: 1000 + index * 10
    });
  }

  for (const [index, background] of BACKGROUNDS.entries()) {
    rows.push({
      kind: 'background',
      slug: background.slug,
      title: background.name,
      description: background.description,
      price: background.price,
      asset_key: `bg:${background.id}`,
      rarity: background.rarity,
      is_active: background.hideInShop ? 0 : 1,
      is_owner_only: background.ownerOnly ? 1 : 0,
      tags: JSON.stringify([background.pattern]),
      sort_order: 2000 + index * 10
    });
  }

  for (const [index, pack] of GLASS_PACKS.entries()) {
    rows.push({
      kind: 'emoji_pack',
      slug: pack.slug,
      title: pack.title,
      description: pack.description,
      price: pack.price,
      asset_key: `emoji:${pack.id}`,
      rarity: pack.rarity,
      is_owner_only: 0,
      tags: JSON.stringify(pack.items),
      sort_order: 3000 + index * 10
    });
  }

  return rows;
}

module.exports = {
  RARITY_RANK,
  RARITY_LABEL,
  shopSeed,
  GIFTS,
  GLASS,
  GLASS_PACKS,
  BANNERS,
  BACKGROUNDS,
  giftArt
};
