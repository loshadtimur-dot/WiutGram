import { api } from '../../api.js?v=25';
import { el, button, openModal, toast, formatNumber } from '../../ui.js?v=25';
import { icon } from '../../icons.js?v=25';
import { sectionHead, emptyState, sudoConfirm, fmtDateTime } from './shared.js?v=25';

const KINDS = {
  gift: 'Подарки',
  emoji_pack: 'Эмодзи-наборы',
  banner: 'Баннеры',
  background: 'Фоны'
};
const STATUS = {
  new: 'Новые',
  contacted: 'Связались',
  paid: 'Оплачены',
  delivered: 'Выданы',
  cancelled: 'Отменены',
  refunded: 'Возвраты'
};
const RARITIES = ['common', 'rare', 'epic', 'legendary'];

function orderCard(order, refresh) {
  const card = el('div', { class: 'admin-card', style: { padding: '12px', marginBottom: '8px' } });
  const row = el('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap' } });
  const left = el('div');
  const title = el('div', { style: { fontWeight: '700' } });
  title.append(el('span', { text: order.item ? order.item.title : 'Товар' }));
  title.append(el('span', { class: 'people-card__meta', text: ` · ${order.code}` }));
  left.append(title);
  left.append(
    el('div', {
      class: 'people-card__meta',
      text: `${STATUS[order.status]} · ${formatNumber(order.price_total)} сум · ${fmtDateTime(order.created_at)}`
    })
  );
  left.append(
    el('div', {
      class: 'people-card__meta',
      text: `Покупатель: ${order.buyer ? `@${order.buyer.username}` : '—'}${
        order.recipient ? ` → @${order.recipient.username}` : ''
      }${order.is_anonymous ? ' · скрытый отправитель' : ''}`
    })
  );
  if (order.message) left.append(el('div', { class: 'people-card__meta', text: `Подпись: «${order.message}»` }));
  if (order.note) left.append(el('div', { class: 'people-card__meta', text: `Заметка: ${order.note}` }));
  row.append(left);
  const actions = el('div', { class: 'row', style: { flexWrap: 'wrap' } });
  if (order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'refunded') {
    actions.append(
      button('Подтвердить оплату и выдать', {
        variant: 'btn-primary btn-sm',
        onClick: async () => {
          try {
            await api.post(`/admin/shop/orders/${order.id}/fulfill`, {});
            toast('Товар выдан', 'success');
            refresh();
          } catch (err) {
            toast(err.message || 'Не удалось выдать', 'error');
          }
        }
      })
    );
    actions.append(
      button('Отменить', {
        variant: 'btn-ghost btn-sm',
        onClick: async () => {
          try {
            await api.post(`/admin/shop/orders/${order.id}/status`, { status: 'cancelled' });
            toast('Заказ отменён');
            refresh();
          } catch (err) {
            toast(err.message || 'Ошибка', 'error');
          }
        }
      })
    );
  }
  if (order.status === 'delivered') {
    actions.append(
      button('Возврат', {
        variant: 'btn-ghost btn-sm',
        onClick: async () => {
          try {
            await api.post(`/admin/shop/orders/${order.id}/status`, { status: 'refunded' });
            toast('Возврат отмечен');
            refresh();
          } catch (err) {
            toast(err.message || 'Ошибка', 'error');
          }
        }
      })
    );
  }
  if (order.buyer) {
    actions.append(
      el('a', {
        class: 'btn btn-ghost btn-sm',
        text: 'Telegram',
        attrs: {
          href: `https://t.me/${order.buyer.username}`,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    );
  }
  row.append(actions);
  card.append(row);
  return card;
}

function ordersTab(refreshAll) {
  const wrap = el('div');
  const statuses = el('div', { class: 'shop-chips', style: { marginBottom: '10px' } });
  const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Код, покупатель, товар' } });
  const list = el('div');
  let status = 'new';
  let query = '';
  let timer = null;

  function renderChips() {
    statuses.innerHTML = '';
    for (const [key, label] of [['', 'Все'], ...Object.entries(STATUS)]) {
      const chip = el('button', { class: `shop-chip ${status === key ? 'is-active' : ''}`, text: label, attrs: { type: 'button' } });
      chip.addEventListener('click', () => {
        status = key;
        renderChips();
        load();
      });
      statuses.append(chip);
    }
  }

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (query) params.set('q', query);
      const data = await api.get(`/admin/shop/orders?${params.toString()}`);
      list.innerHTML = '';
      if (!data.orders.length) {
        list.append(emptyState('Заказов нет'));
        return;
      }
      for (const order of data.orders)
        list.append(
          orderCard(order, () => {
            load();
            refreshAll();
            document.dispatchEvent(new CustomEvent('admin:badges'));
          })
        );
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить заказы'));
    }
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value.trim();
      load();
    }, 300);
  });
  wrap.append(statuses, search, list);
  renderChips();
  load();
  return wrap;
}

function catalogTab() {
  const wrap = el('div');
  const tools = el('div', { class: 'row', style: { marginBottom: '10px', flexWrap: 'wrap' } });
  const kindFilter = el('select', { class: 'input', style: { maxWidth: '190px' } });
  kindFilter.append(el('option', { text: 'Все категории', attrs: { value: '' } }));
  for (const [key, label] of Object.entries(KINDS)) kindFilter.append(el('option', { text: label, attrs: { value: key } }));
  tools.append(kindFilter);
  tools.append(button('Добавить товар', { variant: 'btn-primary btn-sm', icon: 'plus', onClick: () => createItemModal(load) }));
  const list = el('div');

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      const data = await api.get(`/admin/shop/items${kindFilter.value ? `?kind=${kindFilter.value}` : ''}`);
      list.innerHTML = '';
      if (!data.items.length) {
        list.append(emptyState('Товаров нет'));
        return;
      }
      for (const item of data.items) {
        const card = el('div', { class: 'admin-card', style: { padding: '10px', marginBottom: '6px' } });
        const row = el('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } });
        const info = el('div', { style: { flex: '1', minWidth: '200px' } });
        info.append(el('div', { style: { fontWeight: '700' }, text: `${item.title} · ${KINDS[item.kind]}` }));
        info.append(
          el('div', {
            class: 'people-card__meta',
            text: `${item.slug} · ${formatNumber(item.price)} сум · ${item.rarity_label}${
              item.edition_limit ? ` · осталось ${item.remaining} из ${item.edition_limit}` : ''
            }${item.is_active ? '' : ' · скрыт'}`
          })
        );
        row.append(info);
        const actions = el('div', { class: 'row' });
        actions.append(
          button('Цена', {
            variant: 'btn-ghost btn-sm',
            onClick: () => editPrice(item, load)
          }),
          button(item.is_active ? 'Скрыть' : 'Показать', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              try {
                await api.put(`/admin/shop/items/${item.id}`, { is_active: !item.is_active });
                load();
              } catch (err) {
                toast(err.message || 'Ошибка', 'error');
              }
            }
          }),
          button('Выдать', {
            variant: 'btn-secondary btn-sm',
            onClick: () => grantModal(item, load)
          })
        );
        row.append(actions);
        card.append(row);
        list.append(card);
      }
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить каталог'));
    }
  }

  kindFilter.addEventListener('change', load);
  wrap.append(tools, list);
  load();
  return wrap;
}

function editPrice(item, refresh) {
  const body = el('div', { class: 'col', style: { gap: '8px' } });
  const price = el('input', { class: 'input', attrs: { type: 'number', min: '0', value: String(item.price) } });
  const rarity = el('select', { class: 'input' });
  for (const value of RARITIES) {
    rarity.append(el('option', { text: value, attrs: { value, selected: item.rarity === value ? 'selected' : null } }));
  }
  body.append(el('label', { class: 'field__label', text: 'Цена в сумах' }), price);
  body.append(el('label', { class: 'field__label', text: 'Редкость' }), rarity);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: item.title, body, footer });
  footer.append(
    button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }),
    button('Сохранить', {
      variant: 'btn-primary',
      onClick: async () => {
        try {
          await api.put(`/admin/shop/items/${item.id}`, { price: Number(price.value), rarity: rarity.value });
          toast('Сохранено', 'success');
          modal.close();
          refresh();
        } catch (err) {
          toast(err.message || 'Ошибка', 'error');
        }
      }
    })
  );
}

function createItemModal(refresh) {
  const body = el('div', { class: 'col', style: { gap: '8px' } });
  const title = el('input', { class: 'input', attrs: { placeholder: 'Название' } });
  const slug = el('input', { class: 'input', attrs: { placeholder: 'slug (латиница)' } });
  const kind = el('select', { class: 'input' });
  for (const [key, label] of Object.entries(KINDS)) kind.append(el('option', { text: label, attrs: { value: key } }));
  const asset = el('input', { class: 'input', attrs: { placeholder: 'asset_key, например gift-teddy' } });
  const price = el('input', { class: 'input', attrs: { type: 'number', min: '0', value: '0' } });
  const edition = el('input', { class: 'input', attrs: { type: 'number', min: '1', placeholder: 'Лимит издания (пусто = без лимита)' } });
  const description = el('textarea', { class: 'input', attrs: { rows: '2', placeholder: 'Описание' } });
  const tags = el('input', { class: 'input', attrs: { placeholder: 'Теги через запятую: new, limited' } });
  body.append(
    el('label', { class: 'field__label', text: 'Название' }),
    title,
    el('label', { class: 'field__label', text: 'Slug' }),
    slug,
    el('label', { class: 'field__label', text: 'Категория' }),
    kind,
    el('label', { class: 'field__label', text: 'Ассет' }),
    asset,
    el('label', { class: 'field__label', text: 'Цена' }),
    price,
    el('label', { class: 'field__label', text: 'Лимит' }),
    edition,
    el('label', { class: 'field__label', text: 'Описание' }),
    description,
    el('label', { class: 'field__label', text: 'Теги' }),
    tags
  );
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Новый товар', body, footer, size: 'wide' });
  footer.append(
    button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }),
    button('Создать', {
      variant: 'btn-primary',
      onClick: async () => {
        try {
          await api.post('/admin/shop/items', {
            title: title.value.trim(),
            slug: slug.value.trim(),
            kind: kind.value,
            asset_key: asset.value.trim(),
            price: Number(price.value) || 0,
            edition_limit: edition.value ? Number(edition.value) : null,
            description: description.value.trim(),
            tags: tags.value.split(',').map((tag) => tag.trim()).filter(Boolean)
          });
          toast('Товар создан', 'success');
          modal.close();
          refresh();
        } catch (err) {
          toast(err.message || 'Не удалось создать', 'error');
        }
      }
    })
  );
}

function grantModal(item, refresh) {
  const body = el('div', { class: 'col', style: { gap: '8px' } });
  const username = el('input', { class: 'input', attrs: { placeholder: '@username' } });
  const message = el('input', { class: 'input', attrs: { placeholder: 'Подпись (необязательно)' } });
  const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
  body.append(
    el('p', { class: 'field__hint', text: `Выдать «${item.title}» бесплатно. Действие попадёт в журнал.` }),
    username,
    message,
    password
  );
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Ручная выдача', body, footer });
  footer.append(
    button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }),
    button('Выдать', {
      variant: 'btn-primary',
      onClick: async () => {
        try {
          await api.post('/admin/reauth', { password: password.value });
          await api.post('/admin/shop/grant', {
            username: username.value.trim(),
            item_id: item.id,
            message: message.value.trim()
          });
          toast('Выдано', 'success');
          modal.close();
          refresh();
        } catch (err) {
          toast(err.message || 'Не удалось выдать', 'error');
        }
      }
    })
  );
  return modal;
}

function analyticsTab() {
  const wrap = el('div');
  wrap.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
  api
    .get('/admin/shop/stats')
    .then((data) => {
      wrap.innerHTML = '';
      const cards = el('div', { class: 'admin-stats' });
      for (const [label, value] of [
        ['Выручка', `${formatNumber(data.revenue)} сум`],
        ['Выдано заказов', String(data.delivered)],
        ['Новых', String(data.statuses.new || 0)],
        ['Оплачено, ждёт выдачи', String(data.statuses.paid || 0)]
      ]) {
        const card = el('div', { class: 'admin-stat' });
        card.append(el('div', { class: 'admin-stat__value', text: value }));
        card.append(el('div', { class: 'admin-stat__label', text: label }));
        cards.append(card);
      }
      wrap.append(cards);
      wrap.append(
        el('div', { class: 'row', style: { margin: '12px 0' } }, [
          el('a', {
            class: 'btn btn-secondary btn-sm',
            text: 'Экспорт CSV',
            attrs: { href: '/api/admin/shop/orders.csv', target: '_blank', rel: 'noopener' }
          })
        ])
      );
      if (data.top.length) {
        const table = el('div', { class: 'admin-card', style: { padding: '10px' } });
        table.append(el('div', { style: { fontWeight: '700', marginBottom: '6px' }, text: 'Популярные товары' }));
        for (const row of data.top) {
          table.append(
            el('div', {
              class: 'people-card__meta',
              text: `${row.title} · ${row.orders} заказов · ${formatNumber(row.revenue)} сум`
            })
          );
        }
        wrap.append(table);
      }
    })
    .catch((err) => {
      wrap.innerHTML = '';
      wrap.append(emptyState(err.message || 'Не удалось загрузить аналитику'));
    });
  return wrap;
}

export default async function ShopAdmin() {
  const root = el('div');
  const refreshAll = () => render();
  const head = sectionHead('Магазин', 'Каталог, заказы, ручная выдача и выручка.');
  root.append(head);
  const tabs = el('div', { class: 'shop-tabs', style: { marginBottom: '12px' } });
  const content = el('div');
  root.append(tabs, content);
  let active = 'orders';

  function render() {
    tabs.innerHTML = '';
    for (const [key, label] of [
      ['orders', 'Заказы'],
      ['catalog', 'Каталог'],
      ['analytics', 'Аналитика']
    ]) {
      const tab = el('button', { class: `shop-tab ${active === key ? 'is-active' : ''}`, text: label, attrs: { type: 'button' } });
      tab.addEventListener('click', () => {
        active = key;
        render();
      });
      tabs.append(tab);
    }
    content.innerHTML = '';
    content.append(
      active === 'orders' ? ordersTab(refreshAll) : active === 'catalog' ? catalogTab() : analyticsTab()
    );
    const badge = el('span', { class: 'people-card__meta', text: 'Новые заказы приходят с бейджем в меню.' });
    content.append(badge);
  }

  render();
  api.get('/admin/shop/badge').then((data) => {
    if (data.new_orders) {
      head.append(el('span', { class: 'admin-nav__badge', text: String(data.new_orders) }));
    }
  }).catch(() => {});
  return root;
}
