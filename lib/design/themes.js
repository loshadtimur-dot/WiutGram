'use strict';

// Profile banners and backgrounds share one visual language: a soft gradient,
// a low-contrast SVG-ish pattern rendered by CSS, and a readable surface on top.
// Every theme is a stack of three layers: coloured light from the top corner, a
// tinted counter-light at the bottom, and the base gradient. This reads as depth
// instead of a flat two-stop ramp, which is what made the first set look cheap.

function depth(base, glow, glowAt = '12% 0%', counterAt = '88% 100%') {
  return `radial-gradient(120% 110% at ${glowAt}, ${glow} 0%, transparent 58%), ` +
    `radial-gradient(90% 90% at ${counterAt}, rgba(255,255,255,0.10) 0%, transparent 62%), ` +
    base;
}

const BANNERS = [
  {
    id: 'wiut_night', slug: 'banner-wiut-night', name: 'WIUT Night', description: 'Ночной кампус и огни Ташкента',
    theme: depth('linear-gradient(120deg, #0b1224 0%, #16284d 45%, #2b4a8b 100%)', 'rgba(138,180,255,0.34)'), accent: '#8ab4ff', pattern: 'stars', price: 0, rarity: 'common'
  },
  {
    id: 'pink_aurora', slug: 'banner-pink-aurora', name: 'Pink Aurora', description: 'Мягкое северное сияние',
    theme: depth('linear-gradient(130deg, #2a0b2e 0%, #7a1355 50%, #ff5fa2 100%)', 'rgba(255,95,162,0.36)'), accent: '#ffd0e6', pattern: 'aurora', price: 25000, rarity: 'rare'
  },
  {
    id: 'black_gold', slug: 'banner-black-gold', name: 'Black & Gold', description: 'Строгий чёрный с золотом',
    theme: depth('linear-gradient(135deg, #09090b 0%, #1c1608 55%, #40320c 100%)', 'rgba(245,200,92,0.3)'), accent: '#f5c85c', pattern: 'lines', price: 35000, rarity: 'rare'
  },
  {
    id: 'ocean', slug: 'banner-ocean', name: 'Deep Ocean', description: 'Глубина и спокойствие',
    theme: depth('linear-gradient(140deg, #041b2d 0%, #0a4f6e 55%, #13a4b8 100%)', 'rgba(168,240,255,0.32)'), accent: '#a8f0ff', pattern: 'waves', price: 25000, rarity: 'rare'
  },
  {
    id: 'sunset', slug: 'banner-sunset', name: 'Tashkent Sunset', description: 'Тёплый закат над городом',
    theme: depth('linear-gradient(120deg, #2b0a2e 0%, #a1246b 45%, #ff9d4d 100%)', 'rgba(255,157,77,0.4)'), accent: '#ffe0b8', pattern: 'sun', price: 35000, rarity: 'rare'
  },
  {
    id: 'emerald', slug: 'banner-emerald', name: 'Emerald', description: 'Изумрудный градиент',
    theme: depth('linear-gradient(140deg, #032018 0%, #0a5f45 55%, #2bd39a 100%)', 'rgba(43,211,154,0.34)'), accent: '#ccffe9', pattern: 'grid', price: 25000, rarity: 'common'
  },
  {
    id: 'violet_dream', slug: 'banner-violet-dream', name: 'Violet Dream', description: 'Фиолетовая дымка',
    theme: depth('linear-gradient(130deg, #1a0b33 0%, #4b1d8f 55%, #a06bff 100%)', 'rgba(160,107,255,0.38)'), accent: '#e6d6ff', pattern: 'bokeh', price: 35000, rarity: 'epic'
  },
  {
    id: 'monochrome', slug: 'banner-monochrome', name: 'Monochrome', description: 'Минимализм в серых тонах',
    theme: depth('linear-gradient(135deg, #101114 0%, #2a2d33 55%, #565b63 100%)', 'rgba(242,243,245,0.2)'), accent: '#f2f3f5', pattern: 'lines', price: 0, rarity: 'common'
  },
  {
    id: 'cherry', slug: 'banner-cherry', name: 'Cherry Blossom', description: 'Нежные лепестки',
    theme: depth('linear-gradient(130deg, #3d0b1f 0%, #a62b56 55%, #ffb3c7 100%)', 'rgba(255,179,199,0.4)'), accent: '#fff0f4', pattern: 'petals', price: 35000, rarity: 'epic'
  },
  {
    id: 'cyber', slug: 'banner-cyber', name: 'Cyber Grid', description: 'Неон и цифровая сетка',
    theme: depth('linear-gradient(135deg, #05010f 0%, #1a0640 50%, #05c8ff 100%)', 'rgba(5,200,255,0.36)'), accent: '#9df6ff', pattern: 'grid', price: 45000, rarity: 'epic'
  },
  {
    id: 'sand', slug: 'banner-sand', name: 'Desert Sand', description: 'Тёплые пески и дюны',
    theme: depth('linear-gradient(135deg, #3a2410 0%, #a97840 55%, #f0cfa0 100%)', 'rgba(240,207,160,0.38)'), accent: '#fff3dd', pattern: 'waves', price: 25000, rarity: 'rare'
  },
  {
    id: 'tashkent_silhouette', slug: 'banner-tashkent', name: 'Tashkent Skyline', description: 'Силуэт города на рассвете',
    theme: depth('linear-gradient(160deg, #1b1030 0%, #6d2b57 48%, #f0a04b 100%)', 'rgba(240,160,75,0.42)', '18% 0%', '80% 96%'), accent: '#ffe7c2', pattern: 'city', price: 45000, rarity: 'epic'
  },
  {
    id: 'admin_obsidian', slug: 'banner-obsidian', name: 'Obsidian', description: 'Закрытый баннер владельца',
    theme: depth('linear-gradient(135deg, #000000 0%, #0d0d12 50%, #1d1d27 100%)', 'rgba(244,213,138,0.24)'), accent: '#f4d58a', pattern: 'stars', price: 0, rarity: 'legendary', ownerOnly: true
  }
];

const BACKGROUNDS = [
  {
    id: 'hearts', slug: 'bg-hearts', name: 'Сердечки', description: 'Розовый фон с сердечками',
    theme: depth('radial-gradient(120% 90% at 12% 0%, #ffe4ec 0%, #ffc2d4 42%, #f79ab6 100%)', 'rgba(255,255,255,0.62)'),
    accent: '#c94470', pattern: 'hearts', ink: '#fff5f8', price: 30000, rarity: 'common'
  },
  {
    id: 'icecream_bg', slug: 'bg-icecream', name: 'Мороженое', description: 'Персиково-кремовый с рожками',
    theme: depth('radial-gradient(120% 90% at 85% 0%, #fff3df 0%, #ffd9b8 46%, #ffbb9a 100%)', 'rgba(255,255,255,0.6)', '78% 0%'),
    accent: '#c96a3c', pattern: 'icecream', ink: '#fff9f0', price: 30000, rarity: 'common'
  },
  {
    id: 'ocean_bg', slug: 'bg-ocean', name: 'Океан', description: 'Синий с волнами и пузырьками',
    theme: depth('radial-gradient(120% 90% at 20% 0%, #d7f2ff 0%, #8ed4f2 45%, #4aa6d6 100%)', 'rgba(255,255,255,0.55)'),
    accent: '#14587f', pattern: 'bubbles', ink: '#f2fbff', price: 40000, rarity: 'rare'
  },
  {
    id: 'mint_bg', slug: 'bg-mint', name: 'Мята', description: 'Зелёный с листьями',
    theme: depth('radial-gradient(120% 90% at 80% 0%, #e8fff3 0%, #b6f0d0 46%, #7ad4a8 100%)', 'rgba(255,255,255,0.58)', '80% 0%'),
    accent: '#1f7a56', pattern: 'leaves', ink: '#f4fff9', price: 40000, rarity: 'rare'
  },
  {
    id: 'sunset_bg', slug: 'bg-sunset', name: 'Закат', description: 'Оранжево-фиолетовый с облаками',
    theme: depth('radial-gradient(120% 100% at 25% 0%, #ffe3d0 0%, #ff9f7a 35%, #b077d6 74%, #6e57b8 100%)', 'rgba(255,255,255,0.42)'),
    accent: '#7a3f9e', pattern: 'clouds', ink: '#fff4f8', price: 50000, rarity: 'epic'
  },
  {
    id: 'owner_cosmos', slug: 'bg-owner-cosmos', name: 'Космос владельца', description: 'Чёрный фон только со звёздами',
    theme: depth('radial-gradient(130% 90% at 50% 0%, #0a0a12 0%, #000000 62%, #000000 100%)', 'rgba(244,213,138,0.2)', '50% 0%', '50% 100%'),
    accent: '#f4d58a', pattern: 'cosmos', ink: '#ffffff', price: 0, rarity: 'legendary', ownerOnly: true, hideInShop: true
  }
];

const BANNER_BY_ID = new Map(BANNERS.map((item) => [item.id, item]));
const BACKGROUND_BY_ID = new Map(BACKGROUNDS.map((item) => [item.id, item]));

function bannerView(item, owned = false, equipped = false) {
  return { ...item, owned, equipped };
}

function backgroundView(item, owned = false, equipped = false) {
  return { ...item, owned, equipped };
}

module.exports = {
  BANNERS,
  BACKGROUNDS,
  BANNER_BY_ID,
  BACKGROUND_BY_ID,
  bannerView,
  backgroundView
};
