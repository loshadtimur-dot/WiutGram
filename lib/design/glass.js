'use strict';

// Glass emoji artwork: translucent gradient fill, a 1px inner white outline,
// a mirrored highlight arc and a soft coloured glow. 48 icons in four packs
// (16 free, 16 classic, 8 study, 8 cosmos).

const TONES = {
  rose: ['#ffe0ea', '#ff6f9c', '#c0205a'],
  violet: ['#efe4ff', '#a273ff', '#5b2bb5'],
  blue: ['#dff2ff', '#5cb3f5', '#1a6fb5'],
  teal: ['#dbfff7', '#4fd6bd', '#117f6c'],
  green: ['#e2ffdc', '#7bd45f', '#2f8a2a'],
  gold: ['#fff8d6', '#f7c948', '#a8720a'],
  orange: ['#ffe9d4', '#ff9e4a', '#b15410'],
  red: ['#ffdede', '#ff6b6b', '#b32020'],
  slate: ['#e8edf6', '#93a4c0', '#43536e'],
  mint: ['#e8fff4', '#7de3b0', '#22845a']
};

function glass(id, name, pack, keywords, toneName, body, extra = '') {
  const [light, base, dark] = TONES[toneName];
  const shapes = body.replace(/url\(#g\)/g, `url(#gg-${id})`);
  return `<symbol id="glass-${id}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="gg-${id}" x1="12" y1="4" x2="54" y2="62">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="0.24" stop-color="${light}" stop-opacity="0.92"/>
      <stop offset="0.62" stop-color="${base}" stop-opacity="0.86"/>
      <stop offset="1" stop-color="${dark}" stop-opacity="0.97"/>
    </linearGradient>
    <linearGradient id="gr-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.15"/>
      <stop offset="1" stop-color="${light}" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="gs-${id}" x="-45%" y="-45%" width="190%" height="195%">
      <feDropShadow dx="0" dy="2.4" stdDeviation="2.6" flood-color="${dark}" flood-opacity="0.45"/>
    </filter>
    <filter id="gl-${id}" x="-55%" y="-55%" width="210%" height="215%">
      <feGaussianBlur stdDeviation="4.4"/>
    </filter>
  </defs>
  <g fill="${base}" opacity="0.42" filter="url(#gl-${id})">${shapes}</g>
  <g filter="url(#gs-${id})">
    <g fill="url(#gg-${id})" stroke="url(#gr-${id})" stroke-opacity="0.9" stroke-width="1.3" stroke-linejoin="round">${shapes}</g>
    ${extra}
  </g>
  <ellipse cx="23" cy="17" rx="12" ry="6.5" fill="#ffffff" opacity="0.42" transform="rotate(-28 23 17)"/>
  <ellipse cx="43" cy="47" rx="7" ry="4" fill="#ffffff" opacity="0.16" transform="rotate(-22 43 47)"/>
</symbol>`;
}

const LIST = [
  /* ---------- Base pack: free for everyone ---------- */
  ['heart', 'Сердце', 'base', 'любовь сердце', 'rose', '<path d="M32 55C19 45 7 36 7 24c0-7 6-13 13-13 5 0 9 3 12 8 3-5 7-8 12-8 7 0 13 6 13 13 0 12-12 21-25 31Z"/>'],
  ['star', 'Звезда', 'base', 'звезда рейтинг', 'gold', '<path d="M32 6l7.6 17L58 24.6 44.4 37l3.4 17.8L32 46l-15.8 8.8L19.6 37 6 24.6 24.4 23 32 6Z"/>'],
  ['sparkles', 'Искры', 'base', 'искры блеск', 'gold', '<path d="M26 6l4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12Z"/><path d="M46 34l2.6 7.4L56 44l-7.4 2.6L46 54l-2.6-7.4L36 44l7.4-2.6L46 34Z"/>'],
  ['smile', 'Улыбка', 'base', 'улыбка смайл', 'gold', '<circle cx="32" cy="32" r="24"/>', '<circle cx="24" cy="26" r="2.6" fill="#5a3c05"/><circle cx="40" cy="26" r="2.6" fill="#5a3c05"/><path d="M22 38c3 6 7 9 10 9s7-3 10-9" fill="none" stroke="#5a3c05" stroke-width="3" stroke-linecap="round"/>'],
  ['wink', 'Подмигивание', 'base', 'подмигивание', 'gold', '<circle cx="32" cy="32" r="24"/>', '<path d="M20 27h8" stroke="#5a3c05" stroke-width="3" stroke-linecap="round"/><circle cx="41" cy="27" r="2.6" fill="#5a3c05"/><path d="M22 38c3 6 7 9 10 9s7-3 10-9" fill="none" stroke="#5a3c05" stroke-width="3" stroke-linecap="round"/>'],
  ['cool', 'Крутой', 'base', 'очки крутой', 'slate', '<circle cx="32" cy="32" r="24"/>', '<rect x="13" y="23" width="17" height="11" rx="4" fill="#26303f" opacity=".85"/><rect x="34" y="23" width="17" height="11" rx="4" fill="#26303f" opacity=".85"/><path d="M30 27h4M13 26l-3-3M51 26l3-3" stroke="#26303f" stroke-width="2.4" stroke-linecap="round"/><path d="M23 42c4 4 14 4 18 0" stroke="#26303f" stroke-width="3" fill="none" stroke-linecap="round"/>'],
  ['wave', 'Привет', 'base', 'рука привет', 'orange', '<path d="M20 42c-6-8-9-14-9-18 0-3 2-5 5-5s4 2 6 6l4 7V14c0-3 2-5 5-5s5 2 5 5v13l2-9c1-3 3-4 5-3s3 3 2 6l-3 12v11c0 8-6 14-14 14-4 0-7-2-8-6Z"/>'],
  ['thumbsup', 'Класс', 'base', 'палец вверх лайк', 'blue', '<path d="M12 29h10v26H12a3 3 0 0 1-3-3V32a3 3 0 0 1 3-3Zm10 0 10-17c1-2 3-3 5-2 5 2 7 7 6 13l-1 6h10c4 0 6 3 5 7l-4 15c-1 3-3 4-6 4H22V29Z"/>'],
  ['clap', 'Аплодисменты', 'base', 'аплодисменты хлопки', 'orange', '<path d="M14 30c-2-6 1-11 6-12 4-1 7 2 8 6l2 8-3-13c-1-5 2-8 6-8s6 3 7 8l2 12-1-12c0-4 3-7 6-6 4 1 5 4 5 9l-1 16c0 8-5 13-13 13-7 0-12-4-15-10l-6-8c-2-3-2-5-1-7Z"/>'],
  ['eyes', 'Глаза', 'base', 'глаза смотрю', 'violet', '<ellipse cx="19" cy="32" rx="10" ry="13"/><ellipse cx="45" cy="32" rx="10" ry="13"/>', '<circle cx="19" cy="32" r="4" fill="#2b1740"/><circle cx="45" cy="32" r="4" fill="#2b1740"/><circle cx="21" cy="29" r="1.6" fill="#fff"/><circle cx="47" cy="29" r="1.6" fill="#fff"/>'],
  ['hearteyes', 'Влюблён', 'base', 'влюблен глаза сердце', 'rose', '<circle cx="32" cy="32" r="24"/>', '<path d="M15 26c0-3 2-5 5-5 2 0 3 1 4 3 1-2 2-3 4-3 3 0 5 2 5 5 0 4-5 7-9 10-4-3-9-6-9-10Z" fill="#d81e5b"/><path d="M31 26c0-3 2-5 5-5 2 0 3 1 4 3 1-2 2-3 4-3 3 0 5 2 5 5 0 4-5 7-9 10-4-3-9-6-9-10Z" fill="#d81e5b"/><path d="M24 43c4 4 12 4 16 0" stroke="#7a1030" stroke-width="3" fill="none" stroke-linecap="round"/>'],
  ['bolt', 'Молния', 'base', 'молния энергия', 'gold', '<path d="M36 4 12 36h14l-4 24 26-34H33l3-22Z"/>'],
  ['coffee', 'Кофе', 'base', 'кофе чашка', 'orange', '<path d="M10 20h34v20c0 8-6 14-14 14h-6c-8 0-14-6-14-14V20Z"/>', '<path d="M44 24h5c5 0 8 4 8 9s-3 9-8 9h-5" fill="none" stroke="#8a4a12" stroke-width="4"/><path d="M18 12c-2-4 2-6 0-10M28 12c-2-4 2-6 0-10M38 12c-2-4 2-6 0-10" stroke="#fff" stroke-width="2.4" opacity=".6" fill="none" stroke-linecap="round"/>'],
  ['book', 'Книга', 'base', 'книга учеба', 'blue', '<path d="M6 14c8-4 16-4 26 2v34c-10-6-18-6-26-2V14Z"/><path d="M58 14c-8-4-16-4-26 2v34c10-6 18-6 26-2V14Z"/>', '<path d="M32 18v32" stroke="#dbe7ff" stroke-width="2"/><path d="M12 24c5-1 9 0 13 2M12 32c5-1 9 0 13 2M52 24c-5-1-9 0-13 2M52 32c-5-1-9 0-13 2" stroke="#dbe7ff" stroke-width="2" opacity=".7" fill="none"/>'],
  ['music', 'Музыка', 'base', 'музыка нота', 'violet', '<path d="M24 44V14l26-6v28"/><circle cx="18" cy="46" r="9"/><circle cx="44" cy="38" r="9"/>'],
  ['gift', 'Подарок', 'base', 'подарок коробка', 'rose', '<rect x="8" y="22" width="48" height="34" rx="4"/><rect x="5" y="14" width="54" height="12" rx="3"/>', '<rect x="27" y="14" width="10" height="42" fill="#fff" opacity=".55"/><path d="M32 14c-8-2-14-7-14-12 0-4 5-5 8-2s5 8 6 14Zm0 0c8-2 14-7 14-12 0-4-5-5-8-2s-5 8-6 14Z" fill="#fff" opacity=".7"/>'],

  /* ---------- Classic pack ---------- */
  ['gamepad', 'Геймпад', 'classic', 'игры геймпад', 'violet', '<path d="M14 22h36c9 0 14 8 14 18s-4 16-11 16c-5 0-8-3-11-7l-2-3H24l-2 3c-3 4-6 7-11 7-7 0-11-6-11-16s5-18 14-18Z"/>', '<path d="M19 32v10M14 37h10" stroke="#3a1d70" stroke-width="3.4" stroke-linecap="round"/><circle cx="44" cy="34" r="3" fill="#3a1d70"/><circle cx="50" cy="40" r="3" fill="#3a1d70"/>'],
  ['laptop', 'Ноутбук', 'classic', 'ноутбук работа', 'slate', '<rect x="10" y="12" width="44" height="30" rx="3"/><path d="M4 44h56l-4 8H8l-4-8Z"/>', '<rect x="16" y="18" width="32" height="18" rx="2" fill="#fff" opacity=".35"/>'],
  ['plane', 'Самолёт', 'classic', 'самолет путешествие', 'blue', '<path d="M6 32 58 10 40 56l-8-16-10 8 2-14L6 32Z"/>'],
  ['sun', 'Солнце', 'classic', 'солнце день', 'orange', '<circle cx="32" cy="32" r="14"/>', '<g stroke="#e08a10" stroke-width="3.4" stroke-linecap="round"><path d="M32 4v7M32 53v7M4 32h7M53 32h7M12 12l5 5M47 47l5 5M52 12l-5 5M17 47l-5 5"/></g>'],
  ['moon', 'Луна', 'classic', 'луна ночь', 'violet', '<path d="M40 6a26 26 0 1 0 0 52A30 30 0 0 1 40 6Z"/>', '<circle cx="24" cy="22" r="2" fill="#fff" opacity=".6"/><circle cx="20" cy="36" r="2.6" fill="#fff" opacity=".5"/>'],
  ['cloud', 'Облако', 'classic', 'облако погода', 'blue', '<path d="M18 48c-8 0-14-5-14-12s6-12 14-12c2-8 9-13 17-11 7 2 11 7 12 14 7 1 11 5 11 11 0 6-5 10-12 10H18Z"/>'],
  ['rainbow', 'Радуга', 'classic', 'радуга цвета', 'rose', '<path d="M6 48a26 26 0 0 1 52 0h-9a17 17 0 0 0-34 0H6Z"/><path d="M15 48a17 17 0 0 1 34 0h-8a9 9 0 0 0-18 0h-8Z" fill="#fff" opacity=".55"/>'],
  ['pizza', 'Пицца', 'classic', 'пицца еда', 'orange', '<path d="M32 6 58 54c-16 10-36 10-52 0L32 6Z"/>', '<circle cx="32" cy="26" r="4" fill="#c93030"/><circle cx="24" cy="40" r="4" fill="#c93030"/><circle cx="41" cy="42" r="4" fill="#c93030"/><path d="M12 51c13 7 27 7 40 0" stroke="#fff" stroke-width="2" opacity=".4" fill="none"/>'],
  ['cat', 'Кот', 'classic', 'кот кошка', 'orange', '<path d="M12 20 8 6l16 8h16l16-8-4 14c4 6 6 12 6 18 0 12-12 20-26 20S6 50 6 38c0-6 2-12 6-18Z"/>', '<circle cx="23" cy="36" r="3" fill="#5a3208"/><circle cx="41" cy="36" r="3" fill="#5a3208"/><path d="M29 43h6l-3 3-3-3Z" fill="#5a3208"/><path d="M32 46v3M26 47c1 3 3 4 6 4M38 47c-1 3-3 4-6 4" stroke="#5a3208" stroke-width="2" fill="none" stroke-linecap="round"/>'],
  ['dog', 'Пёс', 'classic', 'собака пес', 'orange', '<path d="M14 30c0-12 8-20 18-20s18 8 18 20v10c0 10-8 16-18 16s-18-6-18-16V30Z"/><path d="M14 24c-8-4-10 4-8 12s6 12 10 10M50 24c8-4 10 4 8 12s-6 12-10 10" fill="#a85c1c"/>', '<circle cx="25" cy="34" r="3" fill="#4a2405"/><circle cx="39" cy="34" r="3" fill="#4a2405"/><ellipse cx="32" cy="43" rx="4" ry="3" fill="#4a2405"/><path d="M32 46v3M28 49c1 2 2.5 2.6 4 2.6M36 49c-1 2-2.5 2.6-4 2.6" stroke="#4a2405" stroke-width="2" fill="none" stroke-linecap="round"/>'],
  ['ghost', 'Привидение', 'classic', 'призрак привидение', 'slate', '<path d="M10 54V30a22 22 0 0 1 44 0v24l-7-6-7 6-8-6-8 6-7-6-7 6Z"/>', '<circle cx="24" cy="30" r="3" fill="#35405a"/><circle cx="40" cy="30" r="3" fill="#35405a"/><ellipse cx="32" cy="39" rx="4" ry="5" fill="#35405a" opacity=".7"/>'],
  ['rocket', 'Ракета', 'classic', 'ракета космос', 'slate', '<path d="M32 4c11 9 16 21 16 34 0 8-2 15-6 21H22c-4-6-6-13-6-21C16 25 21 13 32 4Z"/><path d="M16 38c-7 5-10 12-10 20 7-1 12-5 14-10M48 38c7 5 10 12 10 20-7-1-12-5-14-10" fill="#46536b"/>', '<circle cx="32" cy="30" r="7" fill="#d8f2ff"/><circle cx="32" cy="30" r="3.6" fill="#4a6b8f"/>'],
  ['diamond', 'Алмаз', 'classic', 'алмаз камень', 'blue', '<path d="M32 6l22 18-22 34L10 24 32 6Z"/><path d="M10 24h44L32 58 10 24Z" fill="#fff" opacity=".22"/>', '<path d="M32 6v18M10 24h44M22 24l10 34 10-34" stroke="#fff" stroke-width="1.6" opacity=".65" fill="none"/>'],
  ['crown', 'Корона', 'classic', 'корона премиум', 'gold', '<path d="M8 20l12 10 12-18 12 18 12-10-5 30H13L8 20Z"/><path d="M13 50h38l3 8H10l3-8Z"/>', '<circle cx="20" cy="31" r="3" fill="#b32020"/><circle cx="32" cy="26" r="3.4" fill="#2f66c9"/><circle cx="44" cy="31" r="3" fill="#22845a"/>'],
  ['snowflake', 'Снежинка', 'classic', 'снежинка зима', 'blue', '<path d="M32 4v56M7 18l50 28M57 18 7 46"/>', '<path d="M32 12l-5-5M32 12l5-5M32 52l-5 5M32 52l5 5M14 23l-7-1M14 23l1-7M50 41l7 1M50 41l-1 7M50 23l7-1M50 23l-1-7M14 41l-7 1M14 41l1 7" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>'],
  ['flower', 'Цветок', 'classic', 'цветок весна', 'rose', '<circle cx="32" cy="14" r="10"/><circle cx="50" cy="27" r="10"/><circle cx="43" cy="48" r="10"/><circle cx="21" cy="48" r="10"/><circle cx="14" cy="27" r="10"/><circle cx="32" cy="32" r="9"/>', '<circle cx="32" cy="32" r="4.4" fill="#fff" opacity=".7"/>'],

  /* ---------- Study pack ---------- */
  ['graduation', 'Выпускная шапка', 'study', 'учеба выпуск диплом', 'slate', '<path d="M32 10 62 26 32 42 2 26 32 10Z"/><path d="M14 34v12c0 6 8 10 18 10s18-4 18-10V34l-18 9-18-9Z"/>', '<path d="M54 28v14" stroke="#fff" stroke-width="2.4"/><circle cx="54" cy="45" r="3" fill="#fff"/>'],
  ['trophy', 'Кубок', 'study', 'кубок победа', 'gold', '<path d="M18 10h28v14c0 10-6 18-14 18s-14-8-14-18V10Z"/><path d="M18 14c-8 0-11 5-10 11s6 11 14 10M46 14c8 0 11 5 10 11s-6 11-14 10" fill="none" stroke="#c58a0a" stroke-width="4"/><path d="M28 42h8v8h-8z"/><path d="M20 50h24l3 8H17l3-8Z"/>'],
  ['lightbulb', 'Идея', 'study', 'идея лампочка', 'gold', '<path d="M32 6c11 0 19 8 19 18 0 7-4 11-7 15-2 2-3 4-3 7H23c0-3-1-5-3-7-3-4-7-8-7-15C13 14 21 6 32 6Z"/><path d="M24 50h16l-1 8H25l-1-8Z"/>', '<path d="M26 30c0-4 3-7 6-7" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>'],
  ['chat', 'Чат', 'study', 'чат сообщение', 'blue', '<path d="M6 12h52v32c0 3-2 5-5 5H24L10 58V49H11c-3 0-5-2-5-5V12Z"/>', '<circle cx="21" cy="29" r="3" fill="#173a5c"/><circle cx="32" cy="29" r="3" fill="#173a5c"/><circle cx="43" cy="29" r="3" fill="#173a5c"/>'],
  ['mail', 'Письмо', 'study', 'письмо почта', 'teal', '<rect x="6" y="14" width="52" height="36" rx="4"/>', '<path d="M6 18l26 18 26-18" fill="none" stroke="#0d5a50" stroke-width="2.6" stroke-linejoin="round"/>'],
  ['target', 'Цель', 'study', 'цель мишень', 'red', '<circle cx="32" cy="32" r="26"/>', '<circle cx="32" cy="32" r="16" fill="#fff" opacity=".65"/><circle cx="32" cy="32" r="7" fill="#b32020"/>'],
  ['clock', 'Время', 'study', 'время часы', 'slate', '<circle cx="32" cy="32" r="26"/>', '<path d="M32 16v16l11 7" stroke="#2c374a" stroke-width="3.4" fill="none" stroke-linecap="round"/>'],
  ['magnifier', 'Поиск', 'study', 'поиск лупа', 'blue', '<circle cx="27" cy="27" r="18"/><rect x="38" y="40" width="20" height="10" rx="5" transform="rotate(45 38 40)"/>', '<path d="M18 22c2-5 6-8 11-9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>'],

  /* ---------- Cosmos pack ---------- */
  ['planet', 'Планета', 'cosmos', 'планета космос', 'violet', '<circle cx="32" cy="32" r="18"/>', '<ellipse cx="32" cy="34" rx="29" ry="9" fill="none" stroke="#e6d6ff" stroke-width="3" opacity=".85" transform="rotate(-18 32 34)"/><circle cx="26" cy="27" r="4" fill="#fff" opacity=".35"/>'],
  ['comet', 'Комета', 'cosmos', 'комета космос', 'blue', '<circle cx="46" cy="18" r="11"/><path d="M39 26C28 34 18 44 6 56c14-4 26-12 38-24l-5-6Z"/>'],
  ['satellite', 'Спутник', 'cosmos', 'спутник космос', 'slate', '<rect x="24" y="24" width="16" height="16" rx="3"/><rect x="4" y="26" width="16" height="12" rx="2"/><rect x="44" y="26" width="16" height="12" rx="2"/>', '<path d="M20 32h4M40 32h4" stroke="#fff" stroke-width="2"/><path d="M32 24V14M26 12h12" stroke="#8fa4c4" stroke-width="2.4"/><circle cx="32" cy="9" r="3" fill="#8fa4c4"/>'],
  ['telescope', 'Телескоп', 'cosmos', 'телескоп астрономия', 'teal', '<path d="M10 24 48 8l8 18L18 42 10 24Z"/><rect x="22" y="40" width="8" height="14" rx="3"/><path d="M14 54h22" stroke="#117f6c" stroke-width="4" stroke-linecap="round"/>', '<circle cx="52" cy="16" r="5" fill="#fff" opacity=".6"/>'],
  ['alien', 'Пришелец', 'cosmos', 'пришелец нло', 'green', '<ellipse cx="32" cy="30" rx="20" ry="24"/><path d="M18 48l-4 12 10-6M46 48l4 12-10-6" fill="#3f9a58"/>', '<ellipse cx="23" cy="30" rx="6" ry="8" fill="#1d4a26"/><ellipse cx="41" cy="30" rx="6" ry="8" fill="#1d4a26"/><circle cx="25" cy="27" r="2" fill="#fff"/><circle cx="43" cy="27" r="2" fill="#fff"/>'],
  ['crystal', 'Кристалл', 'cosmos', 'кристалл магия', 'violet', '<path d="M32 4l16 18-6 38H22l-6-38L32 4Z"/><path d="M32 4v56M10 22h44" stroke="#fff" stroke-width="1.6" opacity=".5" fill="none"/>'],
  ['orbit', 'Орбита', 'cosmos', 'орбита планета', 'blue', '<circle cx="32" cy="32" r="10"/>', '<ellipse cx="32" cy="32" rx="27" ry="12" fill="none" stroke="#dff2ff" stroke-width="2.6" opacity=".85"/><circle cx="56" cy="26" r="4" fill="#fff" opacity=".9"/>'],
  ['aurora', 'Сияние', 'cosmos', 'сияние северное', 'teal', '<path d="M6 44c8-26 18-38 26-38s10 12 8 22c-2 8-2 14 4 20-14 4-26 4-38-4Z"/><path d="M32 50c10-20 16-28 22-28 4 0 6 4 4 10-2 8-8 16-18 22l-8-4Z" fill="#b9f5e3" opacity=".7"/>']
];

const GLASS = LIST.map(([id, name, pack, keywords, tone, body, extra]) => ({
  id,
  name,
  pack,
  keywords,
  svg: glass(id, name, pack, keywords, tone, body, extra)
}));

const GLASS_BY_ID = new Map(GLASS.map((item) => [item.id, item]));

const GLASS_PACKS = [
  {
    id: 'base',
    slug: 'emoji-base',
    title: 'Базовый набор',
    description: 'Сердца, звёзды и улыбки — доступны всем бесплатно.',
    price: 0,
    rarity: 'common',
    free: true,
    items: GLASS.filter((item) => item.pack === 'base').map((item) => item.id)
  },
  {
    id: 'classic',
    slug: 'emoji-classic',
    title: 'Classic',
    description: 'Игры, музыка, путешествия и любимые эмодзи.',
    price: 45000,
    rarity: 'rare',
    items: GLASS.filter((item) => item.pack === 'classic').map((item) => item.id)
  },
  {
    id: 'study',
    slug: 'emoji-study',
    title: 'Student',
    description: 'Учёба, дедлайны и маленькие победы.',
    price: 35000,
    rarity: 'common',
    items: GLASS.filter((item) => item.pack === 'study').map((item) => item.id)
  },
  {
    id: 'cosmos',
    slug: 'emoji-cosmos',
    title: 'Cosmos',
    description: 'Планеты, кристаллы и северное сияние.',
    price: 75000,
    rarity: 'epic',
    items: GLASS.filter((item) => item.pack === 'cosmos').map((item) => item.id)
  }
];

function glassView(item) {
  return { id: item.id, name: item.name, pack: item.pack, svg: item.svg };
}

module.exports = { GLASS, GLASS_BY_ID, GLASS_PACKS, glassView };
