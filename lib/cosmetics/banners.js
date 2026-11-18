'use strict';

// Profile banners. Each one is pure CSS so it stays sharp on every screen.
// `theme` drives the card background, `accent` is used for the banner name.
const BANNERS = [
  {
    id: 'wiut_night',
    name: 'WIUT Night',
    description: 'Ночной кампус и огни Ташкента',
    theme: 'linear-gradient(120deg, #0b1224 0%, #16284d 45%, #2b4a8b 100%)',
    accent: '#8ab4ff',
    pattern: 'stars'
  },
  {
    id: 'pink_aurora',
    name: 'Pink Aurora',
    description: 'Мягкое северное сияние',
    theme: 'linear-gradient(130deg, #2a0b2e 0%, #7a1355 50%, #ff5fa2 100%)',
    accent: '#ffd0e6',
    pattern: 'aurora'
  },
  {
    id: 'black_gold',
    name: 'Black & Gold',
    description: 'Строгий чёрный с золотом',
    theme: 'linear-gradient(135deg, #09090b 0%, #1c1608 55%, #40320c 100%)',
    accent: '#f5c85c',
    pattern: 'lines'
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    description: 'Глубина и спокойствие',
    theme: 'linear-gradient(140deg, #041b2d 0%, #0a4f6e 55%, #13a4b8 100%)',
    accent: '#a8f0ff',
    pattern: 'waves'
  },
  {
    id: 'sunset',
    name: 'Tashkent Sunset',
    description: 'Тёплый закат над городом',
    theme: 'linear-gradient(120deg, #2b0a2e 0%, #a1246b 45%, #ff9d4d 100%)',
    accent: '#ffe0b8',
    pattern: 'sun'
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Изумрудный градиент',
    theme: 'linear-gradient(140deg, #032018 0%, #0a5f45 55%, #2bd39a 100%)',
    accent: '#ccffe9',
    pattern: 'grid'
  },
  {
    id: 'violet_dream',
    name: 'Violet Dream',
    description: 'Фиолетовая дымка',
    theme: 'linear-gradient(130deg, #1a0b33 0%, #4b1d8f 55%, #a06bff 100%)',
    accent: '#e6d6ff',
    pattern: 'bokeh'
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Минимализм в серых тонах',
    theme: 'linear-gradient(135deg, #101114 0%, #2a2d33 55%, #565b63 100%)',
    accent: '#f2f3f5',
    pattern: 'lines'
  },
  {
    id: 'cherry',
    name: 'Cherry Blossom',
    description: 'Нежные лепестки',
    theme: 'linear-gradient(130deg, #3d0b1f 0%, #a62b56 55%, #ffb3c7 100%)',
    accent: '#fff0f4',
    pattern: 'petals'
  },
  {
    id: 'cyber',
    name: 'Cyber Grid',
    description: 'Неон и цифровая сетка',
    theme: 'linear-gradient(135deg, #05010f 0%, #1a0640 50%, #05c8ff 100%)',
    accent: '#9df6ff',
    pattern: 'grid'
  },
  {
    id: 'sand',
    name: 'Desert Sand',
    description: 'Тёплые пески и дюны',
    theme: 'linear-gradient(135deg, #3a2410 0%, #a97840 55%, #f0cfa0 100%)',
    accent: '#fff3dd',
    pattern: 'waves'
  },
  {
    id: 'admin_obsidian',
    name: 'Obsidian',
    description: 'Закрытый баннер владельца',
    theme: 'linear-gradient(135deg, #000000 0%, #0d0d12 50%, #1d1d27 100%)',
    accent: '#f4d58a',
    pattern: 'stars',
    adminOnly: true
  }
];

module.exports = { BANNERS };
