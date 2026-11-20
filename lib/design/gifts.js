'use strict';

// Premium gift artwork drawn as inline SVG.
// One light source (top-left), smooth gradients, inner highlights, thin light
// outlines and a soft coloured contact shadow are shared by every illustration
// so the whole catalogue feels like one set.

const PALETTES = {
  teddy: ['#e6b98f', '#b5794a', '#7a4a25', '#5a3216'],
  bouquet: ['#ffd1e3', '#e8467c', '#a3123f', '#5b0a24'],
  giftbox: ['#b9e0ff', '#4a8fe7', '#2358a8', '#12345f'],
  cake: ['#ffe3ef', '#f287b0', '#c14c7c', '#7a2949'],
  diamond_ring: ['#fff3b8', '#e8ba3c', '#9c6f0b', '#5c4003'],
  rocket: ['#d8e6f5', '#8fa8c4', '#4d6b8f', '#28405c'],
  trophy: ['#fff2b8', '#eab63b', '#a97410', '#664404'],
  diamond: ['#e3fbff', '#7fd8f5', '#2f88c9', '#164f80'],
  crown: ['#fff0b0', '#efc246', '#a9750f', '#634303'],
  star: ['#fff7c2', '#f5cf4a', '#c08c0c', '#7a5603'],
  balloons: ['#ffd6e4', '#f2709b', '#b8305f', '#74203c'],
  cupcake: ['#ffe6f0', '#f292b8', '#bf4f79', '#7d2f4a'],
  icecream: ['#fff0d8', '#eab98a', '#b57f4c', '#7a4f27'],
  coffee: ['#f3e3cf', '#c49a70', '#8a5f3a', '#553521'],
  book: ['#dfe6ff', '#7f8fd8', '#3f4c96', '#232b5c'],
  headphones: ['#e2e6f2', '#8e9ab5', '#4a566f', '#2a3245'],
  football: ['#f4f7ff', '#c3cddf', '#7b879d', '#454f63'],
  tickets: ['#ffe6c9', '#f0a63f', '#b56c0d', '#744405'],
  teapot: ['#dff6f2', '#79c7bd', '#2f8a7e', '#155a51'],
  melon: ['#e2f7c8', '#8fc95c', '#548c26', '#2f5911'],
  samsa: ['#f8e0b6', '#d9a051', '#9a6421', '#5f3c0f'],
  doppi: ['#c9e4ff', '#5c9bd6', '#255e94', '#123a5e'],
  plane: ['#eaf3ff', '#9dbde0', '#4f77a3', '#2a4665'],
  heart_box: ['#ffd9e3', '#e05579', '#a01f45', '#65102b'],
  black_rose: ['#6e6e82', '#2b2b36', '#111117', '#000000']
};

const SHADOW = {
  teddy: '#7a4a25',
  bouquet: '#a3123f',
  giftbox: '#2358a8',
  cake: '#c14c7c',
  diamond_ring: '#9c6f0b',
  rocket: '#4d6b8f',
  trophy: '#a97410',
  diamond: '#2f88c9',
  crown: '#a9750f',
  star: '#c08c0c',
  balloons: '#b8305f',
  cupcake: '#bf4f79',
  icecream: '#b57f4c',
  coffee: '#8a5f3a',
  book: '#3f4c96',
  headphones: '#4a566f',
  football: '#7b879d',
  tickets: '#b56c0d',
  teapot: '#2f8a7e',
  melon: '#548c26',
  samsa: '#9a6421',
  doppi: '#255e94',
  plane: '#4f77a3',
  heart_box: '#a01f45',
  black_rose: '#000000'
};

// Sparkles are deterministic so the sprite stays cacheable and every render
// of the same gift looks identical.
const SPARKS = [
  [108, 132, 15], [404, 168, 11], [138, 320, 7], [388, 366, 13],
  [256, 92, 9], [416, 268, 6], [86, 236, 5], [330, 74, 6]
];

function sparkField(key, tint) {
  return SPARKS.map(([x, y, r], index) => {
    const opacity = (0.32 + (index % 3) * 0.16).toFixed(2);
    return `<path d="M${x} ${y - r * 2}Q${x + r * 0.35} ${y - r * 0.35} ${x + r * 2} ${y}Q${x + r * 0.35} ${y + r * 0.35} ${x} ${y + r * 2}Q${x - r * 0.35} ${y + r * 0.35} ${x - r * 2} ${y}Q${x - r * 0.35} ${y - r * 0.35} ${x} ${y - r * 2}Z" fill="${tint}" opacity="${opacity}"/>`;
  }).join('');
}

function wrap(key, label, body) {
  const [light, base, dark, deepest] = PALETTES[key];
  const shadow = SHADOW[key];
  return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="ga-${key}" x1="0.08" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="0.34" stop-color="${base}"/>
      <stop offset="0.72" stop-color="${dark}"/>
      <stop offset="1" stop-color="${deepest}"/>
    </linearGradient>
    <linearGradient id="gb-${key}" x1="0" y1="0" x2="0.62" y2="1">
      <stop offset="0" stop-color="${base}"/>
      <stop offset="0.68" stop-color="${dark}"/>
      <stop offset="1" stop-color="${deepest}"/>
    </linearGradient>
    <linearGradient id="gc-${key}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="${light}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${light}" stop-opacity="0.28"/>
    </linearGradient>
    <radialGradient id="gd-${key}" cx="0.32" cy="0.22" r="0.7">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.68"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gg-${key}" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${light}" stop-opacity="0.5"/>
      <stop offset="0.5" stop-color="${base}" stop-opacity="0.2"/>
      <stop offset="1" stop-color="${dark}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gw-${key}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.75" stop-color="${light}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="gf-${key}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${base}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${base}" stop-opacity="0"/>
    </linearGradient>
    <filter id="ge-${key}" x="-32%" y="-32%" width="164%" height="176%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="${shadow}" flood-opacity="0.44"/>
    </filter>
    <filter id="gh-${key}" x="-40%" y="-40%" width="180%" height="200%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
  </defs>
  <circle cx="256" cy="252" r="198" fill="url(#gg-${key})"/>
  <circle cx="256" cy="252" r="198" fill="none" stroke="url(#gw-${key})" stroke-opacity="0.28" stroke-width="2"/>
  ${sparkField(key, light)}
  <ellipse cx="256" cy="452" rx="176" ry="34" fill="${shadow}" opacity="0.34" filter="url(#gh-${key})"/>
  <ellipse cx="256" cy="450" rx="126" ry="20" fill="${shadow}" opacity="0.3"/>
  <ellipse cx="256" cy="446" rx="88" ry="13" fill="${deepest}" opacity="0.28"/>
  <g filter="url(#ge-${key})">${body}</g>
  <ellipse cx="194" cy="164" rx="98" ry="72" fill="url(#gd-${key})" opacity="0.42"/>
  <ellipse cx="256" cy="466" rx="118" ry="16" fill="url(#gf-${key})" opacity="0.35"/>
  <path d="M124 344c14 46 42 78 80 96" stroke="url(#gw-${key})" stroke-width="5" opacity="0.22" fill="none" stroke-linecap="round"/>
</svg>`;
}

const GIFTS = [
  {
    id: 'teddy',
    name: 'Плюшевый мишка',
    rarity: 'common',
    tags: ['popular', 'holiday'],
    body: `
      <circle cx="150" cy="152" r="62" fill="url(#ga-teddy)"/><circle cx="362" cy="152" r="62" fill="url(#ga-teddy)"/>
      <circle cx="150" cy="152" r="34" fill="url(#gc-teddy)"/><circle cx="362" cy="152" r="34" fill="url(#gc-teddy)"/>
      <ellipse cx="256" cy="406" rx="118" ry="92" fill="url(#gb-teddy)"/>
      <circle cx="256" cy="234" r="132" fill="url(#ga-teddy)"/>
      <ellipse cx="256" cy="288" rx="74" ry="56" fill="url(#gc-teddy)"/>
      <ellipse cx="256" cy="268" rx="26" ry="20" fill="${PALETTES.teddy[3]}"/>
      <ellipse cx="214" cy="218" rx="13" ry="16" fill="${PALETTES.teddy[3]}"/><ellipse cx="298" cy="218" rx="13" ry="16" fill="${PALETTES.teddy[3]}"/>
      <circle cx="218" cy="214" r="5" fill="#fff" opacity="0.9"/><circle cx="302" cy="214" r="5" fill="#fff" opacity="0.9"/>
      <path d="M256 286v26M232 320c6 12 15 18 24 18s18-6 24-18" stroke="${PALETTES.teddy[3]}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M196 372c14 30 40 44 60 44s46-14 60-44" stroke="#d8455c" stroke-width="20" fill="none" stroke-linecap="round"/>
      <circle cx="256" cy="420" r="15" fill="#d8455c"/>
      <ellipse cx="200" cy="418" rx="46" ry="30" fill="url(#gb-teddy)"/><ellipse cx="312" cy="418" rx="46" ry="30" fill="url(#gb-teddy)"/>
      <path d="M186 196c10-18 28-26 46-24" stroke="#fff" stroke-width="8" opacity="0.45" fill="none" stroke-linecap="round"/>`
  },
  {
    id: 'bouquet',
    name: 'Букет роз',
    rarity: 'rare',
    tags: ['popular', 'holiday'],
    body: `
      <path d="M188 300h136l-22 150H210l-22-150Z" fill="url(#gc-bouquet)"/>
      <path d="M196 312h120l-8 42H204l-8-42Z" fill="#ffffff" opacity="0.28"/>
      <path d="M256 300v150M214 320l16 120M298 320l-16 120" stroke="#d8577f" stroke-width="5" opacity="0.45"/>
      <path d="M212 300c-28-46-30-96-10-140M300 300c28-46 30-96 10-140M256 300V126" stroke="#2f7d46" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M212 230c-40-6-62 12-66 44 34 8 60-6 66-44ZM300 230c40-6 62 12 66 44-34 8-60-6-66-44Z" fill="#3f9a58"/>
      <g>
        <circle cx="212" cy="118" r="58" fill="url(#ga-bouquet)"/><circle cx="212" cy="118" r="30" fill="url(#gb-bouquet)"/>
        <path d="M200 96c14-10 32-6 38 8s-4 30-18 32-28-8-28-20" stroke="#ffd9e6" stroke-width="6" fill="none" opacity="0.8"/>
        <circle cx="318" cy="142" r="50" fill="url(#ga-bouquet)"/><circle cx="318" cy="142" r="26" fill="url(#gb-bouquet)"/>
        <path d="M308 122c12-8 26-4 31 8s-4 25-15 26-23-7-23-17" stroke="#ffd9e6" stroke-width="5" fill="none" opacity="0.8"/>
        <circle cx="264" cy="72" r="46" fill="url(#ga-bouquet)"/><circle cx="264" cy="72" r="24" fill="url(#gb-bouquet)"/>
        <path d="M254 54c10-7 23-3 27 7s-3 22-13 23-20-6-20-15" stroke="#ffd9e6" stroke-width="5" fill="none" opacity="0.8"/>
      </g>
      <path d="M256 404c-10 8-24 8-34 0 6 18 28 18 34 0Z" fill="#ffffff" opacity="0.35"/>`
  },
  {
    id: 'giftbox',
    name: 'Коробка с бантом',
    rarity: 'epic',
    tags: ['new', 'popular', 'holiday'],
    body: `
      <rect x="112" y="222" width="288" height="196" rx="22" fill="url(#ga-giftbox)"/>
      <rect x="112" y="222" width="288" height="196" rx="22" fill="none" stroke="#e8f6ff" stroke-width="4" opacity="0.55"/>
      <rect x="92" y="176" width="328" height="74" rx="18" fill="url(#gb-giftbox)"/>
      <rect x="232" y="176" width="48" height="242" fill="#f4f9ff" opacity="0.95"/>
      <rect x="232" y="176" width="48" height="242" fill="url(#gc-giftbox)" opacity="0.45"/>
      <path d="M256 176c-46-10-84-38-84-70 0-22 24-30 44-16s32 50 40 86Zm0 0c46-10 84-38 84-70 0-22-24-30-44-16s-32 50-40 86Z" fill="url(#gc-giftbox)"/>
      <path d="M256 176c-30-24-46-56-30-78 12-16 30-4 30 22s0 44 0 56Zm0 0c30-24 46-56 30-78-12-16-30-4-30 22s0 44 0 56Z" fill="#f4f9ff" opacity="0.75"/>
      <circle cx="256" cy="176" r="22" fill="#ffffff" opacity="0.9"/>
      <path d="M150 258h60M150 288h44" stroke="#ffffff" stroke-width="7" opacity="0.35" stroke-linecap="round"/>`
  },
  {
    id: 'cake',
    name: 'Праздничный торт',
    rarity: 'epic',
    tags: ['holiday', 'popular'],
    body: `
      <ellipse cx="256" cy="428" rx="180" ry="34" fill="url(#gc-cake)"/>
      <rect x="116" y="316" width="280" height="106" rx="26" fill="url(#gb-cake)"/>
      <rect x="136" y="238" width="240" height="92" rx="24" fill="url(#ga-cake)"/>
      <path d="M116 342c22 26 46 26 70 2s48-24 70 0 48 26 70 2 48-24 70 0v-28H116v24Z" fill="url(#gc-cake)"/>
      <path d="M136 262c20 24 42 24 60 2s42-22 60 0 40 22 60 0 40-22 60 0v-25H136v23Z" fill="#fff2f7" opacity="0.9"/>
      <rect x="240" y="150" width="18" height="80" rx="8" fill="#f7f2ff"/>
      <path d="M249 108c22 20 22 40 0 50-22-10-22-30 0-50Z" fill="#ffb35c"/>
      <circle cx="176" cy="304" r="12" fill="#e34e6d"/><circle cx="220" cy="304" r="12" fill="#f2b23f"/><circle cx="292" cy="304" r="12" fill="#7d6ad8"/><circle cx="336" cy="304" r="12" fill="#e34e6d"/>
      <path d="M150 396h212" stroke="#ffffff" stroke-width="8" opacity="0.22" stroke-linecap="round"/>`
  },
  {
    id: 'diamond_ring',
    name: 'Кольцо с бриллиантом',
    rarity: 'legendary',
    tags: ['popular', 'limited', 'holiday'],
    body: `
      <circle cx="256" cy="306" r="112" fill="none" stroke="url(#ga-diamond_ring)" stroke-width="34"/>
      <circle cx="256" cy="306" r="112" fill="none" stroke="#fff7cf" stroke-width="7" opacity="0.5"/>
      <path d="M256 92l92 76-92 106-92-106 92-76Z" fill="url(#gc-diamond_ring)"/>
      <path d="M164 168h184l-92 106-92-106Z" fill="#dff7ff" opacity="0.55"/>
      <path d="M256 92v182M204 168h104M232 168l24 106 24-106" stroke="#ffffff" stroke-width="5" opacity="0.8" fill="none"/>
      <path d="M164 168l-24 26M348 168l24 26" stroke="#fff7cf" stroke-width="7" stroke-linecap="round"/>
      <path d="M180 232l-18 8M332 232l18 8" stroke="#fff7cf" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="218" cy="128" rx="22" ry="12" fill="#ffffff" opacity="0.8" transform="rotate(-28 218 128)"/>`
  },
  {
    id: 'rocket',
    name: 'Ракета',
    rarity: 'legendary',
    tags: ['new', 'limited'],
    body: `
      <path d="M256 60c56 42 84 104 84 178 0 42-12 80-34 110h-100c-22-30-34-68-34-110 0-74 28-136 84-178Z" fill="url(#ga-rocket)"/>
      <path d="M256 60c-30 26-50 62-60 104 26-18 40-24 60-24s34 6 60 24c-10-42-30-78-60-104Z" fill="url(#gc-rocket)" opacity="0.85"/>
      <circle cx="256" cy="226" r="42" fill="url(#gb-rocket)"/>
      <circle cx="256" cy="226" r="28" fill="#d9f4ff"/>
      <path d="M216 214c8-10 22-16 36-12" stroke="#ffffff" stroke-width="7" opacity="0.75" fill="none" stroke-linecap="round"/>
      <path d="M190 272c-34 22-50 54-52 92 32-6 58-22 70-46" fill="url(#gb-rocket)"/>
      <path d="M322 272c34 22 50 54 52 92-32-6-58-22-70-46" fill="url(#gb-rocket)"/>
      <path d="M226 352c4 30 14 56 30 78 16-22 26-48 30-78" fill="url(#gc-rocket)"/>
      <path d="M256 380v56" stroke="#ffffff" stroke-width="6" opacity="0.6" stroke-linecap="round"/>
      <circle cx="256" cy="352" r="10" fill="#7ee0ff"/>`
  },
  {
    id: 'trophy',
    name: 'Кубок',
    rarity: 'epic',
    tags: ['student', 'limited'],
    body: `
      <path d="M168 100h176v70c0 58-38 102-88 102s-88-44-88-102v-70Z" fill="url(#ga-trophy)"/>
      <path d="M168 118c-44 0-66 24-62 60 4 40 40 62 86 60M344 118c44 0 66 24 62 60-4 40-40 62-86 60" fill="none" stroke="url(#gb-trophy)" stroke-width="20" stroke-linecap="round"/>
      <path d="M256 272v82" stroke="url(#gb-trophy)" stroke-width="34"/>
      <path d="M186 354h140l16 54H170l16-54Z" fill="url(#gb-trophy)"/>
      <path d="M158 408h196l10 34H148l10-34Z" fill="url(#ga-trophy)"/>
      <path d="M196 130h120" stroke="#fffbe0" stroke-width="8" opacity="0.55" stroke-linecap="round"/>
      <path d="M256 168l14 30 32 4-24 22 6 32-28-16-28 16 6-32-24-22 32-4 14-30Z" fill="#fff8cc" opacity="0.9"/>`
  },
  {
    id: 'diamond',
    name: 'Алмаз',
    rarity: 'legendary',
    tags: ['new', 'limited'],
    body: `
      <path d="M256 68l132 104-132 272L124 172 256 68Z" fill="url(#ga-diamond)"/>
      <path d="M124 172h264L256 444 124 172Z" fill="url(#gc-diamond)" opacity="0.55"/>
      <path d="M256 68v104M124 172l80 0-32 56 84 216M388 172l-80 0 32 56-84 216M204 172l52-104 52 104" stroke="#ffffff" stroke-width="6" opacity="0.75" fill="none" stroke-linejoin="round"/>
      <path d="M124 172h132L256 444 124 172Z" fill="#ffffff" opacity="0.12"/>
      <ellipse cx="206" cy="122" rx="30" ry="16" fill="#ffffff" opacity="0.75" transform="rotate(-32 206 122)"/>
      <path d="M320 300l6 16 16 6-16 6-6 16-6-16-16-6 16-6 6-16Z" fill="#ffffff" opacity="0.8"/>`
  },
  {
    id: 'crown',
    name: 'Корона',
    rarity: 'legendary',
    tags: ['limited', 'popular'],
    body: `
      <path d="M92 168l84 64 80-140 80 140 84-64-38 196H130L92 168Z" fill="url(#ga-crown)"/>
      <path d="M130 364h252l18 50H112l18-50Z" fill="url(#gb-crown)"/>
      <circle cx="176" cy="234" r="20" fill="#e2587c"/><circle cx="256" cy="196" r="24" fill="#5b8def"/><circle cx="336" cy="234" r="20" fill="#4eb886"/>
      <circle cx="256" cy="300" r="14" fill="#fff6cf"/><circle cx="196" cy="300" r="12" fill="#fff6cf"/><circle cx="316" cy="300" r="12" fill="#fff6cf"/>
      <path d="M150 332h212" stroke="#fff6cf" stroke-width="8" opacity="0.6"/>
      <path d="M256 70v34M104 156l18 26M408 156l-18 26" stroke="#fff3b8" stroke-width="10" stroke-linecap="round"/>`
  },
  {
    id: 'star',
    name: 'Золотая звезда',
    rarity: 'common',
    tags: ['student', 'popular'],
    body: `
      <path d="M256 64l54 122 132 14-100 88 28 130-114-66-114 66 28-130-100-88 132-14 54-122Z" fill="url(#ga-star)"/>
      <path d="M256 132l34 78 84 9-64 56 18 82-72-42-72 42 18-82-64-56 84-9 34-78Z" fill="#fffbd6" opacity="0.55"/>
      <ellipse cx="216" cy="168" rx="24" ry="14" fill="#ffffff" opacity="0.8" transform="rotate(-24 216 168)"/>
      <path d="M400 116l8 20 20 8-20 8-8 20-8-20-20-8 20-8 8-20Z" fill="#fff9cf"/>`
  },
  {
    id: 'balloons',
    name: 'Воздушные шарики',
    rarity: 'common',
    tags: ['holiday', 'popular'],
    body: `
      <path d="M204 300c-6 62-18 104-34 140M256 300c0 62-4 108-8 152M308 300c8 62 22 104 42 140" stroke="#b98a6a" stroke-width="6" fill="none" opacity="0.7"/>
      <ellipse cx="204" cy="212" rx="86" ry="106" fill="url(#ga-balloons)"/>
      <ellipse cx="308" cy="222" rx="76" ry="94" fill="url(#gb-balloons)"/>
      <ellipse cx="256" cy="152" rx="66" ry="80" fill="url(#gc-balloons)"/>
      <path d="M204 316l-14 16h28l-14-16ZM308 312l-12 14h24l-12-14ZM256 228l-12 16h24l-12-16Z" fill="#c2456e" opacity="0.85"/>
      <ellipse cx="178" cy="160" rx="20" ry="28" fill="#ffffff" opacity="0.6" transform="rotate(-24 178 160)"/>
      <ellipse cx="286" cy="176" rx="16" ry="24" fill="#ffffff" opacity="0.45" transform="rotate(-24 286 176)"/>
      <ellipse cx="238" cy="112" rx="14" ry="20" fill="#ffffff" opacity="0.6" transform="rotate(-24 238 112)"/>`
  },
  {
    id: 'cupcake',
    name: 'Капкейк',
    rarity: 'common',
    tags: ['holiday', 'popular'],
    body: `
      <path d="M150 274h212l-28 154H178l-28-154Z" fill="url(#ga-cupcake)"/>
      <path d="M166 306h180M172 346h168M180 386h152" stroke="#c94f78" stroke-width="7" opacity="0.45"/>
      <path d="M118 268c10-72 62-84 78-126 22 40 44 38 60 38s38 2 60-38c16 42 68 54 78 126H118Z" fill="url(#gc-cupcake)"/>
      <path d="M186 202c8-26 24-38 42-40M286 162c22 4 34 18 40 38" stroke="#ffffff" stroke-width="9" opacity="0.55" fill="none" stroke-linecap="round"/>
      <circle cx="256" cy="96" r="34" fill="#e0486a"/>
      <path d="M248 70c10-14 22-18 34-12" stroke="#7bc47f" stroke-width="8" fill="none" stroke-linecap="round"/>
      <circle cx="198" cy="150" r="7" fill="#ffffff" opacity="0.9"/><circle cx="308" cy="140" r="6" fill="#ffffff" opacity="0.85"/><circle cx="262" cy="196" r="5" fill="#ffffff" opacity="0.8"/>`
  },
  {
    id: 'icecream',
    name: 'Мороженое',
    rarity: 'rare',
    tags: ['holiday', 'new'],
    body: `
      <path d="M176 262h160L256 448 176 262Z" fill="url(#ga-icecream)"/>
      <path d="M176 262h160L256 448 176 262Z" fill="none" stroke="#fff0d8" stroke-width="5" opacity="0.5"/>
      <path d="M196 300h120M208 340h96M220 380h72" stroke="#b57f4c" stroke-width="6" opacity="0.45"/>
      <circle cx="212" cy="222" r="62" fill="url(#gc-icecream)"/>
      <circle cx="300" cy="228" r="58" fill="url(#gb-icecream)"/>
      <circle cx="256" cy="170" r="58" fill="url(#ga-icecream)"/>
      <path d="M256 118c6-26 22-40 44-42" stroke="#ffffff" stroke-width="10" opacity="0.65" fill="none" stroke-linecap="round"/>
      <circle cx="262" cy="108" r="14" fill="#e2607c"/>
      <path d="M232 160c8-12 20-16 32-14" stroke="#ffffff" stroke-width="8" opacity="0.7" fill="none" stroke-linecap="round"/>
      <path d="M240 240c10 8 22 8 32 0" stroke="#ffffff" stroke-width="6" opacity="0.5" fill="none" stroke-linecap="round"/>`
  },
  {
    id: 'coffee',
    name: 'Кофе с собой',
    rarity: 'common',
    tags: ['student', 'popular'],
    body: `
      <path d="M170 156h172l-22 270H192l-22-270Z" fill="url(#ga-coffee)"/>
      <path d="M158 140h196v46H158v-46Z" fill="url(#gb-coffee)"/>
      <path d="M170 156h172l-8 92H178l-8-92Z" fill="#6d4c37"/>
      <path d="M186 104h128l14 40H172l14-40Z" fill="url(#gb-coffee)"/>
      <path d="M200 232h112l-6 44H206l-6-44Z" fill="#fff6ea" opacity="0.9"/>
      <path d="M226 254c14-12 30-12 44 0" stroke="#8a5f3a" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M222 78c-12-20 12-28 0-48M258 78c-12-20 12-28 0-48M294 78c-12-20 12-28 0-48" stroke="#ffffff" stroke-width="8" opacity="0.5" fill="none" stroke-linecap="round"/>
      <path d="M196 192h100" stroke="#ffffff" stroke-width="7" opacity="0.22" stroke-linecap="round"/>`
  },
  {
    id: 'book',
    name: 'Книга и выпускная шапка',
    rarity: 'common',
    tags: ['student'],
    body: `
      <path d="M84 190h172v212H84c-14 0-24-10-24-24V214c0-14 10-24 24-24Z" fill="url(#gc-book)"/>
      <path d="M84 190h172v212H84c-14 0-24-10-24-24V214c0-14 10-24 24-24Z" fill="none" stroke="#e8ecff" stroke-width="5" opacity="0.55"/>
      <path d="M428 190H256v212h172c14 0 24-10 24-24V214c0-14-10-24-24-24Z" fill="url(#ga-book)"/>
      <path d="M256 190v212" stroke="#c3cdf5" stroke-width="10"/>
      <g stroke="#c3cdf5" stroke-width="7" opacity="0.75" stroke-linecap="round">
        <path d="M110 236h116M110 280h116M110 324h92M286 236h116M286 280h116M286 324h92"/>
      </g>
      <path d="M256 132l128 54-128 54-128-54 128-54Z" fill="url(#gb-book)"/>
      <path d="M148 174v46c0 22 48 40 108 40s108-18 108-40v-46" fill="none" stroke="url(#gb-book)" stroke-width="14" opacity="0.65"/>
      <path d="M256 186v60" stroke="#fff3b8" stroke-width="8" stroke-linecap="round"/>
      <circle cx="256" cy="254" r="12" fill="#f4c94a"/>`
  },
  {
    id: 'headphones',
    name: 'Наушники',
    rarity: 'epic',
    tags: ['new', 'popular'],
    body: `
      <path d="M124 300v-48c0-76 58-136 132-136s132 60 132 136v48" fill="none" stroke="url(#ga-headphones)" stroke-width="42" stroke-linecap="round"/>
      <path d="M134 272v-20c0-70 54-124 122-124s122 54 122 124v20" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.35" stroke-linecap="round"/>
      <rect x="88" y="278" width="94" height="150" rx="44" fill="url(#gb-headphones)"/>
      <rect x="330" y="278" width="94" height="150" rx="44" fill="url(#gb-headphones)"/>
      <rect x="110" y="306" width="50" height="94" rx="25" fill="url(#gc-headphones)"/>
      <rect x="352" y="306" width="50" height="94" rx="25" fill="url(#gc-headphones)"/>
      <path d="M132 330v44M374 330v44" stroke="#ffffff" stroke-width="8" opacity="0.55" stroke-linecap="round"/>
      <circle cx="404" cy="252" r="12" fill="#8fe0ff"/>`
  },
  {
    id: 'football',
    name: 'Футбольный мяч',
    rarity: 'rare',
    tags: ['student', 'popular'],
    body: `
      <circle cx="256" cy="256" r="168" fill="url(#ga-football)"/>
      <circle cx="256" cy="256" r="168" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.55"/>
      <path d="M256 182l58 42-22 68h-72l-22-68 58-42Z" fill="#2c3546"/>
      <path d="M256 78l16 56-50 34-42-40 20-34 56-16ZM420 214l-52 18-28-52 34-28 46 34v28ZM110 214l52 18 28-52-34-28-46 34v28ZM356 400l-18-54 56-24 22 40-24 30-36 8ZM156 400l18-54-56-24-22 40 24 30 36 8Z" fill="#2c3546" opacity="0.85"/>
      <path d="M256 182l-86-58M314 224l64-22M198 292l-62 46M318 292l62 46M220 324l-24 64M292 324l24 64" stroke="#2c3546" stroke-width="10" fill="none"/>
      <ellipse cx="196" cy="178" rx="42" ry="26" fill="#ffffff" opacity="0.55" transform="rotate(-28 196 178)"/>`
  },
  {
    id: 'tickets',
    name: 'Билеты в кино',
    rarity: 'common',
    tags: ['new', 'popular'],
    body: `
      <g transform="rotate(-10 256 300)">
        <rect x="96" y="252" width="320" height="150" rx="22" fill="url(#gb-tickets)"/>
        <rect x="96" y="252" width="320" height="150" rx="22" fill="none" stroke="#ffe6c9" stroke-width="5" opacity="0.5"/>
        <path d="M96 292h320M140 252v150" stroke="#ffe6c9" stroke-width="6" opacity="0.55" stroke-dasharray="14 12"/>
        <text x="268" y="330" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700" fill="#fff6ea" opacity="0.9">CINEMA</text>
        <text x="268" y="368" font-family="Inter, Arial, sans-serif" font-size="24" fill="#fff6ea" opacity="0.7">2 места · ряд 7</text>
      </g>
      <g transform="rotate(8 256 200)">
        <rect x="126" y="126" width="280" height="132" rx="20" fill="url(#ga-tickets)"/>
        <path d="M126 162h280M164 126v132" stroke="#fff6ea" stroke-width="6" opacity="0.5" stroke-dasharray="12 10"/>
        <text x="256" y="196" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" fill="#744405" opacity="0.8">ADMIT ONE</text>
        <text x="256" y="230" font-family="Inter, Arial, sans-serif" font-size="22" fill="#744405" opacity="0.6">Wiutgram cinema</text>
      </g>`
  },
  {
    id: 'teapot',
    name: 'Чайник и пиала',
    rarity: 'rare',
    tags: ['student', 'new'],
    body: `
      <ellipse cx="206" cy="404" rx="120" ry="30" fill="url(#gc-teapot)"/>
      <path d="M96 268c0-56 48-98 112-98s112 42 112 98c0 62-50 104-112 104S96 330 96 268Z" fill="url(#ga-teapot)"/>
      <path d="M318 262c40-8 74 6 78 44 2 28-16 48-46 54" fill="none" stroke="url(#gb-teapot)" stroke-width="24" stroke-linecap="round"/>
      <path d="M104 258c-28-12-44-34-42-62 30-2 54 12 66 36" fill="url(#gb-teapot)"/>
      <path d="M208 170c-2-22 12-38 34-40 20 2 34 18 32 40" fill="url(#gb-teapot)"/>
      <circle cx="242" cy="132" r="12" fill="url(#gc-teapot)"/>
      <path d="M140 246c10-24 30-38 54-40" stroke="#ffffff" stroke-width="9" opacity="0.55" fill="none" stroke-linecap="round"/>
      <path d="M342 356c50-14 82 4 92 44-24 30-64 38-112 20" fill="url(#gc-teapot)"/>
      <ellipse cx="386" cy="374" rx="52" ry="16" fill="url(#gb-teapot)"/>
      <path d="M362 372c8 14 22 20 40 18" stroke="#ffffff" stroke-width="6" opacity="0.4" fill="none"/>`
  },
  {
    id: 'melon',
    name: 'Дыня',
    rarity: 'common',
    tags: ['new', 'student'],
    body: `
      <ellipse cx="256" cy="272" rx="152" ry="150" fill="url(#ga-melon)"/>
      <ellipse cx="256" cy="272" rx="152" ry="150" fill="none" stroke="#e6ffd0" stroke-width="5" opacity="0.45"/>
      <g stroke="#d8f2b0" stroke-width="5" opacity="0.65" fill="none">
        <path d="M140 180c60 40 92 100 96 190M180 140c70 44 108 112 112 210M256 122v300M332 142c-70 44-108 112-112 210M372 182c-60 40-92 100-96 190"/>
        <path d="M124 300c50-14 92-14 132 2M388 300c-50-14-92-14-132 2M150 380c46-18 84-18 106-4M362 380c-46-18-84-18-106-4"/>
      </g>
      <path d="M204 158c26-22 56-32 86-30" stroke="#ffffff" stroke-width="10" opacity="0.5" fill="none" stroke-linecap="round"/>
      <path d="M256 122c8-18 26-26 44-22" stroke="#5b8c34" stroke-width="10" fill="none" stroke-linecap="round"/>`
  },
  {
    id: 'samsa',
    name: 'Самса',
    rarity: 'common',
    tags: ['new', 'student'],
    body: `
      <ellipse cx="256" cy="420" rx="152" ry="26" fill="#9a6421" opacity="0.25"/>
      <path d="M256 112c74 40 128 138 138 252-56 46-220 46-276 0 10-114 64-212 138-252Z" fill="url(#ga-samsa)"/>
      <path d="M256 112c74 40 128 138 138 252-56 46-220 46-276 0 10-114 64-212 138-252Z" fill="none" stroke="#ffe9c4" stroke-width="5" opacity="0.5"/>
      <path d="M256 132c-6 100-10 180-10 240M220 158c30 60 38 130 30 214M292 158c-30 60-38 130-30 214" stroke="#c08a3c" stroke-width="5" opacity="0.5" fill="none"/>
      <path d="M256 112c-26 26-34 52-30 76 10-8 20-12 30-12s20 4 30 12c4-24-4-50-30-76Z" fill="#f7d8a2" opacity="0.75"/>
      <g fill="#fff3d8" opacity="0.9">
        <ellipse cx="222" cy="196" rx="7" ry="4" transform="rotate(-20 222 196)"/><ellipse cx="286" cy="206" rx="7" ry="4" transform="rotate(16 286 206)"/>
        <ellipse cx="256" cy="246" rx="7" ry="4"/><ellipse cx="204" cy="272" rx="7" ry="4" transform="rotate(-24 204 272)"/>
        <ellipse cx="306" cy="286" rx="7" ry="4" transform="rotate(22 306 286)"/><ellipse cx="242" cy="330" rx="7" ry="4"/>
        <ellipse cx="292" cy="344" rx="7" ry="4" transform="rotate(14 292 344)"/>
      </g>`
  },
  {
    id: 'doppi',
    name: 'Тюбетейка',
    rarity: 'rare',
    tags: ['student', 'new'],
    body: `
      <path d="M118 322c-4-118 58-208 138-208s142 90 138 208c-40 26-234 26-276 0Z" fill="url(#ga-doppi)"/>
      <path d="M118 322c-4-118 58-208 138-208s142 90 138 208c-40 26-234 26-276 0Z" fill="none" stroke="#e6f4ff" stroke-width="5" opacity="0.5"/>
      <path d="M130 296c84 24 168 24 252 0v40c-84 26-168 26-252 0v-40Z" fill="url(#gb-doppi)"/>
      <g stroke="#d9ecff" stroke-width="5" opacity="0.6" fill="none">
        <path d="M158 286c18-52 54-84 98-96M354 286c-18-52-54-84-98-96M150 246c60 18 152 18 212 0"/>
        <path d="M204 250l14 18 22-12 20 18 22-14 18 16"/>
      </g>
      <path d="M256 116l14 26 28 4-20 20 4 28-26-14-26 14 4-28-20-20 28-4 14-26Z" fill="#ffffff" opacity="0.5"/>
      <g fill="#ffffff" opacity="0.75">
        <circle cx="190" cy="330" r="7"/><circle cx="232" cy="340" r="7"/><circle cx="274" cy="340" r="7"/><circle cx="316" cy="330" r="7"/>
      </g>`
  },
  {
    id: 'plane',
    name: 'Самолётик',
    rarity: 'rare',
    tags: ['student', 'new'],
    body: `
      <path d="M92 250L420 108l-92 300-92-118-58 62-14-92-72-10Z" fill="url(#ga-plane)"/>
      <path d="M420 108L328 408l-92-118 184-182Z" fill="url(#gb-plane)" opacity="0.85"/>
      <path d="M92 250l236-142-72 182-92-40-72-0Z" fill="#ffffff" opacity="0.3"/>
      <path d="M236 290l92 118M236 290l-58 62" stroke="#ffffff" stroke-width="7" opacity="0.6" fill="none" stroke-linejoin="round"/>
      <path d="M164 330l72-40" stroke="#ffffff" stroke-width="6" opacity="0.45" stroke-linecap="round"/>
      <path d="M320 176l40-28" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity="0.65"/>
      <path d="M96 388c34-10 62-2 84 22M60 348c30-8 54-2 74 18" stroke="#ffffff" stroke-width="7" opacity="0.35" fill="none" stroke-linecap="round"/>`
  },
  {
    id: 'heart_box',
    name: 'Сердце-шкатулка',
    rarity: 'common',
    tags: ['holiday', 'popular'],
    body: `
      <path d="M256 432C150 366 76 302 76 224c0-58 44-100 100-100 40 0 70 20 80 48 10-28 40-48 80-48 56 0 100 42 100 100 0 78-74 142-180 208Z" fill="url(#ga-heart_box)"/>
      <path d="M256 432C150 366 76 302 76 224c0-58 44-100 100-100 40 0 70 20 80 48 10-28 40-48 80-48 56 0 100 42 100 100 0 78-74 142-180 208Z" fill="none" stroke="#ffe3ea" stroke-width="5" opacity="0.5"/>
      <path d="M76 244h360" stroke="#ffd7e1" stroke-width="10" opacity="0.55"/>
      <path d="M256 174v80" stroke="#fff0f4" stroke-width="12" opacity="0.7"/>
      <path d="M256 254c-42-24-72-48-72-80 0-24 18-40 40-40 14 0 26 8 32 20 6-12 18-20 32-20 22 0 40 16 40 40 0 32-30 56-72 80Z" fill="#fff0f4" opacity="0.92"/>
      <path d="M228 254c-26-8-48-20-64-36" stroke="#ffffff" stroke-width="8" opacity="0.4" fill="none" stroke-linecap="round"/>
      <circle cx="256" cy="254" r="12" fill="#e05579"/>`
  },
  {
    id: 'black_rose',
    name: 'Чёрная роза',
    rarity: 'admin',
    tags: [],
    body: `
      <path d="M256 300c0 66-14 108-34 148" stroke="#2f5d4a" stroke-width="16" fill="none" stroke-linecap="round"/>
      <path d="M240 372c-44-18-74-4-84 30 40 14 72 2 84-30ZM262 400c40-18 70-4 80 30-40 14-70 2-80-30Z" fill="#2f5d4a"/>
      <circle cx="256" cy="196" r="122" fill="url(#ga-black_rose)"/>
      <circle cx="256" cy="196" r="122" fill="none" stroke="#c9b98a" stroke-width="4" opacity="0.5"/>
      <path d="M256 96c-44 6-74 44-70 84 4 38 34 62 70 66 36-4 66-28 70-66 4-40-26-78-70-84Z" fill="url(#gb-black_rose)"/>
      <g fill="none" stroke="#c9b98a" stroke-width="5" opacity="0.85" stroke-linecap="round">
        <path d="M256 100c-24 8-38 30-34 52 4 22 22 36 42 34 18-2 30-16 28-32-2-14-14-22-26-18-10 4-14 14-8 22"/>
        <path d="M256 132c14 2 24 14 22 28-2 14-16 22-30 18-12-4-18-16-12-26"/>
      </g>
      <path d="M256 96c22 22 26 44 20 62" stroke="#8a7c5a" stroke-width="4" fill="none" opacity="0.7"/>
      <g fill="#d9c48a">
        <path d="M140 128l5 13 13 5-13 5-5 13-5-13-13-5 13-5 5-13Z"/>
        <path d="M382 344l4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z"/>
        <circle cx="126" cy="352" r="4"/><circle cx="396" cy="140" r="4"/><circle cx="368" cy="96" r="3"/>
      </g>`
  }
];

const GIFT_BY_ID = new Map(GIFTS.map((gift) => [gift.id, gift]));

function giftArt(giftId) {
  const gift = GIFT_BY_ID.get(giftId);
  if (!gift) return '';
  if (gift.svg) return gift.svg;
  gift.svg = wrap(gift.id, gift.name, gift.body);
  return gift.svg;
}

function giftView(gift, overrides = {}) {
  return {
    id: gift.id,
    name: gift.name,
    rarity: gift.rarity,
    tags: gift.tags || [],
    price: overrides.price !== undefined ? overrides.price : gift.price,
    svg: giftArt(gift.id)
  };
}

const RARITY_PRICE = { common: 15000, rare: 35000, epic: 75000, legendary: 150000, admin: 0 };

for (const gift of GIFTS) {
  gift.price = RARITY_PRICE[gift.rarity] || 15000;
  gift.asset_key = `gift-${gift.id}`;
}

module.exports = { GIFTS, GIFT_BY_ID, giftArt, giftView, RARITY_PRICE };
