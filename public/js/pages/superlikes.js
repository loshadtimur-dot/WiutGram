import { api } from '../api.js?v=18';
import { el, button, toast, svgIcon } from '../ui.js?v=18';
import { navigate } from '../router.js?v=18';
import { getState } from '../state.js?v=18';

const STATUS_LABELS = {
  new: 'Ожидает оплаты',
  approved: 'Начислено',
  rejected: 'Отклонено',
  cancelled: 'Отменено'
};

function formatSum(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function telegramLink(telegram) {
  if (!telegram) return null;
  return el('a', {
    class: 'btn btn-secondary btn-sm',
    text: `Написать @${telegram}`,
    attrs: { href: `https://t.me/${telegram}`, target: '_blank', rel: 'noopener noreferrer' }
  });
}

export default async function SuperlikesPage() {
  const me = getState().user;
  const root = el('div', {
    class: 'col',
    style: { gap: '16px', maxWidth: '720px', margin: '0 auto', width: '100%' }
  });
  const head = el('div', { class: 'col', style: { gap: '4px' } });
  const title = el('h1', { text: 'Суперлайки', style: { margin: 0 } });
  head.append(title);
  head.append(
    el('p', {
      class: 'field__hint',
      text: 'Суперлайк выделяет вас в лайках и повышает шанс на взаимность. Каждый день доступно 5 бесплатных, а купленный пакет не сгорает.'
    })
  );
  root.append(head);

  let data = null;
  try {
    data = await api.get('/superlikes');
  } catch (err) {
    root.append(el('div', { class: 'card card-pad', text: err.message || 'Не удалось загрузить суперлайки' }));
    return root;
  }

  const settings = data.settings || {};
  const balanceCard = el('div', { class: 'card card-pad' });
  const balanceRow = el('div', {
    class: 'row',
    style: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }
  });
  const balanceText = el('div');
  const balanceValue = el('div', { text: String(data.balance), style: { fontSize: '32px', fontWeight: '800' } });
  balanceText.append(balanceValue);
  balanceText.append(el('div', { class: 'field__hint', text: 'Осталось суперлайков' }));
  balanceRow.append(balanceText);
  const split = el('div', { class: 'field__hint', text: `Бесплатных сегодня: ${data.daily} · купленных: ${data.bonus}` });
  balanceRow.append(split);
  balanceCard.append(balanceRow);
  root.append(balanceCard);

  if (!settings.enabled) {
    const off = el('div', { class: 'card card-pad' });
    off.append(el('h3', { text: 'Покупка временно недоступна', style: { marginTop: 0 } }));
    off.append(el('p', { class: 'field__hint', text: 'Владелец отключил продажу суперлайков. Загляните позже.' }));
    root.append(off);
    return root;
  }

  const orderCard = el('div', { class: 'card card-pad', style: { display: 'grid', gap: '12px' } });
  orderCard.append(el('h3', { text: `Пакет: ${settings.quantity} суперлайков`, style: { margin: 0 } }));
  const priceTag = el('div', { text: formatSum(settings.price), style: { fontSize: '22px', fontWeight: '800' } });
  orderCard.append(priceTag);
  if (settings.payment_note) orderCard.append(el('p', { class: 'field__hint', text: settings.payment_note }));

  const steps = el('div', { class: 'field__hint' });
  steps.innerHTML =
    '1. Отправьте заявку — мы покажем её код.<br />2. Оплатите сумму и напишите владельцу в Telegram.<br />3. Владелец проверит оплату и начислит суперлайки на ваш баланс.';
  orderCard.append(steps);

  const form = el('div', { class: 'col', style: { gap: '10px' } });
  const contactField = el('label', { class: 'field' });
  contactField.append(el('span', { class: 'field__label', text: 'Контакт для связи' }));
  const contactInput = el('input', {
    class: 'input',
    attrs: { type: 'text', placeholder: '@telegram или номер телефона', maxlength: '80', autocomplete: 'tel' }
  });
  contactInput.value = (me && (me.telegram || me.username)) || '';
  contactField.append(contactInput);
  const noteField = el('label', { class: 'field' });
  noteField.append(el('span', { class: 'field__label', text: 'Комментарий (необязательно)' }));
  const noteInput = el('textarea', { class: 'textarea', attrs: { rows: '2', maxlength: '300', placeholder: 'Например, время оплаты' } });
  noteField.append(noteInput);
  form.append(contactField, noteField);

  const submit = button('Отправить заявку', {
    variant: 'btn-primary',
    icon: 'star',
    onClick: async () => {
      submit.disabled = true;
      try {
        const result = await api.post('/superlikes/orders', {
          contact: contactInput.value.trim(),
          note: noteInput.value.trim()
        });
        toast('Заявка отправлена', 'success');
        renderCreated(result);
        await loadOrders();
      } catch (err) {
        toast(err.message || 'Не удалось отправить заявку', 'error');
      } finally {
        submit.disabled = false;
      }
    }
  });
  form.append(submit);
  orderCard.append(form);

  const successBox = el('div', { class: 'col hidden', style: { gap: '8px' } });
  orderCard.append(successBox);
  root.append(orderCard);

  function renderCreated(result) {
    successBox.innerHTML = '';
    successBox.classList.remove('hidden');
    const box = el('div', {
      style: {
        padding: '12px 14px',
        borderRadius: '12px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)'
      }
    });
    box.append(el('div', { text: `Заявка ${result.order.code} создана`, style: { fontWeight: '700' } }));
    box.append(
      el('div', {
        class: 'field__hint',
        text: `К оплате: ${formatSum(result.order.price)} за ${result.order.quantity} суперлайков.`
      })
    );
    if (result.telegram) {
      box.append(el('div', { class: 'field__hint', text: `Telegram владельца: @${result.telegram}` }));
      box.append(telegramLink(result.telegram));
    }
    const copy = button('Скопировать сообщение', {
      variant: 'btn-ghost btn-sm',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(result.message);
          toast('Сообщение скопировано', 'success');
        } catch (err) {
          toast(result.message);
        }
      }
    });
    box.append(copy);
    successBox.append(box);
  }

  const ordersCard = el('div', { class: 'card card-pad' });
  ordersCard.append(el('h3', { text: 'Мои заявки', style: { marginTop: 0 } }));
  const ordersList = el('div', { class: 'col', style: { gap: '8px' } });
  ordersCard.append(ordersList);
  root.append(ordersCard);

  async function loadOrders() {
    ordersList.innerHTML = '';
    let orders = (data && data.orders) || [];
    try {
      const fresh = await api.get('/superlikes');
      data = fresh;
      orders = fresh.orders || [];
      balanceValue.textContent = String(fresh.balance);
      split.textContent = `Бесплатных сегодня: ${fresh.daily} · купленных: ${fresh.bonus}`;
    } catch (err) {
      // Keep the already rendered list.
    }
    if (!orders.length) {
      ordersList.append(el('div', { class: 'field__hint', text: 'Заявок пока нет.' }));
      return;
    }
    for (const order of orders) {
      const row = el('div', {
        class: 'row',
        style: { justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }
      });
      const info = el('div');
      info.append(el('div', { text: `${order.code} · ${order.quantity} шт · ${formatSum(order.price)}`, style: { fontWeight: '600' } }));
      info.append(el('div', { class: 'field__hint', text: formatWhen(order.created_at) }));
      row.append(info);
      row.append(el('span', { class: 'tag', text: STATUS_LABELS[order.status] || order.status }));
      ordersList.append(row);
    }
  }

  renderCreatedFromLatest();
  await loadOrders();

  function renderCreatedFromLatest() {
    const latest = (data.orders || []).find((order) => order.status === 'new');
    if (!latest) return;
    const box = el('div', { class: 'field__hint' });
    box.append(svgIcon('star', { size: 14 }));
    box.append(el('span', { text: ` У вас есть заявка ${latest.code} в ожидании оплаты.` }));
    successBox.innerHTML = '';
    successBox.classList.remove('hidden');
    successBox.append(box);
    if (settings.telegram) successBox.append(telegramLink(settings.telegram));
  }

  return root;
}
