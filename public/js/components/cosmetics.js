import { api } from '../api.js?v=24';
import { el, button, openModal, toast, formatNumber } from '../ui.js?v=24';

let cache = null;

export function telegramUrl(handle, text) {
  const name = String(handle || '').replace(/^@/, '');
  if (!name) return '';
  const suffix = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://t.me/${encodeURIComponent(name)}${suffix}`;
}

export async function loadCosmetics(force = false) {
  if (!cache || force) {
    const data = await api.get('/cosmetics/catalog');
    cache = { catalog: data.catalog, settings: data.settings };
  }
  return cache;
}

export function getCachedCosmetics() {
  return cache;
}

export function giftMeta(giftId) {
  if (!cache) return null;
  return cache.catalog.gifts.find((gift) => gift.id === giftId) || null;
}

export function rarityClass(rarity) {
  return `rarity-${rarity || 'common'}`;
}

export function bannerBackdrop(banner, className = '') {
  const node = el('div', { class: `profile-banner ${className} banner-pattern-${banner.pattern || 'lines'}` });
  node.style.background = banner.theme;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function badgeNode(badge, size = 'md') {
  const node = el('span', {
    class: `badge-art badge-art--${size} ${rarityClass(badge.rarity)}`,
    attrs: { title: `${badge.name}${badge.description ? ` — ${badge.description}` : ''}` }
  });
  node.innerHTML = badge.svg;
  return node;
}

export function badgePill(badge) {
  const pill = el('div', { class: `badge-pill ${rarityClass(badge.rarity)}` });
  pill.append(badgeNode(badge, 'sm'));
  const text = el('div', { class: 'badge-pill__text' });
  text.append(el('div', { class: 'badge-pill__name', text: badge.name }));
  if (badge.description) text.append(el('div', { class: 'badge-pill__desc', text: badge.description }));
  pill.append(text);
  return pill;
}

export function giftNode(gift, options = {}) {
  const { count = 0, regifted = false, size = 'md', interactive = false } = options;
  const node = el('div', {
    class: `gift-card ${rarityClass(gift.rarity)} ${size === 'sm' ? 'gift-card--sm' : ''} ${
      interactive ? 'is-interactive' : ''
    }`
  });
  if (gift.rarity === 'admin') {
    const stars = el('span', { class: 'gift-card__stars', attrs: { 'aria-hidden': 'true' } });
    for (let index = 0; index < 9; index += 1) {
      const star = el('span');
      star.style.setProperty('--i', String(index));
      stars.append(star);
    }
    node.append(stars);
  }
  const art = el('div', { class: 'gift-card__art' });
  art.innerHTML = gift.svg || '';
  node.append(art);
  node.append(el('div', { class: 'gift-card__name', text: gift.name }));
  const meta = el('div', { class: 'gift-card__meta' });
  meta.append(el('span', { class: `rarity-label ${rarityClass(gift.rarity)}`, text: gift.rarity_label || '' }));
  if (count > 1) meta.append(el('span', { class: 'gift-card__count', text: `×${count}` }));
  node.append(meta);
  if (regifted) node.append(el('span', { class: 'gift-card__regifted', text: 'переподаренный' }));
  return node;
}

// Applies a gift's rarity colour to a profile name, like Telegram's name plate.
export function applyNameGift(node, gift) {
  if (!gift) return;
  node.classList.add('name-gift', rarityClass(gift.rarity));
  if (gift.rarity === 'admin') node.classList.add('name-gift--admin');
  if (!node.querySelector('.name-gift__art')) {
    const art = el('span', { class: 'name-gift__art', attrs: { 'aria-hidden': 'true' } });
    art.innerHTML = gift.svg || '';
    node.prepend(art);
  }
}

export function unlockDialog({ kind, item, settings }) {
  const body = el('div', { class: 'stack', style: { gap: '12px' } });
  const art = el('div', { class: 'unlock-preview' });
  if (kind === 'gift') art.append(giftNode(item));
  if (kind === 'badge') art.append(badgeNode(item, 'lg'));
  if (kind === 'banner') {
    const sample = el('div', { class: 'banner-sample' });
    sample.style.background = item.theme;
    art.append(sample);
  }
  body.append(art);
  body.append(el('h3', { text: item.name }));
  if (item.description) body.append(el('p', { class: 'field__hint', text: item.description }));

  const price = kind === 'badge' ? item.price_month : item.price;
  if (kind === 'gift') {
    body.append(
      el('p', {
        class: 'field__hint',
        text:
          item.rarity === 'admin'
            ? 'Это личный подарок владельца. Его нельзя купить — только получить от администратора.'
            : `Цена: ${formatNumber(price)} сум. Подарки продаются только через администратора.`
      })
    );
  } else {
    body.append(
      el('p', {
        class: 'field__hint',
        text: `Доступ на месяц — ${formatNumber(price)} сум, на год — ${formatNumber(
          item.price_year || (kind === 'badge' ? 200000 : 200000)
        )} сум. Доступ выдаёт владелец после оплаты.`
      })
    );
  }

  const handle = settings && settings.owner_telegram;
  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title: 'Разблокировать', body, footer });
  footer.append(button('Закрыть', { variant: 'btn-ghost', onClick: () => modal.close() }));
  if (handle) {
    const text =
      kind === 'gift'
        ? `Здравствуйте! Хочу купить подарок «${item.name}» в Wiutgram.`
        : `Здравствуйте! Хочу разблокировать «${item.name}» в Wiutgram на месяц.`;
    const link = el('a', {
      class: 'btn btn-primary',
      text: 'Написать в Telegram',
      attrs: { href: telegramUrl(handle, text), target: '_blank', rel: 'noopener noreferrer' }
    });
    footer.append(link);
  } else {
    footer.append(
      el('span', { class: 'field__hint', text: 'Администратор ещё не указал Telegram — напишите ему напрямую.' })
    );
  }
  return modal;
}

export function openGiftPicker({ gifts, title = 'Подарить подарок', onPick }) {
  const body = el('div', { class: 'gift-picker' });
  if (!gifts.length) {
    body.append(
      el('p', {
        class: 'field__hint',
        text: 'В коллекции нет подарков. Их можно купить у администратора в Telegram.'
      })
    );
  }
  for (const gift of gifts) {
    const node = giftNode(gift, { count: gift.count, size: 'sm', interactive: true });
    node.addEventListener('click', () => {
      modal.close();
      onPick(gift);
    });
    body.append(node);
  }
  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title, body, footer, size: 'wide' });
  footer.append(button('Закрыть', { variant: 'btn-ghost', onClick: () => modal.close() }));
  return modal;
}

/* ---------- Cosmetics studio ---------- */

export async function openCosmeticsStudio(onChange) {
  const body = el('div', { class: 'cosmetics-studio' });
  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title: 'Косметика профиля', body, footer, size: 'wide' });
  footer.append(button('Готово', { variant: 'btn-primary', onClick: () => modal.close() }));

  async function render() {
    body.innerHTML = '';
    body.append(el('div', { class: 'cosmetics-loading', text: 'Загружаем коллекцию…' }));
    let data;
    try {
      data = await api.get('/cosmetics/me');
    } catch (err) {
      body.innerHTML = '';
      body.append(el('p', { class: 'field__hint', text: err.message || 'Не удалось загрузить косметику' }));
      return;
    }
    const { catalog, profile, settings } = data;
    body.innerHTML = '';

    /* Banners */
    body.append(el('h3', { class: 'cosmetics-title', text: 'Баннеры профиля' }));
    const bannerGrid = el('div', { class: 'banner-grid' });
    for (const banner of catalog.banners) {
      const card = el('div', { class: 'banner-card' });
      const sample = el('div', { class: `banner-sample banner-pattern-${banner.pattern || 'lines'}` });
      sample.style.background = banner.theme;
      card.append(sample);
      card.append(el('div', { class: 'banner-card__name', text: banner.name }));
      const owned = banner.owned;
      if (banner.equipped) {
        card.append(button('Снять', { variant: 'btn-ghost btn-sm', onClick: () => setBanner(null) }));
      } else if (banner.owned) {
        card.append(button('Надеть', { variant: 'btn-primary btn-sm', onClick: () => setBanner(banner.id) }));
      } else {
        card.append(
          button('Разблокировать', {
            variant: 'btn-secondary btn-sm',
            onClick: () => unlockDialog({ kind: 'banner', item: banner, settings })
          })
        );
      }
      if (owned) card.classList.add('is-owned');
      bannerGrid.append(card);
    }
    body.append(bannerGrid);

    /* Badges */
    body.append(el('h3', { class: 'cosmetics-title', text: 'Значки' }));
    body.append(
      el('p', {
        class: 'field__hint',
        text: 'Значок виден всем в профиле. Его выдаёт владелец после оплаты — 20 000 сум в месяц.'
      })
    );
    const badgeGrid = el('div', { class: 'badge-grid' });
    for (const badge of catalog.badges) {
      const tile = el('div', { class: `badge-tile ${badge.owned ? 'is-owned' : ''}` });
      tile.append(badgeNode(badge, 'lg'));
      tile.append(el('div', { class: 'badge-tile__name', text: badge.name }));
      tile.append(el('div', { class: 'badge-tile__desc', text: badge.description }));
      if (badge.owned) {
        tile.append(el('span', { class: 'badge-tile__status', text: 'Ваш значок' }));
      } else {
        tile.append(
          button('Разблокировать', {
            variant: 'btn-secondary btn-sm',
            onClick: () => unlockDialog({ kind: 'badge', item: badge, settings })
          })
        );
      }
      badgeGrid.append(tile);
    }
    body.append(badgeGrid);

    /* Gifts */
    body.append(el('h3', { class: 'cosmetics-title', text: 'Подарки' }));
    const owned = catalog.gifts.filter((gift) => gift.count > 0);
    if (!owned.length) {
      body.append(
        el('p', {
          class: 'field__hint',
          text: 'Пока нет подарков. Подарки покупаются только через администратора в Telegram — их можно дарить и переподаривать.'
        })
      );
    } else {
      const giftGrid = el('div', { class: 'gift-grid' });
      for (const gift of owned) {
        const tile = el('div', { class: 'gift-tile' });
        tile.append(giftNode(gift, { count: gift.count, regifted: gift.has_regifted }));
        const actions = el('div', { class: 'gift-tile__actions' });
        if (profile.equipped_gift && profile.equipped_gift.gift_id === gift.id) {
          actions.append(button('Снять фон', { variant: 'btn-ghost btn-sm', onClick: () => setGift(null) }));
        } else {
          actions.append(button('На имя', { variant: 'btn-secondary btn-sm', onClick: () => setGift(gift.id) }));
        }
        actions.append(
          button(gift.is_hidden ? 'Показать' : 'Скрыть', {
            variant: 'btn-ghost btn-sm',
            onClick: () => hideGift(gift.id, !gift.is_hidden)
          })
        );
        actions.append(
          button('Переподарить', {
            variant: 'btn-ghost btn-sm',
            onClick: () => openRegift(gift)
          })
        );
        tile.append(actions);
        giftGrid.append(tile);
      }
      body.append(giftGrid);
    }
  }

  async function setBanner(bannerId) {
    try {
      await api.post('/cosmetics/banner', { banner_id: bannerId });
      toast(bannerId ? 'Баннер обновлён' : 'Баннер снят', 'success');
      await render();
      if (onChange) onChange();
    } catch (err) {
      toast(err.message || 'Не удалось обновить баннер', 'error');
    }
  }

  async function setGift(giftId) {
    try {
      await api.post('/cosmetics/gift/equip', { gift_id: giftId });
      toast(giftId ? 'Подарок поставлен на имя' : 'Фон имени снят', 'success');
      await render();
      if (onChange) onChange();
    } catch (err) {
      toast(err.message || 'Не удалось обновить подарок', 'error');
    }
  }

  async function hideGift(giftId, hidden) {
    try {
      await api.post('/cosmetics/gift/hide', { gift_id: giftId, hidden });
      await render();
      if (onChange) onChange();
    } catch (err) {
      toast(err.message || 'Не удалось обновить подарок', 'error');
    }
  }

  function openRegift(gift) {
    const wrap = el('div', { class: 'stack', style: { gap: '10px' } });
    wrap.append(el('p', { class: 'field__hint', text: 'Введите username получателя. Подарок появится в его профиле с пометкой «переподаренный».' }));
    const input = el('input', { class: 'input', attrs: { placeholder: 'username', autocomplete: 'off' } });
    wrap.append(input);
    const row = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
    const inner = openModal({ title: `Переподарить «${gift.name}»`, body: wrap, footer: row });
    row.append(button('Отмена', { variant: 'btn-ghost', onClick: () => inner.close() }));
    row.append(
      button('Подарить', {
        variant: 'btn-primary',
        onClick: async () => {
          try {
            const result = await api.post('/cosmetics/gift/regift', {
              gift_id: gift.id,
              username: input.value.trim()
            });
            inner.close();
            toast(`Подарок отправлен @${result.username}`, 'success');
            await render();
            if (onChange) onChange();
          } catch (err) {
            toast(err.message || 'Не удалось переподарить', 'error');
          }
        }
      })
    );
  }

  await render();
  return modal;
}
