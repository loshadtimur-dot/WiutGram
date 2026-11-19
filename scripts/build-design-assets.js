'use strict';

// Builds the cached SVG sprites used by the shop and the chat emoji picker.
// Run with: node scripts/build-design-assets.js
const fs = require('fs');
const path = require('path');
const { GIFTS, giftArt } = require('../lib/design/gifts');
const { GLASS } = require('../lib/design/glass');

const OUT_DIR = path.join(__dirname, '..', 'public', 'img');

function innerSvg(svg) {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

function buildGifts() {
  const symbols = GIFTS.map((gift) => {
    const art = giftArt(gift.id);
    return `<symbol id="gift-${gift.id}" viewBox="0 0 512 512">${innerSvg(art)}</symbol>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0" style="position:absolute">
${symbols.join('\n')}
</svg>
`;
}

function buildGlass() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0" style="position:absolute">
${GLASS.map((item) => innerSvg(item.svg.replace(/^<symbol/, '<symbol').replace('</symbol>', '</symbol>'))).join('\n')}
</svg>
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const gifts = buildGifts();
  fs.writeFileSync(path.join(OUT_DIR, 'gifts-sprite.svg'), gifts, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'glass-sprite.svg'), buildGlass(), 'utf8');
  console.log(`gifts-sprite.svg: ${GIFTS.length} symbols (${Math.round(gifts.length / 1024)} KB)`);
  console.log(`glass-sprite.svg: ${GLASS.length} symbols`);
}

main();
