import { api } from '../api.js?v=18';
import { el, button, toast, iconButton, svgIcon } from '../ui.js?v=18';
import { icon } from '../icons.js?v=18';
import { getState, patchUser, setCounts } from '../state.js?v=18';
import { createSwipeDeck } from '../components/swipeDeck.js?v=18';
import { openFiltersModal } from '../components/filters.js?v=18';
import { showMatchScreen } from '../components/match.js?v=18';
import { mountAdBanner } from '../components/adBanner.js?v=18';
import { navigate } from '../router.js?v=18';

function boostRemaining(boost) {
  if (!boost || !boost.until) return 0;
  return Math.max(0, Date.parse(boost.until) - Date.now());
}

export default async function SwipePage(ctx) {
  const me = getState().user;
  const root = el('div', { class: 'deck-page' });

  const head = el('div', { class: 'deck-head' });
  const headTitle = el('div');
  headTitle.append(el('div', { class: 'deck-head__title', text: 'Знакомства' }));
  headTitle.append(el('div', { class: 'field__hint', text: 'Свайп вправо — лайк, влево — дальше, вверх — суперлайк' }));
  head.append(headTitle);
  const headActions = el('div', { class: 'deck-head__actions' });
  const filterBtn = iconButton('sliders', {
    label: 'Фильтры',
    onClick: () => openFiltersModal(currentFilters(), () => loadDeck())
  });
  const refreshBtn = iconButton('rewind', { label: 'Обновить колоду', onClick: () => loadDeck() });
  headActions.append(filterBtn, refreshBtn);
  head.append(headActions);
  root.append(head);

  // Paid advertising slot above the deck. Reserved height prevents layout jumps.
  const adHost = el('div', { class: 'ad-slot-host ad-slot-host--swipe' });
  root.append(adHost);
  const adBanner = mountAdBanner(adHost, 'swipe');

  const boostBanner = el('div', { class: 'boost-banner hidden' });
  boostBanner.innerHTML = icon('bolt', { size: 16 });
  const boostText = el('span');
  boostBanner.append(boostText);
  root.append(boostBanner);

  const stage = el('div', { class: 'deck-stage' });
  const deckWrap = el('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } });
  stage.append(deckWrap);
  root.append(stage);

  const actions = el('div', { class: 'deck-actions' });
  const rewindBtn = actionButton('rewind', 'rewind', 'Вернуть последний свайп', () => rewind());
  const nopeBtn = actionButton('x', 'nope', 'Дизлайк', () => deck && deck.swipe('nope'));
  const superBtn = actionButton('star', 'super', 'Суперлайк', () => deck && deck.swipe('super'));
  const likeBtn = actionButton('heart', 'like', 'Лайк', () => deck && deck.swipe('like'));
  const boostBtn = actionButton('bolt', 'boost', 'Буст профиля', () => boost());
  const superCounter = el('span', { class: 'action-count', text: '5' });
  const boostCounter = el('span', { class: 'action-count action-count--boost hidden' });
  superBtn.append(superCounter);
  boostBtn.append(boostCounter);
  actions.append(rewindBtn, nopeBtn, superBtn, likeBtn, boostBtn);
  root.append(actions);

  const hints = el('div', { class: 'deck-hints' });
  hints.innerHTML = `
    <span><kbd>←</kbd>дизлайк</span>
    <span><kbd>→</kbd>лайк</span>
    <span><kbd>↑</kbd>суперлайк</span>
    <span><kbd>пробел</kbd>следующее фото</span>
    <span><kbd>Z</kbd>вернуть</span>
  `;
  root.append(hints);

  let deck = null;
  let cards = [];
  let superLeft = 5;
  let boost = null;
  let boostTimer = null;
  let loading = false;

  function actionButton(iconName, kind, label, onClick) {
    const btn = el('button', {
      class: `action-btn action-btn--${kind} ${kind === 'like' ? 'action-btn--pulse' : ''}`,
      attrs: { type: 'button', 'aria-label': label, title: label }
    });
    btn.innerHTML = icon(iconName, { size: kind === 'like' ? 26 : 22, fill: kind === 'heart' });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function currentFilters() {
    const user = getState().user || me;
    return {
      age_min: user.filter_age_min || 18,
      age_max: user.filter_age_max || 99,
      university_id: user.filter_university_id || '',
      course: user.filter_course || '',
      prefer_my_university: user.prefer_my_university,
      interested_in: user.interested_in || 'everyone'
    };
  }

  function updateSuperCounter() {
    superCounter.textContent = String(superLeft);
    superCounter.style.display = superLeft > 0 ? '' : 'none';
    superBtn.disabled = superLeft <= 0;
  }

  function tickBoost() {
    const remaining = boostRemaining(boost);
    if (remaining <= 0) {
      boostBanner.classList.add('hidden');
      boostCounter.classList.add('hidden');
      boostBtn.disabled = false;
      return;
    }
    const total = Math.ceil(remaining / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    boostText.innerHTML = `Буст активен — ваш профиль выше в колодах. Осталось <strong>${minutes}:${String(
      seconds
    ).padStart(2, '0')}</strong>`;
    boostBanner.classList.remove('hidden');
    boostCounter.textContent = `${minutes}м`;
    boostCounter.classList.remove('hidden');
    boostBtn.disabled = true;
  }

  function startBoostTimer() {
    if (boostTimer) clearInterval(boostTimer);
    tickBoost();
    boostTimer = setInterval(tickBoost, 1000);
  }

  function showEmpty() {
    deckWrap.innerHTML = '';
    const empty = el('div', { class: 'deck-empty' });
    const radar = el('div', { class: 'radar' });
    radar.append(el('div', { class: 'radar__circle radar__circle--static', style: { width: '170px', height: '170px' } }));
    radar.append(el('div', { class: 'radar__circle' }));
    radar.append(el('div', { class: 'radar__circle' }));
    const core = el('div', { class: 'radar__core' });
    core.innerHTML = icon('flame', { size: 26 });
    radar.append(core);
    empty.append(radar);
    empty.append(el('div', { class: 'empty__title', text: 'Рядом больше никого нет' }));
    empty.append(
      el('p', {
        class: 'empty__text',
        text: 'Расширьте фильтры по возрасту или расстоянию — и загляните чуть позже. Новые люди появляются каждый день.'
      })
    );
    const row = el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '6px' } });
    row.append(
      button('Изменить фильтры', {
        variant: 'btn-primary',
        icon: 'sliders',
        onClick: () => openFiltersModal(currentFilters(), () => loadDeck())
      })
    );
    row.append(
      button('Обновить', {
        variant: 'btn-secondary',
        onClick: () => loadDeck()
      })
    );
    empty.append(row);
    deckWrap.append(empty);
  }

  function renderDeck() {
    if (deck) {
      deck.destroy();
      deck = null;
    }
    if (!cards.length) {
      showEmpty();
      updateActionsEnabled(false);
      return;
    }
    deckWrap.innerHTML = '';
    deck = createSwipeDeck({
      me: getState().user,
      cards,
      onSwipe: handleSwipe,
      onShowProfile: (card) => navigate(`/u/${card.username}`)
    });
    deckWrap.append(deck.el);
    updateActionsEnabled(true);
    prefetch();
  }

  function updateActionsEnabled(enabled) {
    nopeBtn.disabled = !enabled;
    likeBtn.disabled = !enabled;
    superBtn.disabled = !enabled || superLeft <= 0;
  }

  function prefetch() {
    const next = cards.slice(0, 3);
    for (const card of next) {
      const photos = card.photos || [];
      const photo = photos[1] || photos[0];
      if (photo && photo.path) {
        const image = new Image();
        image.src = photo.path;
      }
    }
  }

  async function loadDeck() {
    if (loading) return;
    loading = true;
    try {
      const [deckData, meData] = await Promise.all([
        api.get('/discover?limit=10'),
        api.get('/users/me').catch(() => null)
      ]);
      cards = deckData.cards || [];
      if (meData && meData.user) {
        superLeft = meData.user.super_likes_balance != null ? meData.user.super_likes_balance : superLeft;
        boost = meData.user.boost || null;
        patchUser({
          super_likes_balance: superLeft,
          boost_until: meData.user.boost_until,
          boost: meData.user.boost
        });
        startBoostTimer();
      }
      updateSuperCounter();
      renderDeck();
    } catch (err) {
      toast(err.message || 'Не удалось загрузить колоду', 'error');
      cards = [];
      showEmpty();
    } finally {
      loading = false;
    }
  }

  async function handleSwipe(card, action) {
    cards = cards.filter((item) => item.id !== card.id);
    try {
      const result = await api.post('/swipes', { to_id: card.id, action });
      if (typeof result.super_likes_left === 'number') {
        superLeft = result.super_likes_left;
        updateSuperCounter();
      }
      if (result.is_match && result.match) {
        showMatchScreen(result.match, {
          me: getState().user,
          onContinue: () => {
            if (!cards.length) loadDeck();
          }
        });
      }
      if (deck && deck.count() <= 2) {
        try {
          const more = await api.get('/discover?limit=10');
          const fresh = (more.cards || []).filter(
            (item) => !cards.some((existing) => existing.id === item.id)
          );
          if (fresh.length && deck) {
            cards = cards.concat(fresh);
            deck.setCards(cards);
            prefetch();
          }
        } catch (err) {
          // Preloading is best effort.
        }
      }
    } catch (err) {
      toast(err.message || 'Не удалось сохранить свайп', 'error');
      if (err.data && err.data.code === 'no_super_likes') {
        superLeft = 0;
        updateSuperCounter();
      }
      const cardBack = cards.slice();
      loadDeck();
      cards = cardBack;
    }
  }

  async function rewind() {
    rewindBtn.disabled = true;
    try {
      const result = await api.post('/swipes/rewind');
      if (result.card) {
        cards.unshift(result.card);
        if (deck) deck.prepend(result.card);
        else renderDeck();
        toast('Свайп возвращён');
      }
    } catch (err) {
      toast(err.message || 'Нечего возвращать', 'error');
    } finally {
      rewindBtn.disabled = false;
    }
  }

  async function boostProfile() {
    if (boostBtn.disabled) return;
    boostBtn.disabled = true;
    try {
      const result = await api.post('/users/me/boost');
      boost = result.boost;
      patchUser({ boost_until: boost.until, boost });
      startBoostTimer();
      toast('Буст активирован на 30 минут ⚡', 'success');
      setCounts({});
      loadDeck();
    } catch (err) {
      toast(err.message || 'Буст пока недоступен', 'error');
      boostBtn.disabled = false;
    }
  }

  function onKeyDown(event) {
    if (document.querySelector('.modal-backdrop, .match-screen')) return;
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || event.target.isContentEditable) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (deck) deck.swipe('nope');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (deck) deck.swipe('like');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (deck) deck.swipe('super');
    } else if (event.key === ' ') {
      event.preventDefault();
      if (deck) deck.nextPhoto();
    } else if (event.key === 'z' || event.key === 'Z' || event.key === 'я' || event.key === 'Я') {
      event.preventDefault();
      rewind();
    }
  }

  document.addEventListener('keydown', onKeyDown);

  await loadDeck();

  return {
    el: root,
    cleanup() {
      document.removeEventListener('keydown', onKeyDown);
      adBanner.destroy();
      if (boostTimer) clearInterval(boostTimer);
      if (deck) deck.destroy();
      deck = null;
    }
  };
}
