import { api } from '../api.js?v=21';
import { el } from '../ui.js?v=21';
import { icon } from '../icons.js?v=21';
import { formatSum } from '../ads-utils.js?v=21';

// Renders the paid banner (or the house fallback) for one placement.
// Returns a controller with destroy() so pages can clean timers up.

export function mountAdBanner(host, placement) {
  if (!host) return { destroy() {} };
  let disposed = false;
  let hourTimer = null;
  let pollTimer = null;
  let observer = null;
  let viewTimer = null;
  let countedKey = null;
  let currentHour = null;

  host.classList.add('ad-slot-host', `ad-slot-host--${placement}`);
  const slot = el('div', { class: `ad-slot ad-slot--${placement}` });
  slot.append(el('div', { class: 'ad-slot__skeleton' }));
  host.append(slot);

  function clearTimers() {
    if (hourTimer) clearTimeout(hourTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (viewTimer) clearTimeout(viewTimer);
    if (observer) observer.disconnect();
    hourTimer = null;
    pollTimer = null;
    viewTimer = null;
    observer = null;
  }

  function schedule() {
    if (disposed) return;
    hourTimer = setTimeout(() => {
      load();
    }, 3600000 + 1500);
    pollTimer = setInterval(() => load(), 5 * 60 * 1000);
  }

  function hide() {
    host.hidden = true;
    host.innerHTML = '';
    slot.remove();
  }

  function infoPopover() {
    const wrap = el('div', { class: 'ad-info' });
    const button = el('button', {
      class: 'ad-badge ad-badge--info',
      attrs: { type: 'button', 'aria-label': 'О рекламе' }
    });
    button.innerHTML = icon('info', { size: 13 });
    const pop = el('div', { class: 'ad-info__pop', attrs: { role: 'dialog', 'aria-label': 'О рекламе' } });
    pop.append(el('p', { text: 'Это реклама. Хотите разместить свою?' }));
    pop.append(el('a', { text: 'Разместить рекламу', attrs: { href: '/advertise' } }));
    const close = el('button', {
      class: 'ad-info__close',
      attrs: { type: 'button', 'aria-label': 'Закрыть' }
    });
    close.innerHTML = icon('x', { size: 14 });
    pop.append(close);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const open = pop.classList.toggle('is-open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      pop.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    });
    wrap.append(button, pop);
    return wrap;
  }

  function observeImpression(campaignId, hourStart) {
    const key = `${campaignId}:${placement}:${hourStart}`;
    if (countedKey === key) return;
    const send = () => {
      if (countedKey === key) return;
      countedKey = key;
      api.post('/ads/impression', { campaign_id: campaignId, placement }).catch(() => {});
    };
    if (!('IntersectionObserver' in window)) {
      send();
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!viewTimer) viewTimer = setTimeout(send, 1000);
          } else if (viewTimer) {
            clearTimeout(viewTimer);
            viewTimer = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    observer.observe(slot);
  }

  function renderBanner(data) {
    slot.innerHTML = '';
    slot.classList.remove('ad-slot--house');
    slot.classList.add('ad-slot--paid');

    const media = data.click_url
      ? el('a', {
          class: 'ad-slot__media',
          attrs: {
            href: `/api/ads/click/${data.campaign_id}?p=${placement}`,
            target: '_blank',
            rel: 'noopener noreferrer sponsored',
            'aria-label': data.alt || 'Реклама'
          }
        })
      : el('div', { class: 'ad-slot__media' });

    const image = el('img', {
      attrs: {
        src: data.image_url,
        alt: data.alt || 'Реклама',
        loading: 'lazy',
        decoding: 'async',
        width: '1600',
        height: '400'
      }
    });
    image.addEventListener('error', () => hide());
    media.append(image);

    const badge = el('span', { class: 'ad-badge', text: 'Реклама' });
    slot.append(media, badge, infoPopover());
    observeImpression(data.campaign_id, data.hour_start);
  }

  function renderHouse(data) {
    slot.innerHTML = '';
    slot.classList.remove('ad-slot--paid');
    slot.classList.add('ad-slot--house');
    const link = el('a', {
      class: 'ad-house',
      attrs: { href: data.advertise_url || '/advertise', 'aria-label': data.title || 'Разместить рекламу' }
    });
    const text = el('div', { class: 'ad-house__text' });
    text.append(el('strong', { text: data.title || 'Здесь может быть ваша реклама' }));
    text.append(el('span', { text: data.text || 'Студенты Ташкента увидят ваш баннер' }));
    link.append(text);
    link.append(el('span', { class: 'ad-house__price', text: `от ${formatSum(data.price_per_hour)}/час` }));
    const arrow = el('span', { class: 'ad-house__arrow' });
    arrow.innerHTML = icon('chevronRight', { size: 16 });
    link.append(arrow);
    slot.append(link, el('span', { class: 'ad-badge ad-badge--soft', text: 'Реклама' }));
  }

  async function load() {
    if (disposed) return;
    try {
      const data = await api.get(`/ads/active?placement=${placement}`);
      if (disposed) return;
      currentHour = data.hour_start;
      host.hidden = false;
      if (data.mode === 'banner') renderBanner(data);
      else if (data.mode === 'house') renderHouse(data);
      else hide();
      clearTimers();
      schedule();
    } catch (err) {
      if (!disposed) hide();
    }
  }

  load();

  return {
    destroy() {
      disposed = true;
      clearTimers();
      host.innerHTML = '';
      host.hidden = true;
    },
    refresh: load,
    get hour() {
      return currentHour;
    }
  };
}

// Small reusable preview used by the owner panel.
export function bannerPreviewNode(url, alt = 'Реклама') {
  const wrap = el('div', { class: 'ad-preview' });
  const img = el('img', { attrs: { src: url, alt, loading: 'lazy' } });
  wrap.append(img, el('span', { class: 'ad-badge', text: 'Реклама' }));
  return wrap;
}
