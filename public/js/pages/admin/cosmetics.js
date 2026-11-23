import { api } from '../../api.js?v=31';
import { el, button, toast, formatNumber } from '../../ui.js?v=31';
import { sectionHead, emptyState } from './shared.js?v=31';
import { badgeNode, giftNode } from '../../components/cosmetics.js?v=31';

const DURATIONS = [
  ['1', 'на месяц'],
  ['12', 'на год'],
  ['0', 'навсегда']
];

export default async function cosmeticsSection() {
  const root = el('div', { class: 'admin-section' });
  let data;
  try {
    data = await api.get('/admin/cosmetics/overview');
  } catch (err) {
    root.append(sectionHead('Косметика', 'Баннеры, значки и подарки'));
    root.append(emptyState(err.message || 'Не удалось загрузить косметику'));
    return root;
  }

  root.append(
    sectionHead(
      'Косметика',
      'Значки и баннеры выдаются на месяц или год, подарки — навсегда. Всё видно в профиле пользователя.'
    )
  );

  /* ---------- Grant cards ---------- */
  const grants = el('div', { class: 'admin-grid admin-grid--3' });

  /* Badge */
  const badgeCard = el('div', { class: 'admin-card' });
  badgeCard.append(el('h3', { text: 'Выдать значок' }));
  badgeCard.append(el('p', { class: 'field__hint', text: 'Введите username и выберите значок.' }));
  const badgeUser = el('input', { class: 'input', attrs: { placeholder: 'username' } });
  const badgeSelect = el('select', { class: 'select' });
  data.catalog.badges.forEach((badge) => badgeSelect.append(el('option', { text: badge.name, attrs: { value: badge.id } })));
  const badgeDuration = el('select', { class: 'select' });
  DURATIONS.forEach(([value, label]) => badgeDuration.append(el('option', { text: label, attrs: { value } })));
  const badgeGrant = button('Выдать значок', { variant: 'btn-primary' });
  badgeGrant.addEventListener('click', async () => {
    badgeGrant.disabled = true;
    try {
      const result = await api.post('/admin/cosmetics/grant/badge', {
        username: badgeUser.value.trim(),
        badge_id: badgeSelect.value,
        months: Number(badgeDuration.value)
      });
      toast(`Значок «${result.badge}» выдан @${result.username}`, 'success');
      badgeUser.value = '';
    } catch (err) {
      toast(err.message || 'Не удалось выдать значок', 'error');
    } finally {
      badgeGrant.disabled = false;
    }
  });
  badgeCard.append(badgeUser, badgeSelect, badgeDuration, badgeGrant);
  grants.append(badgeCard);

  /* Banner */
  const bannerCard = el('div', { class: 'admin-card' });
  bannerCard.append(el('h3', { text: 'Выдать баннер' }));
  bannerCard.append(el('p', { class: 'field__hint', text: 'Баннер показывается в шапке профиля.' }));
  const bannerUser = el('input', { class: 'input', attrs: { placeholder: 'username' } });
  const bannerSelect = el('select', { class: 'select' });
  data.catalog.banners.forEach((banner) => bannerSelect.append(el('option', { text: banner.name, attrs: { value: banner.id } })));
  const bannerDuration = el('select', { class: 'select' });
  DURATIONS.forEach(([value, label]) => bannerDuration.append(el('option', { text: label, attrs: { value } })));
  const bannerGrant = button('Выдать баннер', { variant: 'btn-primary' });
  bannerGrant.addEventListener('click', async () => {
    bannerGrant.disabled = true;
    try {
      const result = await api.post('/admin/cosmetics/grant/banner', {
        username: bannerUser.value.trim(),
        banner_id: bannerSelect.value,
        months: Number(bannerDuration.value)
      });
      toast(`Баннер «${result.banner}» выдан @${result.username}`, 'success');
      bannerUser.value = '';
    } catch (err) {
      toast(err.message || 'Не удалось выдать баннер', 'error');
    } finally {
      bannerGrant.disabled = false;
    }
  });
  bannerCard.append(bannerUser, bannerSelect, bannerDuration, bannerGrant);
  grants.append(bannerCard);

  /* Gift */
  const giftCard = el('div', { class: 'admin-card' });
  giftCard.append(el('h3', { text: 'Подарить подарок' }));
  giftCard.append(el('p', { class: 'field__hint', text: 'У владельца подарки безлимитные: выдавайте любое количество.' }));
  const giftUser = el('input', { class: 'input', attrs: { placeholder: 'username' } });
  const giftSelect = el('select', { class: 'select' });
  data.catalog.gifts.forEach((gift) =>
    giftSelect.append(el('option', { text: `${gift.name} · ${gift.rarity_label}`, attrs: { value: gift.id } }))
  );
  const giftQuantity = el('input', {
    class: 'input',
    attrs: { type: 'number', min: '1', max: '100', value: '1' }
  });
  const giftGrant = button('Подарить', { variant: 'btn-primary' });
  giftGrant.addEventListener('click', async () => {
    giftGrant.disabled = true;
    try {
      const result = await api.post('/admin/cosmetics/grant/gift', {
        username: giftUser.value.trim(),
        gift_id: giftSelect.value,
        quantity: Number(giftQuantity.value) || 1
      });
      toast(`«${result.gift}» ×${result.created} отправлено @${result.username}`, 'success');
      giftUser.value = '';
      giftQuantity.value = '1';
    } catch (err) {
      toast(err.message || 'Не удалось подарить подарок', 'error');
    } finally {
      giftGrant.disabled = false;
    }
  });
  giftCard.append(giftUser, giftSelect, giftQuantity, giftGrant);
  grants.append(giftCard);

  root.append(grants);

  /* ---------- Settings ---------- */
  const settingsCard = el('div', { class: 'admin-card' });
  settingsCard.append(el('h3', { text: 'Продажи и Telegram' }));
  settingsCard.append(
    el('p', {
      class: 'field__hint',
      text: 'Кнопка «Разблокировать» у пользователей ведёт в ваш Telegram. Без username она покажет подсказку.'
    })
  );
  const telegramInput = el('input', {
    class: 'input',
    attrs: { placeholder: '@wiut_admin', value: data.settings.owner_telegram || '' }
  });
  const toggles = el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '14px' } });
  const toggleDefs = [
    ['banners_enabled', 'Баннеры'],
    ['badges_enabled', 'Значки'],
    ['gifts_enabled', 'Подарки']
  ];
  const toggleInputs = {};
  for (const [key, label] of toggleDefs) {
    const wrap = el('label', { class: 'checkbox' });
    const input = el('input', { attrs: { type: 'checkbox' } });
    input.checked = !!data.settings[key];
    toggleInputs[key] = input;
    wrap.append(input, el('span', { text: label }));
    toggles.append(wrap);
  }
  const saveSettings = button('Сохранить настройки', { variant: 'btn-primary' });
  saveSettings.addEventListener('click', async () => {
    saveSettings.disabled = true;
    try {
      const result = await api.put('/admin/cosmetics/settings', {
        owner_telegram: telegramInput.value.trim(),
        banners_enabled: toggleInputs.banners_enabled.checked,
        badges_enabled: toggleInputs.badges_enabled.checked,
        gifts_enabled: toggleInputs.gifts_enabled.checked
      });
      telegramInput.value = result.settings.owner_telegram || '';
      toast('Настройки сохранены', 'success');
    } catch (err) {
      toast(err.message || 'Не удалось сохранить', 'error');
    } finally {
      saveSettings.disabled = false;
    }
  });
  settingsCard.append(telegramInput, toggles, saveSettings);
  root.append(settingsCard);

  /* ---------- Gift prices and rarities ---------- */
  const priceCard = el('div', { class: 'admin-card' });
  priceCard.append(el('h3', { text: 'Подарки: редкость и цена' }));
  priceCard.append(el('p', { class: 'field__hint', text: 'Меняйте редкость и цену — витрина обновится сразу.' }));
  const giftSearch = el('input', {
    class: 'input',
    attrs: { type: 'search', placeholder: 'Найти подарок', 'aria-label': 'Поиск подарка' },
    style: { maxWidth: '320px' }
  });
  const table = el('div', { class: 'admin-table' });
  const giftRows = [];
  const head = el('div', { class: 'admin-table__row admin-table__head' });
  head.append(
    el('span', { text: 'Подарок' }),
    el('span', { text: 'Редкость' }),
    el('span', { text: 'Цена, сум' }),
    el('span', { text: '' })
  );
  table.append(head);
  for (const gift of data.catalog.gifts) {
    const row = el('div', { class: 'admin-table__row' });
    const art = el('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } });
    const mini = el('div', { style: { width: '34px', height: '34px' } });
    mini.innerHTML = gift.svg;
    art.append(mini, el('span', { text: gift.name }));
    const rarity = el('select', { class: 'select' });
    Object.values(data.rarities).forEach((item) =>
      rarity.append(el('option', { text: item.label, attrs: { value: item.id } }))
    );
    rarity.value = gift.rarity;
    const price = el('input', { class: 'input', attrs: { type: 'number', min: '0', value: String(gift.price || 0) } });
    const save = button('Сохранить', { variant: 'btn-secondary btn-sm' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api.put(`/admin/cosmetics/gifts/${gift.id}`, {
          rarity: rarity.value,
          price: Number(price.value) || 0
        });
        toast(`«${gift.name}» обновлён`, 'success');
      } catch (err) {
        toast(err.message || 'Не удалось сохранить', 'error');
      } finally {
        save.disabled = false;
      }
    });
    row.append(art, rarity, price, save);
    giftRows.push({ row, text: `${gift.name} ${gift.slug || ''}`.toLowerCase() });
    table.append(row);
  }
  giftSearch.addEventListener('input', () => {
    const query = giftSearch.value.trim().toLowerCase();
    for (const entry of giftRows) entry.row.classList.toggle('hidden', !!query && !entry.text.includes(query));
  });
  priceCard.append(giftSearch, table);
  root.append(priceCard);

  /* ---------- Recent grants ---------- */
  const recent = el('div', { class: 'admin-card' });
  recent.append(el('h3', { text: 'Последние выдачи' }));
  if (!data.recent_badges.length && !data.recent_gifts.length) {
    recent.append(el('p', { class: 'field__hint', text: 'Пока ничего не выдано.' }));
  }
  for (const grant of data.recent_badges.slice(0, 8)) {
    const badge = data.catalog.badges.find((item) => item.id === grant.badge_id);
    const row = el('div', { class: 'admin-grant-row' });
    if (badge) row.append(badgeNode(badge, 'sm'));
    row.append(
      el('span', {
        text: `@${grant.username} — ${badge ? badge.name : grant.badge_id}${
          grant.expires_at ? ` до ${new Date(grant.expires_at).toLocaleDateString('ru-RU')}` : ' навсегда'
        }`
      })
    );
    recent.append(row);
  }
  for (const grant of data.recent_gifts.slice(0, 8)) {
    const gift = data.catalog.gifts.find((item) => item.id === grant.gift_id);
    if (!gift) continue;
    const row = el('div', { class: 'admin-grant-row' });
    row.append(giftNode(gift, { size: 'sm' }));
    row.append(el('span', { text: `@${grant.username} — ${gift.name}` }));
    recent.append(row);
  }
  root.append(recent);

  /* ---------- Search a user ---------- */
  const lookupCard = el('div', { class: 'admin-card' });
  lookupCard.append(el('h3', { text: 'Косметика пользователя' }));
  lookupCard.append(el('p', { class: 'field__hint', text: 'Введите username, чтобы увидеть его значки, баннеры и подарки.' }));
  const lookupInput = el('input', { class: 'input', attrs: { placeholder: 'username' } });
  const lookupResult = el('div', { class: 'col', style: { gap: '10px' } });
  const lookupBtn = button('Показать', { variant: 'btn-secondary' });
  lookupBtn.addEventListener('click', async () => {
    lookupBtn.disabled = true;
    lookupResult.innerHTML = '';
    try {
      const result = await api.get(`/admin/cosmetics/users/${encodeURIComponent(lookupInput.value.trim())}`);
      lookupResult.append(
        el('div', {
          style: { fontWeight: '700' },
          text: `${result.user.display_name} (@${result.user.username}) · подписчиков: ${result.profile.follow.followers}`
        })
      );
      const badges = el('div', { class: 'profile-badges' });
      result.profile.badges.forEach((badge) => badges.append(badgeNode(badge, 'sm')));
      if (!result.profile.badges.length) badges.append(el('span', { class: 'field__hint', text: 'Значков нет' }));
      lookupResult.append(badges);
      if (result.profile.banner) {
        const sample = el('div', { class: 'banner-sample' });
        sample.style.background = result.profile.banner.theme;
        lookupResult.append(sample);
      }
      if (result.inventory.length) {
        const gifts = el('div', { class: 'profile-gifts__grid' });
        result.inventory.forEach((gift) =>
          gifts.append(giftNode(gift, { count: gift.count, regifted: gift.has_regifted, size: 'sm' }))
        );
        lookupResult.append(gifts);
      }
      lookupResult.append(
        el('div', { class: 'field__hint', text: `Всего подарков: ${result.inventory.reduce((sum, g) => sum + g.count, 0)}` })
      );
    } catch (err) {
      lookupResult.append(el('p', { class: 'field__hint', text: err.message || 'Пользователь не найден' }));
    } finally {
      lookupBtn.disabled = false;
    }
  });
  lookupCard.append(lookupInput, lookupBtn, lookupResult);
  root.append(lookupCard);

  const stats = el('div', { class: 'admin-stats-grid' });
  for (const [label, value] of [
    ['Значков выдано', data.stats.badges_granted],
    ['Баннеров выдано', data.stats.banners_granted],
    ['Подарков выдано', data.stats.gifts_granted],
    ['Подписок', data.stats.followers]
  ]) {
    const card = el('div', { class: 'admin-stat' });
    card.append(el('div', { class: 'admin-stat__value', text: formatNumber(value) }));
    card.append(el('div', { class: 'admin-stat__label', text: label }));
    stats.append(card);
  }
  root.append(stats);

  return root;
}
