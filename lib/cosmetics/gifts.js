'use strict';

// Twenty collectible gifts: 10 common, 4 rare, 3 epic, 2 legendary and one
// owner-only gift. Artwork is inline SVG and the card background comes from
// the rarity, so every gift looks distinct without extra image files.
const GIFTS = [
  /* ---------- Common ---------- */
  {
    id: 'teddy',
    name: 'Мишка Тедди',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Мишка Тедди" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-teddy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98b58"/><stop offset="1" stop-color="#8a5326"/></linearGradient></defs>
      <circle cx="18" cy="16" r="8" fill="#a96b38"/><circle cx="46" cy="16" r="8" fill="#a96b38"/>
      <circle cx="18" cy="16" r="4.5" fill="#e0b288"/><circle cx="46" cy="16" r="4.5" fill="#e0b288"/>
      <circle cx="32" cy="32" r="19" fill="url(#g-teddy)"/>
      <ellipse cx="32" cy="39" rx="10" ry="8" fill="#e8c49c"/>
      <circle cx="26" cy="28" r="2.4" fill="#2d1b10"/><circle cx="38" cy="28" r="2.4" fill="#2d1b10"/>
      <ellipse cx="32" cy="35" rx="3.4" ry="2.6" fill="#3a2415"/>
      <path d="M32 38v3M28 42c1.4 1.6 2.6 2 4 2s2.6-.4 4-2" stroke="#3a2415" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M22 50c2 3 6 4 10 4s8-1 10-4" stroke="#7a451c" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M25 46l7 4 7-4" stroke="#d62828" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="32" cy="51" r="2" fill="#d62828"/>
    </svg>`
  },
  {
    id: 'rose',
    name: 'Красная роза',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Красная роза" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="g-rose" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ff7a8a"/><stop offset=".6" stop-color="#d81b3c"/><stop offset="1" stop-color="#7d0b20"/></radialGradient></defs>
      <path d="M32 30c0 12-3 20-8 26" stroke="#2e7d32" stroke-width="3.6" fill="none" stroke-linecap="round"/>
      <path d="M30 44c-6-3-10-1-12 4 6 2 10 0 12-4Z" fill="#3d9a43"/>
      <path d="M31 50c5-2 9 0 11 4-5 2-9 0-11-4Z" fill="#2e7d32"/>
      <g fill="url(#g-rose)">
        <circle cx="32" cy="22" r="15"/>
        <path d="M18 20c6-9 22-9 28 0-8-4-20-4-28 0Z" opacity=".55" fill="#ffd0d8"/>
      </g>
      <path d="M32 12c-6 1-11 6-11 11 0 3 2 5 4 5s4-2 4-4-2-4-4-3" fill="none" stroke="#7d0b20" stroke-width="2"/>
      <path d="M32 16c5 1 8 5 8 9 0 3-2 5-4 5s-3-1-3-3 1-3 3-3" fill="none" stroke="#9c1130" stroke-width="1.8"/>
      <path d="M27 27c3 3 7 3 10 0" stroke="#7d0b20" stroke-width="1.6" fill="none"/>
      <circle cx="24" cy="17" r="2" fill="#ffb3c0" opacity=".8"/>
    </svg>`
  },
  {
    id: 'coffee',
    name: 'Кофе с собой',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Кофе с собой" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-coffee" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5e6d3"/><stop offset="1" stop-color="#c8a27a"/></linearGradient></defs>
      <path d="M19 20h26l-3 32H22l-3-32Z" fill="url(#g-coffee)"/>
      <path d="M17 20h30v6H17z" fill="#5d4037"/>
      <path d="M23 12h18l2 8H21l2-8Z" fill="#8d6e63"/>
      <path d="M24 32h16l-1.4 16H25.4L24 32Z" fill="#6d4c41" opacity=".85"/>
      <path d="M27 36c2-2 4-2 5 0" stroke="#ffe0b2" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M34 14c-3-4 2-6 0-10M40 14c-3-4 2-6 0-10" stroke="#cfd8dc" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>
      <circle cx="32" cy="44" r="4" fill="#ffe0b2" opacity=".25"/>
    </svg>`
  },
  {
    id: 'heart',
    name: 'Сердце',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Сердце" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-heart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9db6"/><stop offset=".5" stop-color="#ff3d68"/><stop offset="1" stop-color="#b3002d"/></linearGradient></defs>
      <path d="M32 55C18 45 8 36 8 25c0-7 5-12 12-12 5 0 9 3 12 7 3-4 7-7 12-7 7 0 12 5 12 12 0 11-10 20-24 30Z" fill="url(#g-heart)"/>
      <path d="M18 20c-3 3-4 6-4 9 0 6 5 11 11 16" stroke="#ffd6e0" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
      <ellipse cx="21" cy="21" rx="5" ry="3.4" fill="#fff" opacity=".55" transform="rotate(-25 21 21)"/>
    </svg>`
  },
  {
    id: 'balloon',
    name: 'Воздушный шар',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Воздушный шар" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="g-ballon" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffc3d6"/><stop offset=".5" stop-color="#ff5c8a"/><stop offset="1" stop-color="#b3003f"/></radialGradient></defs>
      <ellipse cx="32" cy="24" rx="17" ry="20" fill="url(#g-ballon)"/>
      <path d="M28 44h8l-4 6-4-6Z" fill="#c2185b"/>
      <path d="M32 50c-5 4 5 8 0 12" stroke="#9e9e9e" stroke-width="1.6" fill="none"/>
      <ellipse cx="25" cy="16" rx="5" ry="7" fill="#fff" opacity=".35" transform="rotate(-20 25 16)"/>
      <circle cx="32" cy="24" r="16" fill="none" stroke="#fff" stroke-width="1" opacity=".25"/>
    </svg>`
  },
  {
    id: 'chocolate',
    name: 'Шоколад',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Шоколад" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-choco" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d5b3a"/><stop offset="1" stop-color="#4a2a16"/></linearGradient></defs>
      <g transform="rotate(-8 32 32)">
        <rect x="14" y="10" width="36" height="46" rx="4" fill="#5d3a22"/>
        <rect x="14" y="10" width="36" height="46" rx="4" fill="none" stroke="#3a2110" stroke-width="2"/>
        <g fill="url(#g-choco)">
          <rect x="17" y="13" width="14" height="12" rx="2"/><rect x="33" y="13" width="14" height="12" rx="2"/>
          <rect x="17" y="27" width="14" height="12" rx="2"/><rect x="33" y="27" width="14" height="12" rx="2"/>
          <rect x="17" y="41" width="14" height="12" rx="2"/><rect x="33" y="41" width="14" height="12" rx="2"/>
        </g>
        <path d="M36 20c2 1 3 3 2 5" stroke="#c49a6c" stroke-width="1.2" fill="none" opacity=".6"/>
        <path d="M50 14c4-5 9-5 12 0-3 6-8 7-12 4v-4Z" fill="#f5e6d3"/>
        <path d="M50 18c1 4 4 6 7 7" stroke="#d6c3a5" stroke-width="1.4" fill="none"/>
      </g>
    </svg>`
  },
  {
    id: 'book',
    name: 'Книга',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Книга" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-book" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5c6bc0"/><stop offset="1" stop-color="#283593"/></linearGradient></defs>
      <path d="M6 16c8-4 16-4 26 2v32c-10-6-18-6-26-2V16Z" fill="#e8eaf6"/>
      <path d="M58 16c-8-4-16-4-26 2v32c10-6 18-6 26-2V16Z" fill="#f5f6ff"/>
      <path d="M32 18v32" stroke="#c5cae9" stroke-width="2"/>
      <g stroke="#9fa8da" stroke-width="1.4" opacity=".8">
        <path d="M12 24c5-1 10 0 14 2M12 31c5-1 10 0 14 2M12 38c5-1 10 0 14 2"/>
        <path d="M52 24c-5-1-10 0-14 2M52 31c-5-1-10 0-14 2M52 38c-5-1-10 0-14 2"/>
      </g>
      <path d="M6 16c8-4 16-4 26 2 10-6 18-6 26-2v5c-8-4-16-4-26 2-10-6-18-6-26-2v-5Z" fill="url(#g-book)"/>
      <path d="M28 8h8v8l-4-3-4 3V8Z" fill="#ffca28"/>
    </svg>`
  },
  {
    id: 'star',
    name: 'Звезда',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Звезда" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-star" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff59d"/><stop offset=".5" stop-color="#ffd54f"/><stop offset="1" stop-color="#f57f17"/></linearGradient></defs>
      <path d="M32 6l7.4 16.6L56 24.4 43 36.6 46.6 54 32 45.2 17.4 54 21 36.6 8 24.4l16.6-1.8L32 6Z" fill="url(#g-star)"/>
      <path d="M32 13l5 11.4 12 1.3-9 8.5 2.6 12.4L32 41l-10.6 5.6L24 34.2l-9-8.5 12-1.3L32 13Z" fill="#fff9c4" opacity=".55"/>
      <circle cx="26" cy="22" r="2" fill="#fff" opacity=".8"/>
      <path d="M54 12l1.4 3.2L59 16l-3.6.8L54 20l-1.4-3.2L49 16l3.6-.8L54 12Z" fill="#fff59d"/>
    </svg>`
  },
  {
    id: 'cupcake',
    name: 'Капкейк',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Капкейк" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-cup" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1dc"/><stop offset="1" stop-color="#f06292"/></linearGradient>
        <linearGradient id="g-cup2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3e0"/><stop offset="1" stop-color="#ffcc80"/></linearGradient>
      </defs>
      <path d="M17 30h30l-4 26H21l-4-26Z" fill="url(#g-cup)"/>
      <path d="M21 34h22M20 40h24M22 46h20" stroke="#c2185b" stroke-width="1.3" opacity=".45"/>
      <path d="M14 28c2-8 8-6 9-12 2 4 5 4 9 4s7 0 9-4c1 6 7 4 9 12H14Z" fill="url(#g-cup2)"/>
      <path d="M20 22c1-4 4-6 7-5M37 17c3 0 5 2 6 5" stroke="#fff8e1" stroke-width="1.5" fill="none" opacity=".8"/>
      <circle cx="32" cy="10" r="5" fill="#e53935"/>
      <path d="M30 6c1-2 3-2 3-4" stroke="#2e7d32" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <circle cx="25" cy="14" r="1" fill="#fff"/><circle cx="40" cy="15" r="1" fill="#fff"/><circle cx="33" cy="20" r="1" fill="#fff"/>
    </svg>`
  },
  {
    id: 'letter',
    name: 'Письмо',
    rarity: 'common',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Письмо" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g-letter" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e1"/><stop offset="1" stop-color="#ffe0b2"/></linearGradient></defs>
      <rect x="7" y="16" width="50" height="34" rx="4" fill="url(#g-letter)" stroke="#d7b98c" stroke-width="2"/>
      <path d="M7 20l25 18 25-18" fill="none" stroke="#d7b98c" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M8 48l18-16M56 48L38 32" stroke="#e6d0ae" stroke-width="1.6"/>
      <path d="M32 40c-4-3-8-6-8-10 0-2 1.5-4 4-4 2 0 3 1 4 3 1-2 2-3 4-3 2.5 0 4 2 4 4 0 4-4 7-8 10Z" fill="#e53935"/>
      <path d="M20 12h24v6H20z" fill="#ffcdd2" opacity=".6"/>
    </svg>`
  },

  /* ---------- Rare ---------- */
  {
    id: 'bouquet',
    name: 'Букет цветов',
    rarity: 'rare',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Букет цветов" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-bq-wrap" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8e7d1"/><stop offset="1" stop-color="#d9b38c"/></linearGradient>
        <radialGradient id="g-bq-pink" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffd1e3"/><stop offset="1" stop-color="#e91e63"/></radialGradient>
        <radialGradient id="g-bq-gold" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff3b0"/><stop offset="1" stop-color="#f9a825"/></radialGradient>
        <radialGradient id="g-bq-lav" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e6dcff"/><stop offset="1" stop-color="#7e57c2"/></radialGradient>
      </defs>
      <path d="M32 30c0 14-2 22-4 28" stroke="#2e7d32" stroke-width="2.4" fill="none"/>
      <path d="M29 48c-4-3-8-2-10 2 4 2 8 1 10-2Zm6 0c4-3 8-2 10 2-4 2-8 1-10-2Z" fill="#43a047"/>
      <path d="M20 34h24l-3 24H23l-3-24Z" fill="url(#g-bq-wrap)"/>
      <path d="M22 36l22 4M40 36l-18 6" stroke="#c9a27a" stroke-width="1.2" opacity=".6"/>
      <g>
        <g transform="translate(22 22)"><circle r="8" fill="url(#g-bq-pink)"/><path d="M0-8c3 2 4 5 0 8-4-3-3-6 0-8Z" fill="#fff" opacity=".5"/><circle r="2.4" fill="#ad1457"/></g>
        <g transform="translate(42 24)"><circle r="7" fill="url(#g-bq-gold)"/><path d="M0-7c2 2 3 4 0 7-3-3-2-5 0-7Z" fill="#fff" opacity=".5"/><circle r="2" fill="#e65100"/></g>
        <g transform="translate(32 14)"><circle r="7.5" fill="url(#g-bq-lav)"/><path d="M0-7c2 2 3 4 0 7-3-3-2-5 0-7Z" fill="#fff" opacity=".5"/><circle r="2.2" fill="#4527a0"/></g>
      </g>
      <path d="M32 36l-4 20h8l-4-20Z" fill="#e91e63" opacity=".85"/>
      <path d="M28 40c3 3 5 3 8 0" stroke="#fff" stroke-width="1.2" fill="none" opacity=".6"/>
    </svg>`
  },
  {
    id: 'crystal_heart',
    name: 'Хрустальное сердце',
    rarity: 'rare',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Хрустальное сердце" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-crh-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8f6ff"/><stop offset=".45" stop-color="#68d8ff"/><stop offset="1" stop-color="#1a6fbf"/></linearGradient>
        <linearGradient id="g-crh-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9be7ff"/></linearGradient>
      </defs>
      <path d="M32 56C17 46 6 37 6 25c0-7 5-12 12-12 5 0 10 3 14 8 4-5 9-8 14-8 7 0 12 5 12 12 0 12-11 21-26 31Z" fill="url(#g-crh-a)" stroke="#e3f9ff" stroke-width="1"/>
      <path d="M32 56V21c-4-5-9-8-14-8-7 0-12 5-12 12 0 12 11 21 26 31Z" fill="#fff" opacity=".12"/>
      <path d="M18 18l10 4-6 14-8-9c0-4 2-7 4-9Z" fill="url(#g-crh-b)" opacity=".55"/>
      <path d="M46 18l-12 6 6 12 8-8c0-4-1-7-2-10Z" fill="#fff" opacity=".35"/>
      <path d="M32 22l-3 6 3 4 3-4-3-6Z" fill="#fff" opacity=".9"/>
      <path d="M22 34c3 5 7 9 12 12" stroke="#fff" stroke-width="1.4" fill="none" opacity=".5"/>
    </svg>`
  },
  {
    id: 'vinyl',
    name: 'Винил',
    rarity: 'rare',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Виниловая пластинка" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g-vin-a" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#3a3a44"/><stop offset=".7" stop-color="#16161c"/><stop offset="1" stop-color="#08080b"/></radialGradient>
        <linearGradient id="g-vin-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a65"/><stop offset="1" stop-color="#c2185b"/></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" fill="url(#g-vin-a)"/>
      <g fill="none" stroke="#4a4a58" stroke-width=".8" opacity=".7">
        <circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="21"/><circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="15"/>
      </g>
      <path d="M32 5a27 27 0 0 1 22 12" stroke="#8a8a9c" stroke-width="1.6" fill="none" opacity=".6"/>
      <circle cx="32" cy="32" r="9" fill="url(#g-vin-b)"/>
      <circle cx="32" cy="32" r="2.4" fill="#111"/>
      <path d="M26 27c2-2 5-3 8-2" stroke="#fff" stroke-width="1.4" fill="none" opacity=".55"/>
    </svg>`
  },
  {
    id: 'camera',
    name: 'Ретро-камера',
    rarity: 'rare',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Ретро-камера" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-cam-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b4b58"/><stop offset="1" stop-color="#1b1b22"/></linearGradient>
        <radialGradient id="g-cam-b" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#8fd8ff"/><stop offset=".6" stop-color="#2b6fa8"/><stop offset="1" stop-color="#0b2136"/></radialGradient>
      </defs>
      <rect x="6" y="22" width="52" height="30" rx="5" fill="url(#g-cam-a)"/>
      <rect x="20" y="14" width="24" height="10" rx="3" fill="#3a3a46"/>
      <rect x="22" y="16" width="8" height="5" rx="1" fill="#9ad7ff" opacity=".8"/>
      <circle cx="32" cy="38" r="13" fill="#0d0d12"/>
      <circle cx="32" cy="38" r="10" fill="url(#g-cam-b)"/>
      <circle cx="32" cy="38" r="4.5" fill="#08131d"/>
      <path d="M27 32c2-1 4-2 6-1" stroke="#fff" stroke-width="1.6" fill="none" opacity=".6" stroke-linecap="round"/>
      <circle cx="50" cy="28" r="2.4" fill="#e53935"/>
      <rect x="10" y="27" width="9" height="4" rx="1.5" fill="#5c5c6c"/>
      <rect x="10" y="46" width="8" height="3" rx="1" fill="#5c5c6c" opacity=".8"/>
    </svg>`
  },

  /* ---------- Epic ---------- */
  {
    id: 'gift_phoenix',
    name: 'Феникс',
    rarity: 'epic',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Феникс" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-px-a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8e0e00"/><stop offset=".45" stop-color="#ff5722"/><stop offset="1" stop-color="#ffd54f"/></linearGradient>
        <linearGradient id="g-px-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e1"/><stop offset="1" stop-color="#ffb300"/></linearGradient>
      </defs>
      <path d="M32 4c3 9 0 13-6 17C13 29 6 43 11 54c4 8 13 8 18 4-4-2-5-6-4-10 4 4 8 4 11 3-2-4-1-8 2-11 1 4 4 7 8 8-1-4 0-7 3-9 3 3 5 7 4 12 5-2 8-7 8-12 4 4 5 8 3 13 8-3 12-12 9-21-3-10-11-18-20-21-5-2-8-6-7-14Z" fill="url(#g-px-a)"/>
      <path d="M32 22c3 7 9 11 9 19 0 6-4 11-9 13-5-2-9-7-9-13 0-8 6-12 9-19Z" fill="url(#g-px-b)"/>
      <circle cx="32" cy="38" r="2.4" fill="#ff6d00"/>
      <path d="M20 16c-4 5-6 10-6 15M44 16c4 5 6 10 6 15" stroke="#ffca28" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/>
      <path d="M14 52l-5 5M50 52l5 5" stroke="#ffd54f" stroke-width="2" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'gift_lion',
    name: 'Золотой лев',
    rarity: 'epic',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Золотой лев" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g-gl-a" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff3b0"/><stop offset=".6" stop-color="#f2b705"/><stop offset="1" stop-color="#8c5a00"/></radialGradient>
        <radialGradient id="g-gl-b" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c98a00"/></radialGradient>
      </defs>
      <g fill="url(#g-gl-a)">
        <circle cx="32" cy="32" r="21"/>
        <circle cx="13" cy="20" r="7"/><circle cx="51" cy="20" r="7"/><circle cx="8" cy="37" r="6"/><circle cx="56" cy="37" r="6"/>
        <circle cx="17" cy="51" r="6"/><circle cx="47" cy="51" r="6"/><circle cx="32" cy="10" r="6"/><circle cx="32" cy="55" r="5"/>
      </g>
      <circle cx="32" cy="33" r="14" fill="url(#g-gl-b)"/>
      <path d="M23 29c1.5-3 5-3 7 0M41 29c-1.5-3-5-3-7 0" stroke="#5b3700" stroke-width="1.8" fill="none"/>
      <circle cx="26" cy="32" r="2" fill="#3a2200"/><circle cx="38" cy="32" r="2" fill="#3a2200"/>
      <path d="M29 42h6l-3 3-3-3Z" fill="#5b3700"/>
      <path d="M32 45v3M28 47c1 2 2.5 2.5 4 2.5M36 47c-1 2-2.5 2.5-4 2.5" stroke="#5b3700" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M11 17l3 4-4 2M53 17l-3 4 4 2" stroke="#fff3b0" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'gift_crown',
    name: 'Королевская корона',
    rarity: 'epic',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Королевская корона" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-gc-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6cc"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#a06b00"/></linearGradient>
        <radialGradient id="g-gc-j" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ff9db6"/><stop offset="1" stop-color="#c2185b"/></radialGradient>
      </defs>
      <path d="M8 24l13 9L32 9l11 24 13-9-5 28H13L8 24Z" fill="url(#g-gc-a)"/>
      <path d="M14 52h36l3 7H11l3-7Z" fill="#8a5c0d"/>
      <circle cx="20" cy="32" r="3" fill="url(#g-gc-j)"/><circle cx="32" cy="27" r="3.4" fill="#3f7bff"/><circle cx="44" cy="32" r="3" fill="#159c5c"/>
      <circle cx="26" cy="44" r="2" fill="#fff3b0"/><circle cx="38" cy="44" r="2" fill="#fff3b0"/>
      <path d="M16 40h32" stroke="#fff6cc" stroke-width="1.6" opacity=".6"/>
      <path d="M32 4v5M12 18l3 4M52 18l-3 4" stroke="#fff3b0" stroke-width="2" stroke-linecap="round"/>
    </svg>`
  },

  /* ---------- Legendary ---------- */
  {
    id: 'diamond_ring',
    name: 'Кольцо с бриллиантом',
    rarity: 'legendary',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Кольцо с бриллиантом" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g-dr-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#e6b422"/><stop offset="1" stop-color="#8a6200"/></linearGradient>
        <linearGradient id="g-dr-gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#a6e7ff"/><stop offset="1" stop-color="#3b7dff"/></linearGradient>
      </defs>
      <circle cx="32" cy="38" r="17" fill="none" stroke="url(#g-dr-gold)" stroke-width="5"/>
      <circle cx="32" cy="38" r="17" fill="none" stroke="#fff6cc" stroke-width="1.2" opacity=".5"/>
      <path d="M32 6l11 10-11 14-11-14L32 6Z" fill="url(#g-dr-gem)" stroke="#eaf9ff" stroke-width="1"/>
      <path d="M21 16h22L32 30 21 16Z" fill="#fff" opacity=".35"/>
      <path d="M32 6l-4 10 4 14 4-14-4-10Z" fill="#fff" opacity=".55"/>
      <path d="M18 20l-2 4M46 20l2 4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M17 30l-4 1M47 30l4 1" stroke="#fff6cc" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: 'galaxy',
    name: 'Галактика',
    rarity: 'legendary',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Галактика" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g-gal-a" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#b388ff"/><stop offset=".75" stop-color="#4527a0"/><stop offset="1" stop-color="#0b0324"/></radialGradient>
        <linearGradient id="g-gal-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8ae2"/><stop offset="1" stop-color="#4fc3ff"/></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#g-gal-a)"/>
      <ellipse cx="32" cy="32" rx="22" ry="8" fill="none" stroke="url(#g-gal-b)" stroke-width="2.4" opacity=".85" transform="rotate(-25 32 32)"/>
      <ellipse cx="32" cy="32" rx="15" ry="5" fill="none" stroke="#e1d4ff" stroke-width="1.4" opacity=".7" transform="rotate(30 32 32)"/>
      <circle cx="32" cy="32" r="4" fill="#fff"/>
      <circle cx="32" cy="32" r="8" fill="#fff" opacity=".2"/>
      <g fill="#fff">
        <circle cx="14" cy="20" r="1.2"/><circle cx="49" cy="17" r="1"/><circle cx="52" cy="40" r="1.4"/><circle cx="17" cy="45" r="1"/>
        <circle cx="24" cy="12" r=".9"/><circle cx="44" cy="50" r=".9"/>
      </g>
      <path d="M44 8l1.2 2.8L48 12l-2.8 1.2L44 16l-1.2-2.8L40 12l2.8-1.2L44 8Z" fill="#ffe082"/>
    </svg>`
  },

  /* ---------- Owner-only ---------- */
  {
    id: 'black_rose',
    name: 'Чёрная роза',
    rarity: 'admin',
    svg: `<svg viewBox="0 0 64 64" role="img" aria-label="Чёрная роза" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g-br-a" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#5a5a6e"/><stop offset=".5" stop-color="#1c1c26"/><stop offset="1" stop-color="#000000"/></radialGradient>
        <linearGradient id="g-br-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d58a"/><stop offset="1" stop-color="#8a6200"/></linearGradient>
      </defs>
      <g fill="url(#g-br-a)" stroke="#9a8f6a" stroke-width=".8">
        <circle cx="32" cy="23" r="15"/>
        <path d="M17 21c6-9 22-9 30 0-8-4-22-4-30 0Z" opacity=".55"/>
      </g>
      <path d="M32 12c-6 1-11 6-11 11 0 3 2 5 4 5s4-2 4-4-2-4-4-3" fill="none" stroke="#c9b98a" stroke-width="1.8" opacity=".9"/>
      <path d="M32 16c5 1 8 5 8 9 0 3-2 5-4 5s-3-1-3-3 1-3 3-3" fill="none" stroke="#8a7c5a" stroke-width="1.6"/>
      <path d="M27 27c3 3 7 3 10 0" stroke="#b9a97c" stroke-width="1.4" fill="none" opacity=".8"/>
      <path d="M32 38c0 10-3 16-7 21" stroke="#2f5d4a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M30 46c-6-3-10-1-12 4 6 2 10 0 12-4Z" fill="#2f5d4a"/>
      <path d="M31 51c5-2 9 0 11 4-5 2-9 0-11-4Z" fill="#244a3a"/>
      <path d="M14 14l1 2.4L17.4 17.4 15 18.4 14 21l-1-2.6L10.6 17.4 13 16.4 14 14Z" fill="url(#g-br-b)"/>
      <circle cx="50" cy="44" r="1.2" fill="#ffe9a8"/><circle cx="54" cy="24" r="1" fill="#ffe9a8"/><circle cx="45" cy="54" r=".9" fill="#ffe9a8"/>
    </svg>`
  }
];

module.exports = { GIFTS };
