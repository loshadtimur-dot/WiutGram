import { api } from '../api.js?v=25';
import { el, button, avatarNode, openModal, toast, loadingRow } from '../ui.js?v=25';
import { tashkentDate, money } from './glass.js';
import { buyItem } from './purchase.js';

function sparkles(hero) {
  for (let index = 0; index < 9; index += 1) {
    const spark = el('span', { class: 'gift-spark' });
    spark.style.left = `${18 + Math.random() * 64}%`;
    spark.style.top = `${20 + Math.random() * 55}%`;
    spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 90}px`);
    spark.style.setProperty('--dy', `${-20 - Math.random() * 60}px`);
    spark.style.animationDelay = `${index * 0.08}s`;
    hero.append(spark);
  }
}

export function openGiftViewer(giftId, options = {}) {
  const body = el('div', { class: 'gift-view' });
  body.append(loadingRow('Открываем подарок…'));
  const modal = openModal({ title: 'Подарок', body, size: 'wide' });
  let gift = null;

  async function load(unpack = false) {
    body.innerHTML = '';
    body.append(loadingRow());
    try {
      const data = await api.get(`/gifts/${giftId}`);
      gift = data.gift;
      render(unpack);
    } catch (err) {
      body.innerHTML = '';
      body.append(el('div', { class: 'purchase__note', text: err.message || 'Подарок недоступен' }));
    }
  }

  function render(unpack) {
    body.innerHTML = '';
    const hero = el('div', {
      class: `gift-hero ${unpack ? 'gift-hero--unpack' : ''}`,
      style: { background: gift.theme || 'linear-gradient(140deg, #2b3566, #6e4aa8 60%, #ff8fb3)' }
    });
    if (!gift.theme) hero.style.background = 'linear-gradient(140deg, #202a52, #5b4a9b 55%, #d97aa8)';
    const art = el('div', { class: 'gift-hero__art' });
    art.innerHTML = gift.svg || '';
    const bits = el('div', { class: 'gift-bit' });
    hero.append(bits, art);
    if (unpack) sparkles(hero);
    body.append(hero);

    const title = el('div', { style: { textAlign: 'center' } });
    title.append(el('h2', { style: { margin: '0 0 2px', fontSize: '19px' }, text: gift.name }));
    const sub = el('div', { class: 'people-card__meta' });
    sub.append(el('span', { class: `rarity-pill rarity-pill--${gift.rarity}`, text: gift.rarity_label }));
    if (gift.edition_number) {
      sub.append(el('span', { text: ` · № ${gift.edition_number}${gift.edition_limit ? ` из ${gift.edition_limit}` : ''}` }));
    }
    title.append(sub);
    body.append(title);

    const meta = el('div', { class: 'gift-meta' });
    const row = (label, value) => {
      const node = el('div', { class: 'gift-meta__row' });
      node.append(el('span', { text: label }));
      node.append(value instanceof Node ? value : el('strong', { text: value }));
      meta.append(node);
    };
    if (gift.sender) {
      const sender = el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } });
      sender.append(avatarNode(gift.sender, 'sm'));
      sender.append(el('strong', { text: gift.sender.display_name }));
      row('Отправитель', sender);
    } else {
      row('Отправитель', 'Скрытый отправитель');
    }
    row('Дата', tashkentDate(gift.given_at));
    row('Стоимость', money(gift.price));
    row('Редкость', gift.rarity_label);
    body.append(meta);

    if (gift.message) body.append(el('div', { class: 'gift-caption', text: gift.message }));

    const actions = el('div', { class: 'gift-actions' });
    if (gift.mine) {
      actions.append(
        button(gift.is_hidden ? 'Показывать в профиле' : 'Скрыть из профиля', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            try {
              await api.post(`/gifts/${gift.id}/hide`, { hidden: !gift.is_hidden });
              gift.is_hidden = !gift.is_hidden;
              toast(gift.is_hidden ? 'Подарок скрыт' : 'Подарок снова в профиле', 'success');
              render(false);
              if (options.onChanged) options.onChanged();
            } catch (err) {
              toast(err.message || 'Ошибка', 'error');
            }
          }
        }),
        button(gift.is_pinned ? 'Открепить' : 'Закрепить', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            try {
              await api.post(`/gifts/${gift.id}/pin`, { pinned: !gift.is_pinned });
              gift.is_pinned = !gift.is_pinned;
              toast(gift.is_pinned ? 'Закреплено' : 'Откреплено', 'success');
              render(false);
              if (options.onChanged) options.onChanged();
            } catch (err) {
              toast(err.message || 'Ошибка', 'error');
            }
          }
        })
      );
      if (!gift.regifted) {
        actions.append(
          button('Отправить в ответ', {
            variant: 'btn-primary btn-sm',
            onClick: () => openRegiftDialog(gift, options.onChanged)
          })
        );
      }
    }
    if (gift.item_id) {
      actions.append(
        button('Купить такой же', {
          variant: 'btn-ghost btn-sm',
          onClick: async () => {
            try {
              const catalog = await api.get('/shop/catalog?kind=gift');
              const item = catalog.items.find((entry) => entry.id === gift.item_id);
              if (!item) throw new Error('Подарок больше не продаётся');
              modal.close();
              await buyItem({ api, item });
            } catch (err) {
              toast(err.message || 'Ошибка', 'error');
            }
          }
        })
      );
    }
    actions.append(
      button('Копировать ссылку', {
        variant: 'btn-ghost btn-sm',
        onClick: async () => {
          const link = `${window.location.origin}/u/${gift.sender ? gift.sender.username : ''}?gift=${gift.id}`;
          try {
            await navigator.clipboard.writeText(link);
            toast('Ссылка скопирована', 'success');
          } catch (err) {
            toast('Не удалось скопировать', 'error');
          }
        }
      })
    );
    body.append(actions);
  }

  load(options.unpack === true);
  return modal;
}

export function openGiftPicker({ gifts, title = 'Выберите подарок', onPick }) {
  const grid = el('div', { class: 'shop-grid' });
  const modal = openModal({ title, body: grid, size: 'wide' });
  for (const gift of gifts) {
    const card = el('button', { class: 'shop-card shop-card--gift', attrs: { type: 'button' } });
    const art = el('div', { class: 'shop-card__art' });
    art.innerHTML = gift.svg || '';
    card.append(art);
    const info = el('div', { class: 'shop-card__body' });
    info.append(el('div', { class: 'shop-card__title', text: gift.name }));
    info.append(el('div', { class: 'shop-card__price', text: money(gift.price) }));
    card.append(info);
    card.addEventListener('click', () => {
      modal.close();
      onPick(gift);
    });
    grid.append(card);
  }
  return modal;
}

function openRegiftDialog(gift, onChanged) {
  const body = el('div', { class: 'form-stack' });
  const input = el('input', { class: 'input', attrs: { placeholder: '@username получателя' } });
  body.append(el('label', { class: 'field__label', text: 'Кому переподарить' }), input);
  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title: 'Отправить в ответ', body, footer });
  footer.append(
    button('Отправить', {
      variant: 'btn-primary',
      onClick: async () => {
        try {
          await api.post(`/gifts/${gift.id}/regift`, { username: input.value.trim() });
          toast('Подарок отправлен', 'success');
          modal.close();
          if (onChanged) onChanged();
        } catch (err) {
          toast(err.message || 'Не удалось отправить', 'error');
        }
      }
    })
  );
  setTimeout(() => input.focus(), 60);
  return modal;
}
