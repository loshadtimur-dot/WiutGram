import { api } from '../api.js?v=25';
import { el, button, openModal, toast, loadingRow, emptyState, avatarNode, formatTime } from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { getState } from '../state.js?v=25';
import { glassSvg, money } from '../components/glass.js';
import { buyItem, openPurchaseWindow } from '../components/purchase.js';

const TABS = [
  { key: '', label: 'Всё', icon: 'grid' },
  { key: 'gift', label: 'Подарки', icon: 'gift' },
  { key: 'emoji_pack', label: 'Эмодзи-наборы', icon: 'sparkles' },
  { key: 'banner', label: 'Баннеры', icon: 'image' },
  { key: 'background', label: 'Фоны', icon: 'layers' }
];

const GIFT_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'new', label: 'Новые' },
  { key: 'popular', label: 'Популярные' },
  { key: 'limited', label: 'Лимитные' },
  { key: 'holiday', label: 'Праздничные' },
  { key: 'student', label: 'Студенческие' }
];

const STATUS_LABELS = {
  new: 'Новый',
  contacted: 'Связались',
  paid: 'Оплачен',
  delivered: 'Выдан',
  cancelled: 'Отменён',
  refunded: 'Возврат'
};

function itemArt(item) {
  const art = el('div', { class: 'shop-card__art' });
  if (item.kind === 'gift') {
    art.innerHTML = item.asset && item.asset.svg ? item.asset.svg : '';
  } else if (item.kind === 'emoji_pack') {
    const icons = (item.asset && item.asset.icons) || [];
    const row = el('div', { class: 'row', style: { flexWrap: 'wrap', justifyContent: 'center', gap: '4px' } });
    for (const emoji of icons.slice(0, 4)) row.innerHTML += glassSvg(emoji.id, 26);
    art.append(row);
  } else if (item.asset) {
    const preview = el('div');
    preview.style.background = item.asset.theme;
    if (item.asset.pattern) preview.classList.add(`bg-pattern-${item.asset.pattern}`);
    art.append(preview);
  }
  return art;
}

function itemCard(item, onClick) {
  const card = el('button', {
    class: `shop-card shop-card--${item.kind}`,
    attrs: { type: 'button', 'aria-label': item.title }
  });
  card.append(itemArt(item));
  if (item.is_owner_only) card.append(el('span', { class: 'shop-card__badge', text: 'Только владельцу' }));
  else if (item.edition_limit) card.append(el('span', { class: 'shop-card__badge', text: 'Лимит' }));
  if (item.owned) card.append(el('span', { class: 'shop-card__owned', text: 'Куплено' }));
  const body = el('div', { class: 'shop-card__body' });
  body.append(el('div', { class: 'shop-card__title', text: item.title }));
  const meta = el('div', { class: 'shop-card__meta' });
  meta.append(el('span', { class: `rarity-pill rarity-pill--${item.rarity}`, text: item.rarity_label }));
  if (item.edition_limit) {
    meta.append(el('span', { class: 'people-card__meta', text: `осталось ${item.remaining} из ${item.edition_limit}` }));
  }
  body.append(meta);
  body.append(el('div', { class: 'shop-card__price', text: item.price ? money(item.price) : 'Бесплатно' }));
  card.append(body);
  card.addEventListener('click', () => onClick(item));
  return card;
}

function recipientField() {
  const wrap = el('div', { class: 'form-stack' });
  const input = el('input', { class: 'input', attrs: { placeholder: '@username получателя', maxlength: '24' } });
  const suggestions = el('div', { class: 'people-suggest' });
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      suggestions.innerHTML = '';
      const query = input.value.trim().replace(/^@/, '');
      if (query.length < 2) return;
      try {
        const data = await api.get(`/people?q=${encodeURIComponent(query)}&limit=5`);
        for (const person of data.people || []) {
          const row = el('button', { class: 'group-card', attrs: { type: 'button' }, style: { width: '100%', marginTop: '4px' } });
          row.append(avatarNode(person, 'sm'));
          const info = el('div', { style: { flex: '1', textAlign: 'left' } });
          info.append(el('div', { class: 'people-card__name', text: person.display_name }));
          info.append(el('div', { class: 'people-card__meta', text: `@${person.username}` }));
          row.append(info);
          row.addEventListener('click', () => {
            input.value = person.username;
            suggestions.innerHTML = '';
          });
          suggestions.append(row);
        }
      } catch (err) {
        // Suggestions are best-effort.
      }
    }, 250);
  });
  wrap.append(el('label', { class: 'field__label', text: 'Кому подарить' }), input, suggestions);
  return { wrap, input };
}

function openItemModal(item, refresh, prefillRecipient = '') {
  const body = el('div', { class: 'form-stack' });
  const head = el('div', { class: 'purchase__item' });
  const art = el('div', { class: 'purchase__art' });
  art.append(itemArt(item));
  const info = el('div');
  info.append(el('div', { class: 'purchase__title', text: item.title }));
  info.append(el('div', { class: 'shop-card__price', text: item.price ? money(item.price) : 'Бесплатно' }));
  if (item.description) info.append(el('div', { class: 'people-card__meta', text: item.description }));
  head.append(art, info);
  body.append(head);
  if (item.kind === 'emoji_pack' && item.asset) {
    const grid = el('div', { class: 'emoji-grid' });
    for (const emoji of item.asset.icons) {
      const cell = el('div', { class: 'emoji-button' });
      cell.innerHTML = glassSvg(emoji.id, 26);
      grid.append(cell);
    }
    body.append(grid);
  }

  let recipient = null;
  let message = null;
  let anonymous = null;
  if (item.kind === 'gift') {
    const field = recipientField();
    field.input.value = prefillRecipient;
    recipient = field.input;
    message = el('textarea', { class: 'input', attrs: { placeholder: 'Подпись к подарку (до 120 символов)', rows: '2', maxlength: '120' } });
    const check = el('input', { attrs: { type: 'checkbox' } });
    anonymous = check;
    body.append(field.wrap, el('label', { class: 'field__label', text: 'Подпись' }), message);
    body.append(el('label', { class: 'check-row' }, [check, el('span', { text: 'Скрыть отправителя' })]));
  }

  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title: item.title, body, footer, size: 'wide' });
  if (item.owned && item.kind !== 'gift') {
    footer.append(button('Уже куплено', { variant: 'btn-secondary', disabled: true }));
  } else {
    footer.append(
      button(item.price ? 'Купить' : 'Получить', {
        variant: 'btn-primary',
        onClick: async () => {
          if (item.kind === 'gift' && !recipient.value.trim()) {
            toast('Укажите получателя', 'error');
            return;
          }
          try {
            const result = await buyItem({
              api,
              item,
              recipientUsername: item.kind === 'gift' ? recipient.value.trim() : '',
              message: message ? message.value.trim() : '',
              anonymous: anonymous ? anonymous.checked : false
            });
            modal.close();
            refresh();
            return result;
          } catch (err) {
            toast(err.message || 'Не удалось создать заказ', 'error');
          }
        }
      })
    );
  }
}

function ordersView() {
  const wrap = el('div', { class: 'form-stack' });
  wrap.append(loadingRow('Загружаем заказы…'));
  api
    .get('/shop/orders/mine')
    .then((data) => {
      wrap.innerHTML = '';
      if (!data.orders.length) {
        wrap.append(emptyState('🧾', 'Заказов пока нет', 'Выберите товар в каталоге — заказ появится здесь.'));
        return;
      }
      for (const order of data.orders) {
        const card = el('div', { class: 'group-card', style: { marginBottom: '8px', alignItems: 'flex-start' } });
        const info = el('div', { style: { flex: '1', minWidth: '0' } });
        const title = el('div', { class: 'people-card__name' });
        title.append(el('span', { text: order.item ? order.item.title : 'Товар' }));
        title.append(el('span', { class: `rarity-pill rarity-pill--${order.status === 'delivered' ? 'rare' : 'common'}`, text: STATUS_LABELS[order.status] || order.status }));
        info.append(title);
        info.append(
          el('div', {
            class: 'people-card__meta',
            text: `${order.code} · ${money(order.price_total)} · ${formatTime(order.created_at)}`
          })
        );
        if (order.recipient) info.append(el('div', { class: 'people-card__meta', text: `Получатель: ${order.recipient.display_name}` }));
        info.append(el('div', { class: 'people-card__meta', text: order.status === 'delivered' ? 'Товар выдан' : 'Ожидает подтверждения оплаты владельцем' }));
        card.append(info);
        if (order.status !== 'delivered') {
          card.append(
            button('Показать окно', {
              variant: 'btn-secondary btn-sm',
              onClick: () => openPurchaseWindow({ item: order.item, order, purchase: order.purchase || {} })
            })
          );
        }
        wrap.append(card);
      }
    })
    .catch((err) => {
      wrap.innerHTML = '';
      wrap.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить заказы' }));
    });
  return wrap;
}

export default function ShopPage(ctx) {
  const root = el('div', { class: 'shop-page' });
  const head = el('div', { class: 'shop-head' });
  const headText = el('div');
  headText.append(el('h1', { text: 'Магазин' }));
  headText.append(el('p', { text: 'Подарки, стеклянные эмодзи, баннеры и фоны профиля. Оплата проходит вручную через владельца.' }));
  head.append(headText);
  root.append(head);

  const tabs = el('div', { class: 'shop-tabs' });
  root.append(tabs);

  const tools = el('div', { class: 'shop-tools' });
  const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Поиск товара' } });
  const sort = el('select', { class: 'input', style: { maxWidth: '170px' } });
  for (const [value, label] of [
    ['', 'По порядку'],
    ['price_asc', 'Сначала дешёвые'],
    ['price_desc', 'Сначала дорогие'],
    ['new', 'Новые']
  ]) {
    sort.append(el('option', { text: label, attrs: { value } }));
  }
  tools.append(search, sort);
  root.append(tools);

  const chips = el('div', { class: 'shop-chips' });
  root.append(chips);
  const gridWrap = el('div');
  root.append(gridWrap);

  let tab = TABS.some((entry) => entry.key === ctx.query.tab) ? ctx.query.tab : '';
  if (ctx.query.tab === 'orders') tab = 'orders';
  let filter = 'all';
  let query = '';
  let order = '';
  const prefill = ctx.query.to ? String(ctx.query.to).replace(/^@/, '') : '';

  function setTab(next) {
    tab = next;
    if (next === 'orders') {
      history.replaceState({}, '', '/shop?tab=orders');
    } else {
      const url = next ? `/shop?tab=${next}` : '/shop';
      history.replaceState({}, '', url);
    }
    renderTabs();
    refresh();
  }

  function renderTabs() {
    tabs.innerHTML = '';
    for (const entry of TABS) {
      const btn = el('button', {
        class: `shop-tab ${tab === entry.key ? 'is-active' : ''}`,
        attrs: { type: 'button' }
      });
      btn.innerHTML = icon(entry.icon, { size: 15 });
      btn.append(el('span', { text: entry.label }));
      btn.addEventListener('click', () => setTab(entry.key));
      tabs.append(btn);
    }
    const orders = el('button', {
      class: `shop-tab ${tab === 'orders' ? 'is-active' : ''}`,
      attrs: { type: 'button' }
    });
    orders.innerHTML = icon('file', { size: 15 });
    orders.append(el('span', { text: 'Заказы' }));
    orders.addEventListener('click', () => setTab('orders'));
    tabs.append(orders);
    tools.style.display = tab === 'orders' ? 'none' : '';
    chips.style.display = tab === '' || tab === 'gift' ? '' : 'none';
  }

  function renderChips() {
    chips.innerHTML = '';
    if (tab !== '' && tab !== 'gift') return;
    for (const entry of GIFT_FILTERS) {
      const chip = el('button', {
        class: `shop-chip ${filter === entry.key ? 'is-active' : ''}`,
        text: entry.label,
        attrs: { type: 'button' }
      });
      chip.addEventListener('click', () => {
        filter = entry.key;
        renderChips();
        loadCatalog();
      });
      chips.append(chip);
    }
  }

  async function loadCatalog() {
    gridWrap.innerHTML = '';
    gridWrap.append(loadingRow('Загружаем каталог…'));
    try {
      const params = new URLSearchParams();
      if (tab) params.set('kind', tab);
      if (query) params.set('q', query);
      if (order) params.set('sort', order);
      if (filter !== 'all') params.set('filter', filter);
      const data = await api.get(`/shop/catalog?${params.toString()}`);
      gridWrap.innerHTML = '';
      if (!data.items.length) {
        gridWrap.append(emptyState('🛍️', 'Ничего не найдено', 'Попробуйте другой фильтр или поисковый запрос.'));
        return;
      }
      const grid = el('div', { class: 'shop-grid' });
      for (const item of data.items) {
        grid.append(itemCard(item, (entry) => openItemModal(entry, () => loadCatalog(), prefill)));
      }
      gridWrap.append(grid);
      const settings = data.settings || {};
      if (settings.shop_enabled === false) {
        gridWrap.prepend(el('div', { class: 'purchase__note', text: 'Магазин временно закрыт владельцем.' }));
      }
    } catch (err) {
      gridWrap.innerHTML = '';
      gridWrap.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить каталог' }));
    }
  }

  function refresh() {
    if (tab === 'orders') {
      gridWrap.innerHTML = '';
      gridWrap.append(ordersView());
    } else {
      loadCatalog();
    }
  }

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value.trim();
      loadCatalog();
    }, 300);
  });
  sort.addEventListener('change', () => {
    order = sort.value;
    loadCatalog();
  });

  renderTabs();
  renderChips();
  refresh();

  return {
    el: root,
    cleanup() {
      clearTimeout(timer);
    }
  };
}
