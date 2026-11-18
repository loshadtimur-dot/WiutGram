import { api } from '../api.js?v=25';
import { el, toast, initials, gradientFor, svgIcon, ruleBadges, looksForLabel } from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { navigate } from '../router.js?v=25';
import { openReportDialog, openBlockConfirm } from './report.js?v=25';

const INTEREST_LABELS = {
  travel: ['Путешествия', '✈️'], music: ['Музыка', '🎧'], movies: ['Кино', '🎬'], sport: ['Спорт', '🏋️'],
  games: ['Игры', '🎮'], coffee: ['Кофе', '☕'], books: ['Книги', '📚'], photo: ['Фото', '📷'],
  it: ['IT', '💻'], dance: ['Танцы', '💃'], cooking: ['Кулинария', '🍳'], yoga: ['Йога', '🧘'],
  anime: ['Аниме', '🌸'], dogs: ['Собаки', '🐶'], cats: ['Коты', '🐱'], fashion: ['Мода', '👗'],
  cars: ['Автомобили', '🚗'], art: ['Искусство', '🎨'], business: ['Бизнес', '💼'],
  football: ['Футбол', '⚽'], nature: ['Природа', '🌿'], languages: ['Языки', '🌍']
};

const locationText = (card) => {
  if (card.district) return `Ташкент, ${card.district}`;
  return 'Ташкент';
};

const universityText = (card) => {
  if (!card.university) return '';
  const short = typeof card.university === 'string' ? card.university : card.university.short_name;
  const course = card.course_label ? ` · ${card.course_label}` : '';
  return `${short}${course}`;
};

export function createSwipeDeck(options) {
  const { me, cards, onSwipe, onShowProfile, onOpenFilters } = options;
  const deckEl = el('div', { class: 'deck', attrs: { role: 'group', 'aria-label': 'Колода карточек' } });
  const nodes = new Map();
  let queue = cards.slice();
  let busy = false;
  let suppressClickUntil = 0;
  let drag = null;

  const commonInterests = new Set((me && me.interests) || []);

  function photoList(card) {
    if (!card.photos || !card.photos.length) return [];
    return card.photos.map((photo) => photo.path).filter(Boolean);
  }

  function buildDetails(card) {
    const details = el('div', { class: 'swipe-card__details' });
    const head = el('div', { class: 'swipe-card__details-head' });
    head.append(el('div', { class: 'swipe-card__details-title', text: 'Подробнее' }));
    const close = el('button', { class: 'icon-btn-plain', attrs: { type: 'button', 'aria-label': 'Свернуть' } });
    close.innerHTML = icon('chevronDown', { size: 20 });
    close.addEventListener('click', () => {
      // The card owns its own details panel, so the closer is resolved lazily.
      if (card._closeDetails) card._closeDetails();
    });
    head.append(close);
    details.append(head);

    const body = el('div', { class: 'swipe-card__details-body' });

    if (card.bio) {
      const block = el('div', { class: 'detail-block' });
      block.append(el('div', { class: 'detail-block__label', text: 'О себе' }));
      block.append(el('div', { class: 'detail-block__value', text: card.bio }));
      body.append(block);
    }

    const facts = el('div', { class: 'detail-block' });
    facts.append(el('div', { class: 'detail-block__label', text: 'О человеке' }));
    const metaRow = el('div', { class: 'detail-block__value' });
    metaRow.style.display = 'flex';
    metaRow.style.flexWrap = 'wrap';
    metaRow.style.gap = '12px';
    const fact = (name, text) => {
      const item = el('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } });
      item.innerHTML = icon(name, { size: 15 });
      item.append(el('span', { text }));
      metaRow.append(item);
    };
    if (card.job) fact('briefcase', card.job);
    if (card.education) fact('graduation', card.education);
    if (card.height) fact('user', `${card.height} см`);
    fact('mapPin', locationText(card));
    if (card.university) fact('graduation', universityText(card));
    fact('heart', looksForLabel(card.looking_for));
    facts.append(metaRow);
    body.append(facts);

    if (card.interests && card.interests.length) {
      const block = el('div', { class: 'detail-block' });
      block.append(el('div', { class: 'detail-block__label', text: 'Интересы' }));
      const chips = el('div', { class: 'chips' });
      for (const interestId of card.interests) {
        const [label, emoji] = INTEREST_LABELS[interestId] || [interestId, '✨'];
        const chip = el('span', {
          class: `chip chip--static ${commonInterests.has(interestId) ? 'is-common' : ''}`
        });
        chip.append(el('span', { text: emoji }));
        chip.append(el('span', { text: label }));
        chips.append(chip);
      }
      block.append(chips);
      body.append(block);
    }

    if (card.languages && card.languages.length) {
      const block = el('div', { class: 'detail-block' });
      block.append(el('div', { class: 'detail-block__label', text: 'Языки' }));
      block.append(el('div', { class: 'detail-block__value', text: card.languages.join(' · ') }));
      body.append(block);
    }

    const postsBlock = el('div', { class: 'detail-block' });
    postsBlock.append(el('div', { class: 'detail-block__label', text: 'Посты' }));
    const postsGrid = el('div', { class: 'detail-mini-grid' });
    postGridFill(card, postsGrid);
    postsBlock.append(postsGrid);
    body.append(postsBlock);

    const actions = el('div', { class: 'row' });
    const openProfile = el('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button' } });
    openProfile.append(svgIcon('user', { size: 15 }));
    openProfile.append(el('span', { text: 'Открыть профиль' }));
    openProfile.addEventListener('click', () => {
      if (onShowProfile) onShowProfile(card);
      else navigate(`/u/${card.username}`);
    });
    const reportBtn = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' } });
    reportBtn.append(svgIcon('flag', { size: 15 }));
    reportBtn.append(el('span', { text: 'Пожаловаться' }));
    reportBtn.addEventListener('click', () => openReportDialog({ user: card }));
    const blockBtn = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' } });
    blockBtn.append(svgIcon('block', { size: 15 }));
    blockBtn.append(el('span', { text: 'Заблокировать' }));
    blockBtn.addEventListener('click', async () => {
      const done = await openBlockConfirm(card);
      if (done) removeCard(card.id);
    });
    actions.append(openProfile, reportBtn, blockBtn);
    body.append(actions);

    details.append(body);
    return details;
  }

  async function postGridFill(card, grid) {
    grid.append(el('div', { class: 'skeleton', style: { height: '64px', gridColumn: '1 / -1' } }));
    try {
      const data = await api.get(`/feed?username=${encodeURIComponent(card.username)}&limit=4`);
      grid.innerHTML = '';
      if (!data.posts.length) {
        grid.append(
          el('div', {
            class: 'field__hint',
            text: 'Постов пока нет',
            style: { gridColumn: '1 / -1', padding: '6px 0' }
          })
        );
        return;
      }
      for (const post of data.posts) {
        const img = el('img', { attrs: { src: post.image_path, alt: 'Пост', loading: 'lazy' } });
        grid.append(img);
      }
    } catch (err) {
      grid.innerHTML = '';
      grid.append(el('div', { class: 'field__hint', text: 'Не удалось загрузить посты' }));
    }
  }

  function createCard(card) {
    const article = el('article', { class: 'swipe-card', attrs: { 'data-user-id': card.id } });
    const photos = photoList(card);
    let photoIndex = 0;

    const media = el('div', { class: 'swipe-card__media' });
    const img = el('img', { class: 'swipe-card__img', attrs: { alt: '', draggable: 'false' } });
    if (photos.length) {
      img.src = photos[0];
      media.append(img);
    } else {
      const placeholder = el('div', { class: 'swipe-card__placeholder', text: initials(card.display_name) });
      placeholder.style.background = gradientFor(card.display_name);
      media.append(placeholder);
    }

    const segments = el('div', { class: 'photo-segments' });
    if (photos.length > 1) {
      photos.forEach((_, index) => {
        const seg = el('span', { class: `photo-segments__seg ${index === 0 ? 'is-active' : ''}` });
        segments.append(seg);
      });
      media.append(segments);
    }

    const stamps = {
      like: el('div', { class: 'swipe-card__stamp swipe-card__stamp--like', text: 'НРАВИТСЯ' }),
      nope: el('div', { class: 'swipe-card__stamp swipe-card__stamp--nope', text: 'ПРОПУСК' }),
      super: el('div', { class: 'swipe-card__stamp swipe-card__stamp--super', text: 'СУПЕР' })
    };
    media.append(stamps.like, stamps.nope, stamps.super, el('div', { class: 'swipe-card__gradient' }));

    const tapLeft = el('div', { class: 'swipe-card__tap swipe-card__tap--left', attrs: { 'aria-hidden': 'true' } });
    const tapRight = el('div', { class: 'swipe-card__tap swipe-card__tap--right', attrs: { 'aria-hidden': 'true' } });
    media.append(tapLeft, tapRight);

    const info = el('div', { class: 'swipe-card__info' });
    const nameRow = el('div', { class: 'swipe-card__name' });
    nameRow.append(el('span', { text: card.display_name }));
    if (card.age) nameRow.append(el('span', { class: 'swipe-card__age', text: card.age }));
    nameRow.append(ruleBadges(card));
    info.append(nameRow);

    const meta = el('div', { class: 'swipe-card__meta' });
    if (card.online) {
      const online = el('span', { class: 'swipe-card__online' });
      online.append(el('span', { class: 'online-dot' }));
      online.append(el('span', { text: 'в сети' }));
      meta.append(online);
    }
    if (card.university) {
      const uni = el('span', { class: 'swipe-card__university' });
      uni.innerHTML = icon('graduation', { size: 13 });
      uni.append(el('span', { text: universityText(card) }));
      meta.append(uni);
    }
    const dist = el('span');
    dist.innerHTML = icon('mapPin', { size: 13 });
    dist.append(el('span', { text: locationText(card) }));
    meta.append(dist);
    if (card.job) {
      const job = el('span');
      job.innerHTML = icon('briefcase', { size: 13 });
      job.append(el('span', { text: card.job }));
      meta.append(job);
    }
    info.append(meta);
    media.append(info);

    const more = el('button', { class: 'swipe-card__more', attrs: { type: 'button', 'aria-label': 'Подробнее' } });
    more.innerHTML = icon('info', { size: 19 });
    media.append(more);

    const details = buildDetails(card);
    media.append(details);
    article.append(media);

    const updatePhoto = (index) => {
      if (!photos.length) return;
      photoIndex = (index + photos.length) % photos.length;
      img.src = photos[photoIndex];
      const segs = segments.querySelectorAll('.photo-segments__seg');
      segs.forEach((seg, i) => seg.classList.toggle('is-active', i === photoIndex));
    };

    tapLeft.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      if (details.classList.contains('is-open')) return;
      updatePhoto(photoIndex - 1);
    });
    tapRight.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      if (details.classList.contains('is-open')) return;
      updatePhoto(photoIndex + 1);
    });
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = details.classList.toggle('is-open');
      more.classList.toggle('is-active', open);
      if (open) {
        article.style.transform = '';
        stamps.like.style.opacity = '0';
        stamps.nope.style.opacity = '0';
        stamps.super.style.opacity = '0';
      }
    });

    card._photoNext = () => updatePhoto(photoIndex + 1);
    card._updatePhoto = updatePhoto;

    function closeDetails() {
      details.classList.remove('is-open');
      more.classList.remove('is-active');
    }
    card._closeDetails = closeDetails;
    card._element = article;

    function isTop() {
      return queue.length > 0 && queue[0].id === card.id;
    }

    function onPointerDown(event) {
      if (!isTop() || busy) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest('button, a, input, textarea, .swipe-card__details')) return;
      drag = { startX: event.clientX, startY: event.clientY, moved: false, id: event.pointerId };
      article.classList.add('is-dragging');
      if (article.setPointerCapture) article.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!drag || drag.id !== event.pointerId || !isTop()) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
      const rotate = Math.max(-15, Math.min(15, dx / 18));
      article.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
      const likeOpacity = dx > 0 ? Math.min(1, dx / 110) : 0;
      const nopeOpacity = dx < 0 ? Math.min(1, -dx / 110) : 0;
      const superOpacity = dy < 0 && Math.abs(dy) > Math.abs(dx) * 0.8 ? Math.min(1, -dy / 130) : 0;
      stamps.like.style.opacity = String(likeOpacity * (1 - superOpacity));
      stamps.nope.style.opacity = String(nopeOpacity * (1 - superOpacity));
      stamps.super.style.opacity = String(superOpacity);
    }

    function onPointerUp(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const moved = drag.moved;
      drag = null;
      article.classList.remove('is-dragging');
      const width = article.offsetWidth || 340;
      const threshold = Math.max(84, width * 0.24);
      if (moved) suppressClickUntil = Date.now() + 260;
      if (dy < -130 && Math.abs(dy) > Math.abs(dx) * 0.8) {
        fly(card, 'super');
        return;
      }
      if (dx > threshold) {
        fly(card, 'like');
        return;
      }
      if (dx < -threshold) {
        fly(card, 'nope');
        return;
      }
      article.style.transform = '';
      stamps.like.style.opacity = '0';
      stamps.nope.style.opacity = '0';
      stamps.super.style.opacity = '0';
    }

    article.addEventListener('pointerdown', onPointerDown);
    article.addEventListener('pointermove', onPointerMove);
    article.addEventListener('pointerup', onPointerUp);
    article.addEventListener('pointercancel', onPointerUp);

    return article;
  }

  function resetNode(node) {
    node.classList.remove('swipe-card--behind', 'swipe-card--behind2', 'is-flying');
    node.style.transform = '';
    node.style.opacity = '';
    node.querySelectorAll('.swipe-card__stamp').forEach((stamp) => {
      stamp.style.opacity = '0';
    });
  }

  function renderPositions() {
    const visible = queue.slice(0, 3);
    const ids = new Set(visible.map((card) => card.id));
    for (const [id, node] of [...nodes.entries()]) {
      if (!ids.has(id)) {
        node.remove();
        nodes.delete(id);
      }
    }

    [...visible].reverse().forEach((card) => {
      let node = nodes.get(card.id);
      if (!node) {
        node = createCard(card);
        nodes.set(card.id, node);
      }
      deckEl.append(node);
    });

    visible.forEach((card, index) => {
      const node = nodes.get(card.id);
      if (!node) return;
      resetNode(node);
      if (index === 1) node.classList.add('swipe-card--behind');
      if (index === 2) node.classList.add('swipe-card--behind2');
      if (index >= 3) node.classList.add('swipe-card--hidden');
      if (index === 0) node.classList.remove('swipe-card--hidden');
    });

    // Hide cards beyond the visible stack.
    for (const [id, node] of nodes.entries()) {
      const index = queue.findIndex((card) => card.id === id);
      node.classList.toggle('swipe-card--hidden', index === -1 || index > 2);
    }
    deckEl.style.display = queue.length ? '' : 'none';
  }

  function fly(card, action) {
    if (busy || !queue.length || queue[0].id !== card.id) return;
    busy = true;
    const node = nodes.get(card.id);
    if (node) {
      node.classList.add('is-flying');
      const dir = action === 'nope' ? -1 : 1;
      node.style.transform =
        action === 'super'
          ? 'translate(0, -140%) rotate(-4deg)'
          : `translate(${dir * 130}%, 20px) rotate(${dir * 22}deg)`;
      node.style.opacity = '0';
    }
    if (card._closeDetails) card._closeDetails();
    queue.shift();
    if (onSwipe) onSwipe(card, action);

    setTimeout(() => {
      if (node) {
        node.remove();
        nodes.delete(card.id);
      }
      busy = false;
      renderPositions();
      if (!queue.length && options.onEmpty) options.onEmpty();
    }, 270);
  }

  function swipe(action) {
    if (busy || !queue.length) return false;
    fly(queue[0], action);
    return true;
  }

  function nextPhoto() {
    const top = queue[0];
    if (top && top._photoNext) top._photoNext();
  }

  function prepend(card) {
    if (!card) return;
    queue.unshift(card);
    renderPositions();
  }

  function removeCard(id) {
    queue = queue.filter((card) => card.id !== id);
    renderPositions();
  }

  function setCards(list) {
    queue = list.slice();
    for (const node of nodes.values()) node.remove();
    nodes.clear();
    renderPositions();
  }

  function destroy() {
    drag = null;
    deckEl.remove();
  }

  renderPositions();

  return {
    el: deckEl,
    swipe,
    nextPhoto,
    prepend,
    removeCard,
    setCards,
    destroy,
    count: () => queue.length,
    top: () => queue[0] || null
  };
}
