// Shared access to the generated SVG sprites (gifts and glass emoji).
const SPRITE = '/img/glass-sprite.svg';
const GIFT_SPRITE = '/img/gifts-sprite.svg';

export function glassSvg(id, size = 24) {
  if (!id) return '';
  return `<svg class="glass-emoji" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><use href="${SPRITE}#glass-${id}"></use></svg>`;
}

export function giftSvg(giftId, size = '100%') {
  const id = String(giftId || '').replace(/^gift-/, '');
  const style = size === '100%' ? '' : ` style="width:${size}px;height:${size}px"`;
  return `<svg class="gift-sprite"${style} viewBox="0 0 512 512" aria-hidden="true"><use href="${GIFT_SPRITE}#gift-${id}"></use></svg>`;
}

export function glassNode(id, size = 24) {
  const span = document.createElement('span');
  span.className = 'glass-emoji-wrap';
  span.innerHTML = glassSvg(id, size);
  return span;
}

export function giftNode(giftId, size = '100%') {
  const span = document.createElement('span');
  span.className = 'gift-sprite-wrap';
  span.style.display = 'block';
  span.innerHTML = giftSvg(giftId, size);
  return span;
}

export function statusInline(status, options = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'status-bubble';
  if (!status) return wrap;
  wrap.innerHTML = glassSvg(status.emoji, options.size || 17);
  wrap.append(document.createTextNode(status.text || status.name || ''));
  wrap.title = `${status.name}${status.text ? ` — ${status.text}` : ''}`;
  return wrap;
}

// Time in Tashkent, used by gift cards and message metadata.
export function tashkentDate(iso, withTime = true) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  });
}

export function money(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
}
