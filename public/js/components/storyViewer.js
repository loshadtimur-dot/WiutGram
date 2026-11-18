import { api } from '../api.js?v=19';
import { el, avatarNode, timeAgo, toast, emptyState } from '../ui.js?v=19';
import { icon } from '../icons.js?v=19';
import { getState } from '../state.js?v=19';

const STORY_DURATION = 5000;

export function openStoryViewer(feeds, startFeed = 0, startStory = 0, options = {}) {
  if (!feeds || !feeds.length) return null;
  const me = getState().user;
  let feedIndex = Math.min(startFeed, feeds.length - 1);
  let storyIndex = Math.min(startStory, (feeds[feedIndex].stories || []).length - 1);
  let elapsed = 0;
  let startedAt = 0;
  let rafId = null;
  let paused = false;
  let closed = false;

  const viewer = el('div', { class: 'story-viewer', attrs: { role: 'dialog', 'aria-modal': 'true' } });
  const card = el('div', { class: 'story-viewer__card' });
  viewer.append(card);

  const imageWrap = el('div', { class: 'story-viewer__image' });
  const image = el('img', { attrs: { alt: 'История' } });
  imageWrap.append(image);
  card.append(imageWrap);
  card.append(el('div', { class: 'story-viewer__shade' }));

  const progress = el('div', { class: 'story-progress' });
  card.append(progress);

  const head = el('div', { class: 'story-viewer__head' });
  const avatarHolder = el('div');
  const headText = el('div');
  const nameRow = el('div', { class: 'story-viewer__name' });
  headText.append(nameRow);
  const timeRow = el('div', { class: 'story-viewer__time' });
  headText.append(timeRow);
  head.append(avatarHolder, headText);
  card.append(head);

  const closeBtn = el('button', { class: 'story-viewer__close', attrs: { type: 'button', 'aria-label': 'Закрыть' } });
  closeBtn.innerHTML = icon('x', { size: 18 });
  closeBtn.addEventListener('click', close);
  card.append(closeBtn);

  const caption = el('div', { class: 'story-viewer__caption' });
  card.append(caption);

  const foot = el('div', { class: 'story-viewer__foot' });
  card.append(foot);

  const prevZone = el('button', { class: 'story-viewer__nav story-viewer__nav--prev', attrs: { type: 'button', 'aria-label': 'Предыдущая история' } });
  const nextZone = el('button', { class: 'story-viewer__nav story-viewer__nav--next', attrs: { type: 'button', 'aria-label': 'Следующая история' } });
  card.append(prevZone, nextZone);

  const viewersPanel = el('div', { class: 'story-viewers-list' });
  card.append(viewersPanel);

  prevZone.addEventListener('click', () => previous());
  nextZone.addEventListener('click', () => next());

  let holdTimer = null;
  card.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    holdTimer = setTimeout(() => {
      paused = true;
      pauseProgress();
    }, 180);
  });
  const release = () => {
    clearTimeout(holdTimer);
    if (paused) {
      paused = false;
      resumeProgress();
    }
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointerleave', release);
  card.addEventListener('pointercancel', release);

  function currentFeed() {
    return feeds[feedIndex];
  }
  function currentStory() {
    const feed = currentFeed();
    return feed && feed.stories ? feed.stories[storyIndex] : null;
  }

  function renderProgress() {
    progress.innerHTML = '';
    const stories = currentFeed().stories || [];
    stories.forEach((story, index) => {
      const seg = el('div', {
        class: `story-progress__seg ${index < storyIndex ? 'is-done' : ''} ${index === storyIndex ? 'is-active' : ''}`
      });
      const fill = el('span', { class: 'story-progress__fill' });
      if (index < storyIndex) fill.style.width = '100%';
      if (index === storyIndex) fill.style.width = '0%';
      seg.append(fill);
      progress.append(seg);
    });
  }

  function render() {
    const feed = currentFeed();
    const story = currentStory();
    if (!feed || !story) {
      close();
      return;
    }
    image.src = story.media_path;
    avatarHolder.innerHTML = '';
    avatarHolder.append(avatarNode(feed.user, 'sm'));
    nameRow.innerHTML = '';
    nameRow.append(el('span', { text: feed.user.display_name }));
    nameRow.append(el('span', { text: '·' }));
    nameRow.append(el('span', { text: timeAgo(story.created_at) }));
    timeRow.textContent = '';
    caption.textContent = story.caption || '';
    caption.style.display = story.caption ? '' : 'none';

    renderProgress();
    foot.innerHTML = '';
    if (story.is_mine) {
      const viewsBtn = el('button', { class: 'btn btn-outline btn-sm', attrs: { type: 'button' } });
      viewsBtn.style.background = 'rgba(255,255,255,.14)';
      viewsBtn.style.color = '#fff';
      viewsBtn.style.borderColor = 'rgba(255,255,255,.3)';
      viewsBtn.append(el('span', { text: 'Посмотреть зрителей' }));
      viewsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        openViewers(story);
      });
      foot.append(viewsBtn);
      const deleteBtn = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' } });
      deleteBtn.style.color = '#ffb3bd';
      deleteBtn.innerHTML = icon('trash', { size: 15 });
      deleteBtn.append(el('span', { text: 'Удалить' }));
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await api.delete(`/stories/${story.id}`);
          feed.stories = feed.stories.filter((item) => item.id !== story.id);
          feeds = feeds.filter((item) => item.stories.length);
          if (!feed.stories.length) {
            feedIndex = Math.min(feedIndex, feeds.length - 1);
            storyIndex = 0;
          } else {
            storyIndex = Math.min(storyIndex, feed.stories.length - 1);
          }
          if (!feeds.length) {
            close();
            return;
          }
          render();
          restartProgress();
        } catch (err) {
          toast(err.message || 'Не удалось удалить историю', 'error');
        }
      });
      foot.append(deleteBtn);
    } else {
      const openProfile = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' } });
      openProfile.style.color = '#fff';
      openProfile.append(el('span', { text: `Профиль ${feed.user.display_name}` }));
      openProfile.addEventListener('click', (event) => {
        event.stopPropagation();
        close();
        window.history.pushState({}, '', `/u/${feed.user.username}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      foot.append(openProfile);
    }

    if (!story.viewed && !story.is_mine) {
      api
        .post(`/stories/${story.id}/view`)
        .then(() => {
          story.viewed = true;
          feed.all_viewed = (feed.stories || []).every((item) => item.viewed || item.is_mine);
        })
        .catch(() => {});
    }
    restartProgress();
  }

  async function openViewers(story) {
    viewersPanel.innerHTML = '';
    viewersPanel.append(el('h4', { text: 'Зрители истории' }));
    viewersPanel.append(el('div', { class: 'field__hint', text: 'Загружаем…', style: { color: '#cbd2df' } }));
    viewersPanel.classList.add('is-open');
    try {
      const data = await api.get(`/stories/${story.id}/viewers`);
      viewersPanel.innerHTML = '';
      viewersPanel.append(el('h4', { text: `Зрители · ${data.viewers.length}` }));
      if (!data.viewers.length) {
        viewersPanel.append(el('div', { class: 'field__hint', text: 'Пока никто не смотрел', style: { color: '#cbd2df' } }));
        return;
      }
      for (const item of data.viewers) {
        const row = el('div', { class: 'list-row' });
        row.style.color = '#fff';
        row.append(avatarNode(item.user, 'sm'));
        const body = el('div', { class: 'list-row__body' });
        body.append(el('div', { class: 'list-row__title', text: item.user.display_name, style: { color: '#fff' } }));
        body.append(el('div', { class: 'field__hint', text: timeAgo(item.viewed_at), style: { color: '#cbd2df' } }));
        row.append(body);
        viewersPanel.append(row);
      }
    } catch (err) {
      viewersPanel.innerHTML = '';
      viewersPanel.append(emptyState('😕', 'Не удалось загрузить', err.message || ''));
    }
  }

  function tick() {
    if (closed) return;
    const progressNow = performance.now() - startedAt;
    const ratio = Math.min(1, progressNow / STORY_DURATION);
    const activeFill = progress.querySelector('.story-progress__seg.is-active .story-progress__fill');
    if (activeFill) activeFill.style.width = `${ratio * 100}%`;
    if (ratio >= 1) {
      next();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function restartProgress() {
    cancelAnimationFrame(rafId);
    elapsed = 0;
    startedAt = performance.now();
    if (!paused) rafId = requestAnimationFrame(tick);
  }
  function pauseProgress() {
    elapsed = performance.now() - startedAt;
    cancelAnimationFrame(rafId);
  }
  function resumeProgress() {
    startedAt = performance.now() - elapsed;
    rafId = requestAnimationFrame(tick);
  }

  function next() {
    const feed = currentFeed();
    if (storyIndex < (feed.stories || []).length - 1) {
      storyIndex += 1;
      render();
      return;
    }
    if (feedIndex < feeds.length - 1) {
      feedIndex += 1;
      storyIndex = 0;
      render();
      return;
    }
    close();
  }

  function previous() {
    if (storyIndex > 0) {
      storyIndex -= 1;
      render();
      return;
    }
    if (feedIndex > 0) {
      feedIndex -= 1;
      storyIndex = Math.max(0, (feeds[feedIndex].stories || []).length - 1);
      render();
      return;
    }
    restartProgress();
  }

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKey);
    viewer.remove();
    document.body.style.overflow = '';
    if (options.onClose) options.onClose();
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') previous();
  }

  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(viewer);
  render();

  if (!currentStory()) close();

  return { close };
}

// Story rails on explore and profile screens.
export function createStoryRail(feeds, options = {}) {
  const rail = el('div', { class: 'story-rail' });

  if (options.allowAdd) {
    const bubble = el('div', { class: 'story-bubble' });
    const ring = el('div', { class: 'story-bubble__ring' });
    ring.style.background = 'var(--surface-3)';
    const inner = el('div', { class: 'story-bubble__avatar' });
    inner.style.background = 'var(--surface)';
    inner.style.color = 'var(--brand-1)';
    inner.innerHTML = icon('plus', { size: 24 });
    ring.append(inner);
    const add = el('button', { class: 'story-bubble__add', attrs: { type: 'button', 'aria-label': 'Добавить историю' } });
    add.innerHTML = icon('plus', { size: 11 });
    add.addEventListener('click', (event) => {
      event.stopPropagation();
      if (options.onAdd) options.onAdd();
    });
    ring.append(add);
    bubble.append(ring);
    bubble.append(el('div', { class: 'story-bubble__name', text: 'Ваша история' }));
    bubble.addEventListener('click', () => options.onAdd && options.onAdd());
    rail.append(bubble);
  }

  feeds.forEach((feed, index) => {
    const bubble = el('div', { class: `story-bubble ${feed.all_viewed ? 'is-seen' : ''}` });
    const ring = el('div', { class: 'story-bubble__ring' });
    ring.append(avatarNode(feed.user, 'md'));
    bubble.append(ring);
    bubble.append(el('div', { class: 'story-bubble__name', text: feed.user.display_name }));
    bubble.addEventListener('click', () => {
      const viewer = openStoryViewer(feeds, index, 0, { onClose: options.onClose });
      if (options.onOpen) options.onOpen(viewer);
    });
    rail.append(bubble);
  });

  return rail;
}
