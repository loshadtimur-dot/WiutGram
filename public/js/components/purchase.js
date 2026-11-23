import { el, button, openModal, toast } from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { giftSvg, money } from './glass.js';
import { navigate } from '../router.js?v=25';

export function telegramLink(handle, text) {
  const name = String(handle || '').replace(/^@/, '');
  if (!name) return '';
  return `https://t.me/${encodeURIComponent(name)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

async function copyText(value, label = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(value);
    toast(label, 'success');
  } catch (err) {
    toast('Не удалось скопировать — выделите текст вручную', 'error');
  }
}

function iconForItem(item) {
  if (item.kind === 'gift') {
    const wrap = el('div', { class: 'purchase__art' });
    wrap.innerHTML = giftSvg(item.asset?.sprite || item.asset_key, 68);
    return wrap;
  }
  const wrap = el('div', { class: 'purchase__art' });
  const preview = el('div');
  preview.style.cssText = `width:100%;height:100%;background:${item.asset?.theme || 'var(--surface-2)'}`;
  if (item.asset?.pattern) preview.className = `banner-pattern-${item.asset.pattern}`;
  wrap.append(preview);
  return wrap;
}

// The shared "almost done" window used by gifts, emoji packs, banners and backgrounds.
export function openPurchaseWindow({ item, order, purchase, title = 'Почти готово' }) {
  const body = el('div', { class: 'purchase' });
  const head = el('div', { class: 'purchase__item' });
  head.append(iconForItem(item));
  const info = el('div');
  info.append(el('div', { class: 'purchase__title', text: item.title }));
  info.append(el('div', { class: 'purchase__sum', text: money(order.price_total) }));
  head.append(info);
  body.append(head);

  const code = el('div', { class: 'purchase__code' });
  code.append(el('span', { text: order.code }));
  const codeCopy = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' } });
  codeCopy.innerHTML = icon('copy', { size: 15 });
  codeCopy.append(el('span', { text: 'Копировать' }));
  codeCopy.addEventListener('click', () => copyText(order.code, 'Код заказа скопирован'));
  code.append(codeCopy);
  body.append(el('p', { class: 'field__hint', text: 'Назовите этот код владельцу в Telegram — по нему он найдёт заказ.' }), code);

  const handle = purchase.telegram;
  if (handle) {
    const row = el('div', { class: 'purchase__row' });
    row.append(el('span', { text: `Telegram владельца: @${handle}` }));
    const actions = el('div', { class: 'row' });
    const copyBtn = button('Копировать', {
      variant: 'btn-ghost btn-sm',
      onClick: () => copyText(`@${handle}`, 'Ник скопирован')
    });
    const text = `Здравствуйте! Хочу оплатить заказ ${order.code} — «${item.title}» (${money(
      order.price_total
    )}) в Wiutgram.`;
    const link = el('a', {
      class: 'btn btn-primary btn-sm',
      text: 'Написать в Telegram',
      attrs: { href: telegramLink(handle, text), target: '_blank', rel: 'noopener noreferrer' }
    });
    actions.append(copyBtn, link);
    row.append(actions);
    body.append(row);
  } else {
    body.append(
      el('div', {
        class: 'purchase__note',
        text: 'Владелец ещё не указал Telegram. Сохраните код заказа и свяжитесь с ним другим способом.'
      })
    );
  }

  if (purchase.show_card && purchase.card_number) {
    const card = el('div', { class: 'card-box' });
    const left = el('div');
    left.append(el('div', { style: { fontSize: '11px', opacity: '0.7', marginBottom: '4px' }, text: purchase.card_bank || 'Карта' }));
    left.append(el('strong', { text: purchase.card_number }));
    if (purchase.card_holder) {
      left.append(el('div', { style: { fontSize: '11.5px', opacity: '0.8', marginTop: '4px' }, text: purchase.card_holder }));
    }
    card.append(left);
    const copyCard = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' } });
    copyCard.style.color = '#fff';
    copyCard.innerHTML = icon('copy', { size: 15 });
    copyCard.append(el('span', { text: 'Копировать' }));
    copyCard.addEventListener('click', () => copyText(purchase.card_number.replace(/\s/g, ''), 'Номер карты скопирован'));
    card.append(copyCard);
    body.append(card);
  }

  if (purchase.payment_note) {
    body.append(el('div', { class: 'purchase__note', text: purchase.payment_note }));
  }
  body.append(
    el('div', {
      class: 'purchase__note',
      text: 'Оплата проходит вручную. После проверки оплаты владелец выдаст товар — вы получите уведомление.'
    })
  );

  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title, body, footer, size: 'wide' });
  footer.append(
    button('Мои заказы', {
      variant: 'btn-ghost',
      onClick: () => {
        modal.close();
        navigate('/shop?tab=orders');
      }
    }),
    button('Понятно', { variant: 'btn-primary', onClick: () => modal.close() })
  );
  return modal;
}

// Creates an order and immediately shows the purchase window.
export async function buyItem({ api, item, recipientUsername = '', message = '', anonymous = false }) {
  const result = await api.post('/shop/orders', {
    item_id: item.id,
    recipient_username: recipientUsername,
    message,
    is_anonymous: anonymous
  });
  openPurchaseWindow({ item: result.item || item, order: result.order, purchase: result.purchase });
  return result;
}
