'use strict';

// Ten collectible profile badges. The artwork is inline SVG so it keeps its
// detail at any size and never needs an image request.
const BADGE_ART = [
  {
    id: 'dragon',
    name: 'Дракон',
    description: 'Огненный страж профиля',
    rarity: 'legendary',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Дракон" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bdg-dr-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#f0a02a"/><stop offset="1" stop-color="#b8460f"/></linearGradient>
        <linearGradient id="bdg-dr-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a1b0c"/><stop offset="1" stop-color="#2c0703"/></linearGradient>
      </defs>
      <path d="M32 3c6 8 17 10 25 14-7 2-10 6-11 12 8 6 12 16 8 26-5-5-10-6-15-4-4 2-6 6-7 11-2-6-5-9-10-10-6-1-11 1-15 5-4-11 0-20 8-27-2-6-5-10-12-12C12 14 26 12 32 3Z" fill="url(#bdg-dr-b)"/>
      <path d="M32 13c3 5 8 8 13 11-4 1-6 4-7 8 5 4 7 10 5 16-3-3-6-4-9-3-2 1-3 4-4 8-1-4-3-6-6-6-3 0-6 1-9 3-2-6 1-12 6-16-1-4-3-7-7-8 5-3 13-6 18-13Z" fill="url(#bdg-dr-a)"/>
      <path d="M22 28l5 3M42 28l-5 3" stroke="#2c0703" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="25" cy="34" r="2" fill="#2c0703"/><circle cx="39" cy="34" r="2" fill="#2c0703"/>
      <path d="M28 41c2 2 6 2 8 0" stroke="#5a1508" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M18 47c-2 3-5 4-8 4M46 47c2 3 5 4 8 4" stroke="#f0a02a" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'black_spider',
    name: 'Чёрный паук',
    description: 'Редкий ночной охотник',
    rarity: 'epic',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Чёрный паук" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bdg-sp-a" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#4a4a58"/><stop offset=".6" stop-color="#17171f"/><stop offset="1" stop-color="#050507"/></radialGradient>
      </defs>
      <g stroke="#0a0a0f" stroke-width="3" fill="none" stroke-linecap="round">
        <path d="M24 30C16 24 10 22 5 23M24 36c-8 0-14 3-18 8M25 42c-6 4-10 9-11 15M40 30c8-6 14-8 19-7M40 36c8 0 14 3 18 8M39 42c6 4 10 9 11 15"/>
      </g>
      <g stroke="#8a8a9c" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8">
        <path d="M24 30C16 24 10 22 5 23M24 36c-8 0-14 3-18 8M25 42c-6 4-10 9-11 15M40 30c8-6 14-8 19-7M40 36c8 0 14 3 18 8M39 42c6 4 10 9 11 15"/>
      </g>
      <ellipse cx="32" cy="40" rx="13" ry="15" fill="url(#bdg-sp-a)"/>
      <ellipse cx="32" cy="26" rx="9" ry="8" fill="url(#bdg-sp-a)"/>
      <path d="M28 40l8 0M32 36l0 10" stroke="#e04b4b" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="28" cy="25" r="1.7" fill="#ff5555"/><circle cx="36" cy="25" r="1.7" fill="#ff5555"/>
      <circle cx="24" cy="21" r="1" fill="#ffb3b3"/><circle cx="40" cy="21" r="1" fill="#ffb3b3"/>
      <path d="M27 17c3-5 7-5 10 0" stroke="#9a9aae" stroke-width="1.5" fill="none"/>
    </svg>`
  },
  {
    id: 'wolf',
    name: 'Волк',
    description: 'Верность и сила стаи',
    rarity: 'rare',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Волк" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bdg-wf-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d4e2"/><stop offset="1" stop-color="#4d5b70"/></linearGradient></defs>
      <path d="M14 10l12 9h12l12-9-3 17c5 8 4 19-3 25-6 5-15 5-21 0-7-6-8-17-3-25L14 10Z" fill="url(#bdg-wf-a)"/>
      <path d="M21 22l7 5-7 3 5 9 6 4 6-4 5-9-7-3 7-5-6-6-5 2-5-2-6 6Z" fill="#eef3f9" opacity=".55"/>
      <path d="M24 33l4 2M40 33l-4 2" stroke="#1b2330" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="26" cy="38" r="2.1" fill="#1b2330"/><circle cx="38" cy="38" r="2.1" fill="#1b2330"/>
      <path d="M29 46l3-2 3 2-3 3-3-3Z" fill="#1b2330"/>
      <path d="M32 49v4M28 53c1.5 0 3-.6 4-1.6 1 1 2.5 1.6 4 1.6" stroke="#1b2330" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'phoenix',
    name: 'Феникс',
    description: 'Возрождение из пепла',
    rarity: 'legendary',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Феникс" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bdg-ph-a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#b8110b"/><stop offset=".55" stop-color="#ff6a00"/><stop offset="1" stop-color="#ffe066"/></linearGradient>
      </defs>
      <path d="M32 6c2 8-2 11-7 14C13 27 8 40 12 52c3 8 11 8 16 4-3-3-4-7-2-11 3 5 7 7 10 6-2-5-1-9 2-13 1 5 4 9 8 11-1-5 1-8 4-11 3 4 5 8 4 13 5-3 7-8 6-13 4 4 5 9 3 14 7-2 11-10 9-18-2-10-10-17-18-20-5-2-8-5-7-12Z" fill="url(#bdg-ph-a)"/>
      <path d="M32 24c2 6 8 9 8 16 0 5-4 9-8 11-4-2-8-6-8-11 0-7 6-10 8-16Z" fill="#fff3c4" opacity=".9"/>
      <circle cx="32" cy="38" r="2" fill="#b8110b"/>
    </svg>`
  },
  {
    id: 'tiger',
    name: 'Тигр',
    description: 'Смелость и характер',
    rarity: 'rare',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Тигр" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bdg-tg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#c25e0a"/></linearGradient></defs>
      <path d="M13 12l11 7h16l11-7-2 16c4 8 2 18-5 24-6 5-18 5-24 0-7-6-9-16-5-24l-2-16Z" fill="url(#bdg-tg-a)"/>
      <path d="M22 20l5 3M42 20l-5 3M18 30l7 2M46 30l-7 2M32 24v6" stroke="#3a1c05" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M24 33c2-3 6-3 8 0M40 33c-2-3-6-3-8 0" stroke="#3a1c05" stroke-width="2" fill="none"/>
      <circle cx="26" cy="35" r="2.3" fill="#241000"/><circle cx="38" cy="35" r="2.3" fill="#241000"/>
      <path d="M29 45h6l-3 3-3-3Z" fill="#3a1c05"/>
      <path d="M32 48v3M26 49c1 2 3 3 6 3M38 49c-1 2-3 3-6 3" stroke="#3a1c05" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M19 42l4 4M45 42l-4 4" stroke="#fbe3c2" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    </svg>`
  },
  {
    id: 'serpent',
    name: 'Змей',
    description: 'Мудрость и хладнокровие',
    rarity: 'epic',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Змей" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bdg-sr-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7de3a4"/><stop offset=".6" stop-color="#159c5c"/><stop offset="1" stop-color="#0a4d2c"/></linearGradient></defs>
      <path d="M44 8c-10 2-15 9-13 16 2 8 12 9 13 17 1 7-6 10-12 8-6-1-10-6-10-11 0-4 3-7 7-7 3 0 5 2 5 5 0 2-2 3-4 3-1 0-2-1-2-2" stroke="url(#bdg-sr-a)" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M42 12c3 1 5 3 6 6-3 2-7 2-10 0 1-3 2-5 4-6Z" fill="#0a4d2c"/>
      <circle cx="45" cy="15" r="1.6" fill="#ffe066"/>
      <path d="M47 20l4 2-4 1" fill="#d62828"/>
      <path d="M20 44c-4 4-4 9-1 12 2 2 6 3 9 1" stroke="#0a4d2c" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'raven',
    name: 'Ворон',
    description: 'Загадка и наблюдательность',
    rarity: 'rare',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Ворон" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bdg-rv-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a5f78"/><stop offset=".5" stop-color="#1c1e2b"/><stop offset="1" stop-color="#05060a"/></linearGradient></defs>
      <path d="M20 52c-5-8-4-18 3-24 5-4 11-5 16-2l9-5-3 9c4 4 5 10 2 15-3 6-9 9-16 9h-11Z" fill="url(#bdg-rv-a)"/>
      <path d="M45 20c5 3 9 9 10 16-4-4-8-6-12-6 2-3 3-7 2-10Z" fill="#2b2e40"/>
      <path d="M38 27l10 1-9 4" fill="#8c8fa6"/>
      <circle cx="40" cy="25" r="1.8" fill="#7fd4ff"/>
      <path d="M24 46c4-2 9-3 14-2" stroke="#6f7590" stroke-width="1.5" fill="none" opacity=".7"/>
    </svg>`
  },
  {
    id: 'scorpion',
    name: 'Скорпион',
    description: 'Опасная точность',
    rarity: 'epic',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Скорпион" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bdg-sc-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcf6b"/><stop offset=".55" stop-color="#c98513"/><stop offset="1" stop-color="#6b3a06"/></linearGradient></defs>
      <path d="M26 40c-8 3-14 0-17-6 5 1 9 0 12-3M38 40c8 3 14 0 17-6-5 1-9 0-12-3" stroke="url(#bdg-sc-a)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M24 45l-9 8M40 45l9 8M26 50l-6 9M38 50l6 9" stroke="url(#bdg-sc-a)" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M32 20c07 0 11 6 10 13-1 7-5 10-10 12-5-2-9-5-10-12-1-7 3-13 10-13Z" fill="url(#bdg-sc-a)"/>
      <path d="M42 24c6-8 14-8 16-3 1 4-3 7-7 5" stroke="#d9a441" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <path d="M57 26l3 4-5 1" fill="#f5d98a"/>
      <path d="M29 30l4 2M35 30l-4 2" stroke="#3d2204" stroke-width="2" stroke-linecap="round"/>
      <path d="M32 48v4" stroke="#3d2204" stroke-width="3" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'lion',
    name: 'Лев',
    description: 'Король арены',
    rarity: 'rare',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Лев" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bdg-ln-a" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#ffcf6b"/><stop offset="1" stop-color="#b56a0b"/></radialGradient>
        <radialGradient id="bdg-ln-b" cx=".5" cy=".4" r=".55"><stop offset="0" stop-color="#f7c07a"/><stop offset="1" stop-color="#a75a12"/></radialGradient>
      </defs>
      <g fill="url(#bdg-ln-a)">
        <circle cx="32" cy="32" r="20"/>
        <circle cx="14" cy="22" r="7"/><circle cx="50" cy="22" r="7"/><circle cx="10" cy="38" r="6"/><circle cx="54" cy="38" r="6"/>
        <circle cx="18" cy="50" r="6"/><circle cx="46" cy="50" r="6"/><circle cx="32" cy="12" r="6"/><circle cx="32" cy="54" r="5"/>
      </g>
      <circle cx="32" cy="33" r="14" fill="url(#bdg-ln-b)"/>
      <path d="M24 30c2-3 5-3 7 0M40 30c-2-3-5-3-7 0" stroke="#4a2605" stroke-width="1.8" fill="none"/>
      <circle cx="26" cy="33" r="1.9" fill="#2b1500"/><circle cx="38" cy="33" r="1.9" fill="#2b1500"/>
      <path d="M29 42h6l-3 3-3-3Z" fill="#4a2605"/>
      <path d="M32 45v3M28 47c1 2 2.5 2.5 4 2.5M36 47c-1 2-2.5 2.5-4 2.5" stroke="#4a2605" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'crown',
    name: 'Корона',
    description: 'Высший статус сообщества',
    rarity: 'legendary',
    price_month: 20000,
    price_year: 200000,
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Корона" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bdg-cr-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#f2c14e"/><stop offset="1" stop-color="#a97213"/></linearGradient></defs>
      <path d="M10 22l11 9 11-17 11 17 11-9-4 26H14L10 22Z" fill="url(#bdg-cr-a)"/>
      <path d="M15 50h34l2 6H13l2-6Z" fill="#8a5c0d"/>
      <circle cx="21" cy="31" r="2.6" fill="#d62828"/><circle cx="32" cy="26" r="3" fill="#3f7bff"/><circle cx="43" cy="31" r="2.6" fill="#159c5c"/>
      <path d="M18 40h28" stroke="#fff6cf" stroke-width="2" opacity=".6"/>
      <path d="M32 10v4" stroke="#fff1b8" stroke-width="2" stroke-linecap="round"/>
    </svg>`
  }
];

// Accent colour per badge, used by the shared medal frame so all ten collectibles
// read as one premium set at 20 px as well as at 72 px.
const ACCENTS = {
  dragon: '#f0a02a',
  black_spider: '#8c8ca6',
  wolf: '#9fb2cc',
  phoenix: '#ff7a1a',
  tiger: '#ffb347',
  serpent: '#25c47a',
  raven: '#6f7590',
  scorpion: '#d9a441',
  lion: '#e5a52a',
  crown: '#f2c14e'
};

function medalize(badge) {
  const accent = ACCENTS[badge.id] || '#f2c14e';
  const inner = badge.svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  return `<svg viewBox="0 0 64 64" role="img" aria-label="${badge.name}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bm-${badge.id}" cx="0.5" cy="0.34" r="0.72">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
          <stop offset="0.48" stop-color="${accent}" stop-opacity="0.2"/>
          <stop offset="1" stop-color="#05060a" stop-opacity="0.42"/>
        </radialGradient>
        <linearGradient id="br-${badge.id}" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="0.34" stop-color="${accent}" stop-opacity="0.85"/>
          <stop offset="0.66" stop-color="#000000" stop-opacity="0.28"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0.6"/>
        </linearGradient>
        <filter id="bg-${badge.id}" x="-40%" y="-40%" width="180%" height="185%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="${accent}" flood-opacity="0.45"/>
        </filter>
      </defs>
      <g filter="url(#bg-${badge.id})">
        <circle cx="32" cy="32" r="30" fill="url(#bm-${badge.id})"/>
        <circle cx="32" cy="32" r="29.1" fill="none" stroke="url(#br-${badge.id})" stroke-width="2.4"/>
        <circle cx="32" cy="32" r="25.4" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="0.9"/>
      </g>
      ${inner}
      <ellipse cx="22" cy="14" rx="13" ry="6.5" fill="#ffffff" opacity="0.18" transform="rotate(-26 22 14)"/>
    </svg>`;
}

const BADGES = BADGE_ART.map((badge) => ({ ...badge, svg: medalize(badge) }));

module.exports = { BADGES };
