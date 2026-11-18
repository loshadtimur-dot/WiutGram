'use strict';

const { BANNERS } = require('./banners');
const { BADGES } = require('./badges');
const { GIFTS } = require('./gifts');

// Rarity palette. The same values drive the CSS class names on the client.
const RARITIES = {
  common: { id: 'common', label: 'Обычный', color: '#c9ccd4', price: 15000 },
  rare: { id: 'rare', label: 'Редкий', color: '#4aa3ff', price: 35000 },
  epic: { id: 'epic', label: 'Эпический', color: '#b06bff', price: 75000 },
  legendary: { id: 'legendary', label: 'Легендарный', color: '#f5c542', price: 150000 },
  admin: { id: 'admin', label: 'Админский', color: '#0a0a0f', price: 0 }
};

const BADGE_DEFAULT_PRICE = 20000;
const BADGE_YEAR_PRICE = 200000;
const BANNER_DEFAULT_PRICE = 20000;
const BANNER_YEAR_PRICE = 200000;

const BANNER_MAP = new Map(BANNERS.map((item) => [item.id, item]));
const BADGE_MAP = new Map(BADGES.map((item) => [item.id, item]));
const GIFT_MAP = new Map(GIFTS.map((item) => [item.id, item]));

function rarityOr(fallback, value) {
  return RARITIES[value] ? value : fallback;
}

// Applies owner overrides (rarity and price) to a gift definition.
function giftWithOverrides(gift, override) {
  const rarity = rarityOr(gift.rarity, override && override.rarity);
  const base = gift.rarity === 'admin' ? 0 : RARITIES[gift.rarity].price;
  const price = override && Number.isFinite(Number(override.price)) ? Number(override.price) : base;
  return {
    ...gift,
    rarity,
    rarity_label: RARITIES[rarity].label,
    rarity_color: RARITIES[rarity].color,
    price: gift.rarity === 'admin' ? 0 : price,
    purchasable: gift.rarity !== 'admin'
  };
}

function bannerView(banner, grant) {
  return {
    ...banner,
    price: banner.adminOnly ? 0 : BANNER_DEFAULT_PRICE,
    price_year: banner.adminOnly ? 0 : BANNER_YEAR_PRICE,
    owned: !!(grant && (grant.expires_at === null || grant.expires_at > new Date().toISOString())),
    expires_at: grant ? grant.expires_at : null,
    grant_id: grant ? grant.id : null
  };
}

function badgeView(badge, grant) {
  const active = grant && (grant.expires_at === null || grant.expires_at > new Date().toISOString());
  return {
    ...badge,
    price_month: BADGE_DEFAULT_PRICE,
    price_year: BADGE_YEAR_PRICE,
    owned: !!active,
    expires_at: grant ? grant.expires_at : null,
    grant_id: grant ? grant.id : null
  };
}

function fullCatalog(overrides = []) {
  const overrideMap = new Map(overrides.map((row) => [row.gift_id, row]));
  return {
    rarities: RARITIES,
    banners: BANNERS.map((item) => ({ ...item })),
    badges: BADGES.map((item) => ({ ...item })),
    gifts: GIFTS.map((item) => giftWithOverrides(item, overrideMap.get(item.id)))
  };
}

function publicCatalog(overrides = []) {
  const catalog = fullCatalog(overrides);
  return {
    rarities: catalog.rarities,
    banners: catalog.banners.map(({ adminOnly, ...rest }) => ({
      ...rest,
      admin_only: !!adminOnly
    })),
    badges: catalog.badges,
    gifts: catalog.gifts.map(({ svg, ...meta }) => meta)
  };
}

module.exports = {
  RARITIES,
  BANNERS,
  BADGES,
  GIFTS,
  BANNER_MAP,
  BADGE_MAP,
  GIFT_MAP,
  BADGE_DEFAULT_PRICE,
  BADGE_YEAR_PRICE,
  BANNER_DEFAULT_PRICE,
  BANNER_YEAR_PRICE,
  giftWithOverrides,
  bannerView,
  badgeView,
  fullCatalog,
  publicCatalog
};
