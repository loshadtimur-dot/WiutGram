import { api } from '../api.js?v=19';
import { el, button, toast, emptyState, skeletonGrid, initials, gradientFor, timeAgo } from '../ui.js?v=19';
import { getState, setCounts, incrementCount } from '../state.js?v=19';
import { icon } from '../icons.js?v=19';
import { showMatchScreen } from '../components/match.js?v=19';
import { navigate } from '../router.js?v=19';

const TABS = [
  { id: 'likes', label: 'Лайкнули меня', endpoint: '/swipes/likes-me' },
  { id: 'mine', label: 'Мои лайки', endpoint: '/swipes/my-likes' },
  { id: 'super', label: 'Суперлайки', endpoint: '/swipes/super' }
];

export default async function LikesPage() {
  const root = el('div', { class: 'page', style: { maxWidth: '1080px', margin: '0 auto' } });

  const head = el('div', { class: 'section__head', style: { marginBottom: '14px' } });
  const headText = el('div');
  headText.append(el('h1', { text: 'Лайки', style: { fontSize: '24px', letterSpacing: '-0.03em' } }));
  headText.append(
    el('p', { class: 'section__subtitle', text: 'Люди, которым вы понравились. Взаимный лайк сразу открывает чат.' })
  );
  head.append(headText);
  root.append(head);

  const tabs = el('div', { class: 'pills' });
  const tabButtons = new Map();
  for (const tab of TABS) {
    const btn = el('button', { class: 'chip', attrs: { type: 'button' } });
    btn.append(el('span', { text: tab.label }));
    const count = el('span', { class: 'badge badge--muted', text: '0' });
    btn.append(count);
    btn.addEventListener('click', () => select(tab.id));
    tabButtons.set(tab.id, { btn, count });
    tabs.append(btn);
  }
  root.append(tabs);

  const superNote = el('div', { class: 'like-super-note hidden' });
  superNote.innerHTML = icon('star', { size: 16, fill: true });
  superNote.append(el('span', { text: 'Суперлайки выделены синей рамкой — они особенно важны.' }));
  root.append(superNote);

  const content = el('div', { style: { marginTop: '14px' } });
  root.append(content);

  let activeTab = 'likes';
  let loading = false;

  function select(tabId) {
    activeTab = tabId;
    tabButtons.forEach(({ btn }, id) => btn.classList.toggle('is-active', id === tabId));
    load();
  }

  function cardNode(user, mode) {
    const card = el('article', { class: `like-card ${user.is_super ? 'is-super' : ''}` });
    const media = el('div', { class: 'like-card__media' });
    const avatar = el('div', { class: 'avatar', style: { width: '100%', height: '100%', borderRadius: '0' } });
    avatar.style.background = gradientFor(user.display_name);
    if (user.avatar_path) {
      const img = el('img', { attrs: { src: user.avatar_path, alt: `Фото ${user.display_name}`, loading: 'lazy' } });
      img.addEventListener('error', () => {
        avatar.textContent = initials(user.display_name);
      });
      avatar.append(img);
    } else {
      avatar.textContent = initials(user.display_name);
    }
    media.append(avatar);
    media.append(el('div', { class: 'like-card__gradient' }));
    if (user.online) {
      const online = el('div', { class: 'like-card__online' });
      online.append(el('span', { class: 'online-dot' }));
      online.append(el('span', { text: 'в сети' }));
      media.append(online);
    }
    if (user.is_super) {
      const star = el('div', { class: 'like-card__star' });
      star.innerHTML = icon('star', { size: 15, fill: true });
      media.append(star);
    }
    const info = el('div', { class: 'like-card__info' });
    const name = el('div', { class: 'like-card__name', text: user.display_name });
    if (user.age) name.append(el('span', { text: user.age }));
    info.append(name);
    const metaParts = [];
    if (user.university) metaParts.push(user.university.short_name || user.university);
    if (user.district) metaParts.push(user.district);
    if (mode === 'mine' && user.mutual) metaParts.push('взаимно');
    if (mode === 'mine' && !user.mutual) metaParts.push('ждёт ответа');
    if (user.swiped_at) metaParts.push(timeAgo(user.swiped_at));
    info.append(el('div', { class: 'like-card__meta', text: metaParts.join(' · ') }));
    media.append(info);

    media.addEventListener('click', () => navigate(`/u/${user.username}`));
    card.append(media);

    if (mode !== 'mine') {
      const actions = el('div', { class: 'like-card__actions' });
      const nope = el('button', { class: 'like-action--nope', attrs: { type: 'button' } });
      nope.append(el('span', { text: 'Нет' }));
      nope.addEventListener('click', () => respond(user, 'nope', card));
      const like = el('button', { class: 'like-action--like', attrs: { type: 'button' } });
      like.innerHTML = icon('heart', { size: 13, fill: true });
      like.append(el('span', { text: 'Лайк' }));
      like.addEventListener('click', () => respond(user, 'like', card));
      actions.append(nope, like);
      card.append(actions);
    } else {
      const actions = el('div', { class: 'like-card__actions' });
      const openBtn = el('button', { class: 'like-action--like', attrs: { type: 'button' } });
      openBtn.append(el('span', { text: 'Открыть профиль' }));
      openBtn.addEventListener('click', () => navigate(`/u/${user.username}`));
      actions.append(openBtn);
      card.append(actions);
    }
    return card;
  }

  async function respond(user, action, node) {
    node.style.opacity = '0.5';
    try {
      const result = await api.post('/swipes', { to_id: user.id, action });
      node.remove();
      if (action !== 'nope') decrementBadge(activeTab);
      if (result.is_match && result.match) {
        showMatchScreen(result.match, { me: getState().user });
      }
      setCounts({ likes: Math.max(0, (getState().counts.likes || 0) - 1) });
    } catch (err) {
      node.style.opacity = '1';
      toast(err.message || 'Не удалось отправить реакцию', 'error');
    }
  }

  function decrementBadge(tabId) {
    const entry = tabButtons.get(tabId);
    if (!entry) return;
    const value = Math.max(0, Number(entry.count.textContent || 0) - 1);
    entry.count.textContent = String(value);
    if (!content.querySelector('.like-card')) {
      select(tabId);
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    content.innerHTML = '';
    content.append(skeletonGrid(6));
    const tab = TABS.find((item) => item.id === activeTab);
    try {
      const data = await api.get(tab.endpoint);
      content.innerHTML = '';
      const users = data.users || [];
      if (activeTab === 'likes') {
        tabButtons.get('likes').count.textContent = String(data.total || users.length);
        tabButtons.get('super').count.textContent = String(data.super_count || 0);
        setCounts({ likes: data.total || 0 });
      }
      if (activeTab === 'mine') tabButtons.get('mine').count.textContent = String(users.length);
      if (activeTab === 'super') tabButtons.get('super').count.textContent = String(users.length);

      superNote.classList.toggle('hidden', activeTab !== 'likes' || !data.super_count);

      if (!users.length) {
        const messages = {
          likes: ['💗', 'Пока никто не лайкнул', 'Свайпайте активнее и заполните профиль — так вас чаще показывают другим.'],
          mine: ['💫', 'Вы ещё никого не лайкнули', 'Начните со свайпов — здесь появятся все, кому вы понравились.'],
          super: ['⭐', 'Суперлайков пока нет', 'Суперлайк сразу выделяет вас — его сложно не заметить.']
        }[activeTab];
        const wrap = el('div');
        wrap.append(
          emptyState(messages[0], messages[1], messages[2], button('Перейти к свайпам', {
            variant: 'btn-primary',
            onClick: () => navigate('/swipe')
          }))
        );
        content.append(wrap);
        return;
      }

      const grid = el('div', { class: 'likes-grid' });
      for (const user of users) grid.append(cardNode(user, activeTab));
      content.append(grid);
    } catch (err) {
      content.innerHTML = '';
      content.append(
        emptyState('😕', 'Не удалось загрузить лайки', err.message || 'Попробуйте позже', button('Повторить', {
          variant: 'btn-secondary',
          onClick: load
        }))
      );
    } finally {
      loading = false;
    }
  }

  select('likes');

  return root;
}
