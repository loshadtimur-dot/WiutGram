import { api } from '../../api.js?v=19';
import { el, button, toast, openModal } from '../../ui.js?v=19';
import { sectionHead, emptyState, fmtDateTime } from './shared.js?v=19';

const FILTERS = [
  ['', 'Все'],
  ['new', 'Новые'],
  ['approved', 'Начислены'],
  ['rejected', 'Отклонены']
];

const STATUS_LABELS = {
  new: 'Ожидает оплаты',
  approved: 'Начислено',
  rejected: 'Отклонено',
  cancelled: 'Отменено'
};

function formatSum(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
}

export default async function superlikesSection() {
  let filter = 'new';
  let orders = [];
  let settings = null;

  const root = el('div', { class: 'col', style: { gap: '14px' } });
  root.append(
    sectionHead(
      'Суперлайки',
      'Заявки на покупку пакета суперлайков и настройки цены. Оплата подтверждается вручную.'
    )
  );

  /* ---------- Package settings ---------- */
  const settingsCard = el('div', { class: 'card card-pad', style: { display: 'grid', gap: '12px' } });
  const settingsTitle = el('h3', { text: 'Пакет и оплата', style: { margin: 0 } });
  settingsCard.append(settingsTitle);
  const settingsGrid = el('div', { class: 'field-row-3' });
  const quantityField = el('label', { class: 'field' });
  quantityField.append(el('span', { class: 'field__label', text: 'Суперлайков в пакете' }));
  const quantityInput = el('input', { class: 'input', attrs: { type: 'number', min: '1', max: '1000', step: '1' } });
  quantityField.append(quantityInput);
  const priceField = el('label', { class: 'field' });
  priceField.append(el('span', { class: 'field__label', text: 'Цена пакета, сум' }));
  const priceInput = el('input', { class: 'input', attrs: { type: 'number', min: '0', max: '100000000', step: '1000' } });
  priceField.append(priceInput);
  const telegramField = el('label', { class: 'field' });
  telegramField.append(el('span', { class: 'field__label', text: 'Telegram для оплаты' }));
  const telegramInput = el('input', { class: 'input', attrs: { type: 'text', placeholder: 'uni_lovers_pay', maxlength: '32' } });
  telegramField.append(telegramInput);
  settingsGrid.append(quantityField, priceField, telegramField);
  settingsCard.append(settingsGrid);

  const noteField = el('label', { class: 'field' });
  noteField.append(el('span', { class: 'field__label', text: 'Инструкция по оплате' }));
  const noteInput = el('textarea', { class: 'textarea', attrs: { rows: '2', maxlength: '400' } });
  noteField.append(noteInput);
  settingsCard.append(noteField);

  const settingsRow = el('div', { class: 'row', style: { alignItems: 'center', gap: '12px', flexWrap: 'wrap' } });
  const enabledLabel = el('label', { class: 'checkbox' });
  const enabledInput = el('input', { attrs: { type: 'checkbox' } });
  enabledLabel.append(enabledInput, el('span', { text: 'Продажа включена' }));
  settingsRow.append(enabledLabel);
  const saveSettings = button('Сохранить настройки', {
    variant: 'btn-primary',
    onClick: async () => {
      saveSettings.disabled = true;
      try {
        const result = await api.put('/admin/superlikes/settings', {
          superlikes_enabled: enabledInput.checked,
          superlikes_quantity: Number(quantityInput.value),
          superlikes_price: Number(priceInput.value),
          superlikes_telegram: telegramInput.value.trim(),
          superlikes_payment_note: noteInput.value.trim()
        });
        settings = result.settings;
        toast('Настройки сохранены', 'success');
      } catch (err) {
        toast(err.message || 'Не удалось сохранить настройки', 'error');
      } finally {
        saveSettings.disabled = false;
      }
    }
  });
  settingsRow.append(saveSettings);
  settingsCard.append(settingsRow);
  root.append(settingsCard);

  /* ---------- Orders ---------- */
  const filters = el('div', { class: 'segmented' });
  const list = el('div', { class: 'ads-list' });
  for (const [value, label] of FILTERS) {
    const btn = el('button', {
      class: `segmented__item ${filter === value ? 'is-active' : ''}`,
      attrs: { type: 'button' },
      text: label
    });
    btn.addEventListener('click', () => {
      filter = value;
      filters.querySelectorAll('.segmented__item').forEach((node) => node.classList.toggle('is-active', node === btn));
      load();
    });
    filters.append(btn);
  }
  root.append(filters, list);

  async function loadSettings() {
    try {
      const data = await api.get('/admin/superlikes/settings');
      settings = data.settings;
      quantityInput.value = String(settings.quantity);
      priceInput.value = String(settings.price);
      telegramInput.value = settings.telegram || '';
      noteInput.value = settings.payment_note || '';
      enabledInput.checked = !!settings.enabled;
    } catch (err) {
      settingsCard.append(el('div', { class: 'field__hint', text: err.message || 'Не удалось загрузить настройки' }));
    }
  }

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'skeleton', style: { height: '70px' } }));
    try {
      const data = await api.get(`/admin/superlikes/orders?status=${encodeURIComponent(filter)}`);
      orders = data.orders || [];
      render();
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить заявки'));
    }
  }

  function render() {
    list.innerHTML = '';
    if (!orders.length) {
      list.append(emptyState('Заявок с таким статусом нет'));
      return;
    }
    for (const order of orders) {
      const row = el('div', { class: 'ads-list__row' });
      const main = el('div', { class: 'ads-list__main' });
      const title = el('div', { class: 'ads-list__title' });
      title.append(el('span', { text: order.code }));
      title.append(el('span', { text: ` · ${order.quantity} шт · ${formatSum(order.price)}` }));
      main.append(title);
      if (order.display_name || order.username) {
        main.append(
          el('div', {
            class: 'ads-list__meta',
            text: `${order.display_name || ''}${order.username ? ` @${order.username}` : ''}${
              order.email ? ` · ${order.email}` : ''
            }`
          })
        );
      }
      main.append(el('div', { class: 'ads-list__meta', text: fmtDateTime(order.created_at) }));
      if (order.contact) main.append(el('div', { class: 'ads-list__meta', text: `Контакт: ${order.contact}` }));
      if (order.note) main.append(el('div', { class: 'ads-list__meta', text: `Комментарий: ${order.note}` }));
      if (order.admin_note) main.append(el('div', { class: 'ads-list__meta', text: `Решение: ${order.admin_note}` }));

      const actions = el('div', { class: 'ads-list__actions' });
      actions.append(el('span', { class: 'tag', text: STATUS_LABELS[order.status] || order.status }));
      if (order.status === 'new') {
        actions.append(
          button('Начислить', {
            variant: 'btn-primary btn-sm',
            onClick: () => confirmOrder(order, 'approve')
          })
        );
        actions.append(
          button('Отклонить', {
            variant: 'btn-ghost btn-sm',
            onClick: () => confirmOrder(order, 'reject')
          })
        );
      }
      row.append(main, actions);
      list.append(row);
    }
  }

  function confirmOrder(order, action) {
    const approve = action === 'approve';
    const body = el('div', { class: 'col', style: { gap: '10px' } });
    body.append(
      el('p', {
        text: approve
          ? `Начислить пользователю ${order.quantity} суперлайков? Начисление сразу добавится к балансу.`
          : 'Заявка будет отклонена. Суперлайки не начисляются.'
      })
    );
    const note = el('input', {
      class: 'input',
      attrs: { type: 'text', maxlength: '300', placeholder: approve ? 'Комментарий (необязательно)' : 'Причина отказа' }
    });
    body.append(note);
    const footer = el('div', { class: 'row' });
    const modal = openModal({
      title: `${approve ? 'Подтвердить' : 'Отклонить'} ${order.code}`,
      body,
      footer
    });
    const submit = button(approve ? 'Начислить' : 'Отклонить', {
      variant: approve ? 'btn-primary' : 'btn-ghost',
      onClick: async () => {
        submit.disabled = true;
        try {
          await api.post(`/admin/superlikes/orders/${order.id}/${action}`, { note: note.value.trim() });
          toast(approve ? 'Суперлайки начислены' : 'Заявка отклонена', 'success');
          modal.close();
          await load();
        } catch (err) {
          toast(err.message || 'Не удалось выполнить действие', 'error');
          submit.disabled = false;
        }
      }
    });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }), submit);
  }

  await loadSettings();
  await load();
  return root;
}
