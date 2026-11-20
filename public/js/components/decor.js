import { api } from '../api.js?v=25';
import { el, button, openModal, toast, loadingRow, avatarNode } from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { getState } from '../state.js?v=25';
import { glassSvg, money } from './glass.js';
import { buyItem } from './purchase.js';

export function bannerNode(view, customPath = null, className = '') {
  const node = el('div', { class: `profile-banner ${className}` });
  if (customPath) {
    node.style.backgroundImage = `url(${customPath})`;
    node.style.backgroundSize = 'cover';
    node.style.backgroundPosition = 'center';
    return node;
  }
  if (view) {
    node.style.background = view.theme;
    if (view.pattern) node.classList.add(`banner-pattern-${view.pattern}`);
  } else {
    node.style.background = 'linear-gradient(135deg, #1b2440, #3a4a80 60%, #6b7fc4)';
  }
  return node;
}

export function themePreview(view, className = '') {
  const node = el('div', { class: className });
  if (view) {
    node.style.background = view.theme;
    node.classList.add(`bg-pattern-${view.pattern || 'dots'}`);
  }
  return node;
}

function tilePreview(view) {
  const node = el('div', { class: 'decor-tile__preview' });
  node.style.background = view.theme;
  node.classList.add(`bg-pattern-${view.pattern || 'dots'}`);
  return node;
}

async function loadDecor() {
  return api.get('/decor/me');
}

/* ---------- Banners ---------- */
export function openBannerGallery(onChanged) {
  const body = el('div');
  body.append(loadingRow('Загружаем баннеры…'));
  const modal = openModal({ title: 'Баннер профиля', body, size: 'wide' });
  let state = null;

  function render() {
    body.innerHTML = '';
    const preview = el('div', { class: 'profile-banner-wrap', style: { marginBottom: '10px' } });
    const sample = bannerNode(state.decor.banner, state.decor.custom_banner_path);
    sample.style.height = '120px';
    preview.append(sample);
    body.append(preview);

    const grid = el('div', { class: 'decor-gallery' });
    for (const banner of state.banners) {
      const tile = el('div', { class: 'decor-tile' });
      const art = bannerNode({ ...banner, theme: banner.theme }, null, 'decor-tile__preview');
      art.style.minHeight = '86px';
      tile.append(art);
      const info = el('div', { class: 'decor-tile__body' });
      const title = el('div', { class: 'decor-tile__title' });
      title.append(el('span', { text: banner.name }));
      title.append(el('span', { class: 'shop-card__price', text: banner.price ? money(banner.price) : 'Бесплатно' }));
      info.append(title);
      const actions = el('div', { class: 'decor-tile__actions' });
      actions.append(
        button('Примерить', {
          variant: 'btn-ghost btn-sm',
          onClick: () => {
            sample.style.background = banner.theme;
            sample.style.backgroundImage = '';
            sample.className = `profile-banner banner-pattern-${banner.pattern || 'stars'}`;
          }
        })
      );
      if (banner.owned) {
        actions.append(
          button(state.decor.banner && state.decor.banner.item_id === banner.item_id ? 'Выбран' : 'Применить', {
            variant: 'btn-primary btn-sm',
            disabled: state.decor.banner && state.decor.banner.item_id === banner.item_id,
            onClick: async () => {
              try {
                await api.post('/decor/banner', { item_id: banner.item_id });
                toast('Баннер применён', 'success');
                await refresh();
                if (onChanged) onChanged();
              } catch (err) {
                toast(err.message || 'Не удалось применить', 'error');
              }
            }
          })
        );
      } else if (banner.price > 0) {
        actions.append(
          button('Купить', {
            variant: 'btn-primary btn-sm',
            onClick: async () => {
              try {
                const catalog = await api.get('/shop/catalog?kind=banner');
                const item = catalog.items.find((entry) => entry.id === banner.item_id);
                if (!item) throw new Error('Товар недоступен');
                await buyItem({ api, item });
              } catch (err) {
                toast(err.message || 'Не удалось создать заказ', 'error');
              }
            }
          })
        );
      }
      info.append(actions);
      tile.append(info);
      grid.append(tile);
    }
    body.append(grid);
    if (!state.banners.length) body.append(el('div', { class: 'purchase__note', text: 'Баннеры пока не добавлены.' }));
  }

  async function refresh() {
    state = await loadDecor();
    render();
  }

  refresh().catch((err) => {
    body.innerHTML = '';
    body.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить баннеры' }));
  });
  return modal;
}

/* ---------- Backgrounds ---------- */
export function openBackgroundGallery(onChanged) {
  const body = el('div');
  body.append(loadingRow('Загружаем фоны…'));
  const modal = openModal({ title: 'Фон профиля', body, size: 'wide' });
  let state = null;

  function render() {
    body.innerHTML = '';
    const preview = el('div', { class: 'profile-page has-background', style: { padding: '16px', marginBottom: '10px' } });
    const sample = themePreview(state.decor.background, 'decor-tile__preview');
    sample.style.borderRadius = '14px';
    sample.style.minHeight = '90px';
    preview.append(sample);
    body.append(preview);
    const grid = el('div', { class: 'decor-gallery' });
    const list = state.backgrounds.filter(
      (background) => !background.owner_only || (getState().user && getState().user.role === 'owner')
    );
    for (const background of list) {
      const tile = el('div', { class: 'decor-tile' });
      tile.append(tilePreview(background));
      const info = el('div', { class: 'decor-tile__body' });
      const title = el('div', { class: 'decor-tile__title' });
      title.append(el('span', { text: background.name }));
      title.append(
        el('span', { class: 'shop-card__price', text: background.price ? money(background.price) : 'Бесплатно' })
      );
      info.append(title);
      const actions = el('div', { class: 'decor-tile__actions' });
      actions.append(
        button('Примерить', {
          variant: 'btn-ghost btn-sm',
          onClick: () => {
            sample.style.background = background.theme;
            sample.className = `decor-tile__preview bg-pattern-${background.pattern || 'dots'}`;
            sample.style.borderRadius = '14px';
          }
        })
      );
      if (background.owned) {
        actions.append(
          button(
            state.decor.background && state.decor.background.item_id === background.item_id ? 'Выбран' : 'Применить',
            {
              variant: 'btn-primary btn-sm',
              disabled: state.decor.background && state.decor.background.item_id === background.item_id,
              onClick: async () => {
                try {
                  await api.post('/decor/background', { item_id: background.item_id });
                  toast('Фон применён', 'success');
                  await refresh();
                  if (onChanged) onChanged();
                } catch (err) {
                  toast(err.message || 'Не удалось применить', 'error');
                }
              }
            }
          )
        );
      } else {
        actions.append(
          button('Купить', {
            variant: 'btn-primary btn-sm',
            onClick: async () => {
              try {
                const catalog = await api.get('/shop/catalog?kind=background');
                const item = catalog.items.find((entry) => entry.id === background.item_id);
                if (!item) throw new Error('Товар недоступен');
                await buyItem({ api, item });
              } catch (err) {
                toast(err.message || 'Не удалось создать заказ', 'error');
              }
            }
          })
        );
      }
      info.append(actions);
      tile.append(info);
      grid.append(tile);
    }
    body.append(grid);
    if (!list.length) body.append(el('div', { class: 'purchase__note', text: 'Фоны пока не добавлены.' }));
  }

  async function refresh() {
    state = await loadDecor();
    render();
  }

  refresh().catch((err) => {
    body.innerHTML = '';
    body.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить фоны' }));
  });
  return modal;
}

/* ---------- Status ---------- */
export function openStatusPicker(onChanged) {
  const body = el('div', { class: 'form-stack' });
  body.append(loadingRow('Загружаем эмодзи…'));
  const modal = openModal({ title: 'Статус', body, size: 'wide' });
  let state = null;
  let selected = null;
  let search = '';

  function render() {
    body.innerHTML = '';
    const preview = el('div', { class: 'status-preview' });
    const emojiWrap = el('div');
    emojiWrap.innerHTML = selected ? glassSvg(selected, 38) : glassSvg('sparkles', 38);
    const bubble = el('div', { class: 'status-preview__bubble' });
    const me = getState().user;
    bubble.append(el('strong', { text: me ? me.display_name : 'Вы' }));
    bubble.append(el('span', { text: textInput ? textInput.value || 'Ваш статус' : '' }));
    preview.append(emojiWrap, bubble);
    body.append(preview);

    const searchInput = el('input', {
      class: 'input',
      attrs: { type: 'search', placeholder: 'Поиск эмодзи', value: search }
    });
    searchInput.addEventListener('input', () => {
      search = searchInput.value.toLowerCase();
      render();
      const next = body.querySelector('input[type="search"]');
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    });
    body.append(searchInput);

    for (const pack of state.packs) {
      const icons = pack.items.filter(
        (emoji) => !search || emoji.name.toLowerCase().includes(search) || emoji.id.includes(search)
      );
      if (!icons.length) continue;
      const head = el('div', { class: 'emoji-pack__head' });
      head.append(el('strong', { text: pack.title, style: { fontSize: '13px' } }));
      if (!pack.owned && pack.item_id) {
        head.append(
          button(`${money(pack.price)} · Купить`, {
            variant: 'btn-primary btn-sm',
            onClick: async () => {
              try {
                const catalog = await api.get('/shop/catalog?kind=emoji_pack');
                const item = catalog.items.find((entry) => entry.id === pack.item_id);
                if (!item) throw new Error('Набор недоступен');
                await buyItem({ api, item });
              } catch (err) {
                toast(err.message || 'Ошибка', 'error');
              }
            }
          })
        );
      }
      body.append(head);
      const grid = el('div', { class: 'emoji-grid' });
      for (const emoji of icons) {
        const btn = el('button', {
          class: `emoji-button ${selected === emoji.id ? 'is-selected' : ''}`,
          attrs: { type: 'button', title: emoji.name }
        });
        btn.innerHTML = glassSvg(emoji.id, 28);
        if (!pack.owned) {
          const lock = el('span', { class: 'emoji-button__lock', text: '🔒' });
          btn.append(lock);
        }
        btn.addEventListener('click', () => {
          if (!pack.owned) {
            toast('Сначала купите набор — он появится после выдачи владельцем');
            return;
          }
          selected = emoji.id;
          render();
        });
        grid.append(btn);
      }
      body.append(grid);
    }

    const textLabel = el('label', { class: 'field__label', text: 'Текст статуса (до 60 символов)' });
    textInput = el('input', {
      class: 'input',
      attrs: { maxlength: '60', placeholder: 'Например: готовлюсь к сессии', value: state.decor.status ? state.decor.status.text : '' }
    });
    const durations = el('select', { class: 'input' });
    for (const duration of state.durations) {
      durations.append(
        el('option', {
          text: duration.label,
          attrs: { value: duration.id, selected: state.decor.status && duration.id === 'never' ? 'selected' : null }
        })
      );
    }
    body.append(textLabel, textInput, el('label', { class: 'field__label', text: 'Срок' }), durations);

    const actions = el('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '8px' } });
    if (state.decor.status) {
      actions.append(
        button('Убрать статус', {
          variant: 'btn-ghost',
          onClick: async () => {
            try {
              await api.post('/decor/status', { emoji: null });
              toast('Статус убран');
              modal.close();
              if (onChanged) onChanged();
            } catch (err) {
              toast(err.message || 'Ошибка', 'error');
            }
          }
        })
      );
    }
    actions.append(
      button('Сохранить', {
        variant: 'btn-primary',
        onClick: async () => {
          if (!selected) {
            toast('Выберите эмодзи', 'error');
            return;
          }
          try {
            await api.post('/decor/status', {
              emoji: selected,
              text: textInput.value.trim(),
              duration: durations.value
            });
            toast('Статус сохранён', 'success');
            modal.close();
            if (onChanged) onChanged();
          } catch (err) {
            toast(err.message || 'Не удалось сохранить статус', 'error');
          }
        }
      })
    );
    body.append(actions);
    if (state.decor.status) selected = selected || state.decor.status.emoji;
  }

  let textInput = null;

  loadDecor()
    .then((data) => {
      state = data;
      selected = data.decor.status ? data.decor.status.emoji : null;
      render();
    })
    .catch((err) => {
      body.innerHTML = '';
      body.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить статусы' }));
    });
  return modal;
}

/* ---------- Profile block ---------- */
export function decorPanelNode({ decor, giftsCount, onOpen }) {
  const panel = el('div', { class: 'decor-panel' });
  const slot = (label, preview, emptyLabel, handler, empty = false) => {
    const node = el('button', { class: `decor-slot ${empty ? 'decor-slot--empty' : ''}`, attrs: { type: 'button' } });
    if (empty) {
      node.innerHTML = icon('plus', { size: 20 });
      node.append(el('span', { text: emptyLabel }));
    } else {
      node.append(preview);
      const caption = el('div', { class: 'decor-slot__label' });
      caption.append(el('span', { text: label }));
      caption.append(el('small', { text: 'Изменить' }));
      node.append(caption);
    }
    node.addEventListener('click', handler);
    return node;
  };

  if (decor.banner) {
    panel.append(
      slot('Баннер', bannerNode(decor.banner, null, 'decor-slot__preview'), 'Добавить баннер', () => openBannerGallery(onOpen))
    );
  } else {
    panel.append(
      slot('', null, 'Баннер', () => openBannerGallery(onOpen), true)
    );
  }

  if (decor.background) {
    panel.append(
      slot('Фон', themePreview(decor.background, 'decor-slot__preview'), 'Выбрать фон', () => openBackgroundGallery(onOpen))
    );
  } else {
    panel.append(
      slot('', null, 'Фон профиля', () => openBackgroundGallery(onOpen), true)
    );
  }

  if (decor.status) {
    const preview = el('div', { class: 'decor-slot__preview decor-slot__preview--art' });
    preview.innerHTML = glassSvg(decor.status.emoji, 48);
    panel.append(
      slot('Статус', preview, 'Добавить статус', () => openStatusPicker(onOpen))
    );
  } else {
    panel.append(
      slot('', null, 'Эмодзи-статус', () => openStatusPicker(onOpen), true)
    );
  }

  const giftsPreview = el('div', { class: 'decor-slot__preview decor-slot__preview--art' });
  giftsPreview.innerHTML = icon('gift', { size: 34 });
  const giftsSlot = slot(`Подарки · ${giftsCount}`, giftsPreview, 'Купить подарок', () => {
    if (onOpen) onOpen('gifts');
  });
  panel.append(giftsSlot);
  return panel;
}

export function bannerPlaceholder(onClick) {
  const node = el('button', { class: 'profile-banner--empty', attrs: { type: 'button' } });
  node.innerHTML = icon('image', { size: 22 });
  node.append(el('span', { text: 'Добавить баннер' }));
  node.addEventListener('click', onClick);
  return node;
}

export { avatarNode };
