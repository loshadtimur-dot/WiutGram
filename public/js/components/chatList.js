import { api } from '../api.js?v=25';
import { el, avatarNode, emptyState, button, shortTimeAgo, loadingRow } from '../ui.js?v=25';
import { getState } from '../state.js?v=25';
import { icon } from '../icons.js?v=25';
import { onSocket } from '../socket.js?v=25';
import { navigate } from '../router.js?v=25';

export function previewText(match) {
  const last = match.last_message;
  if (!last) return 'Новый матч — напишите первым!';
  if (last.deleted) return 'Сообщение удалено';
  if (last.type === 'image') return '📷 Фото';
  if (last.type === 'system') return 'Вы лайкнули друг друга';
  const mine = getState().user && last.sender_id === getState().user.id;
  return `${mine ? 'Вы: ' : ''}${last.body || ''}`;
}

export function createChatList(options = {}) {
  const wrap = el('div', { class: 'chats-panel' });
  const head = el('div', { class: 'chats-panel__head' });
  head.append(el('div', { class: 'chats-panel__title', text: 'Сообщения' }));
  const newMatchBtn = el('button', {
    class: 'btn-icon',
    attrs: { type: 'button', 'aria-label': 'Найти новых людей' },
    style: { width: '36px', height: '36px' }
  });
  newMatchBtn.innerHTML = icon('flame', { size: 18 });
  newMatchBtn.addEventListener('click', () => navigate('/swipe'));
  head.append(newMatchBtn);
  wrap.append(head);

  const scroll = el('div', { class: 'chats-scroll' });
  wrap.append(scroll);

  let matches = [];
  let loading = true;
  let activeId = Number(options.activeId) || 0;

  function render() {
    scroll.innerHTML = '';
    if (loading) {
      scroll.append(loadingRow('Загружаем диалоги…'));
      return;
    }
    if (!matches.length) {
      scroll.append(
        emptyState(
          '💬',
          'Пока нет матчей',
          'Свайпните вправо — при взаимном лайке здесь появится диалог.',
          button('К свайпам', { variant: 'btn-primary', onClick: () => navigate('/swipe') })
        )
      );
      return;
    }

    const fresh = matches.filter((match) => !match.started);
    if (fresh.length) {
      const title = el('div', { class: 'sidebar__chats-head', style: { padding: '4px 8px 2px' } });
      title.append(el('span', { text: 'Новые матчи' }));
      scroll.append(title);
      const rail = el('div', { class: 'new-matches' });
      for (const match of fresh) {
        const item = el('div', { class: 'new-match' });
        const ring = el('div', { class: 'avatar-ring avatar-ring--story' });
        ring.append(avatarNode(match.user, 'md'));
        ring.addEventListener('click', () => select(match));
        item.append(ring);
        item.append(el('div', { class: 'new-match__name', text: match.user.display_name }));
        item.addEventListener('click', () => select(match));
        rail.append(item);
      }
      scroll.append(rail);
    }

    const listTitle = el('div', { class: 'sidebar__chats-head', style: { padding: '4px 8px 2px' } });
    listTitle.append(el('span', { text: 'Диалоги' }));
    scroll.append(listTitle);

    for (const match of matches) {
      const row = el('div', {
        class: `chat-row ${match.unread ? 'is-unread' : ''} ${match.id === activeId ? 'is-active' : ''}`,
        attrs: { role: 'button', tabindex: '0' }
      });
      const avatarWrap = el('div', { class: 'chat-row__avatar' });
      avatarWrap.append(avatarNode(match.user, 'md'));
      if (getState().online.get(match.user.id)) avatarWrap.append(el('span', { class: 'online-status' }));
      row.append(avatarWrap);

      const body = el('div', { class: 'chat-row__body' });
      const top = el('div', { class: 'chat-row__top' });
      top.append(el('div', { class: 'chat-row__name', text: match.user.display_name }));
      top.append(el('div', { class: 'chat-row__time', text: shortTimeAgo(match.last_activity) }));
      body.append(top);
      const preview = el('div', { class: 'chat-row__preview' });
      preview.append(el('span', { text: previewText(match) }));
      body.append(preview);
      row.append(body);
      if (match.unread) row.append(el('span', { class: 'chat-row__unread', text: String(match.unread) }));

      row.addEventListener('click', () => select(match));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(match);
        }
      });
      scroll.append(row);
    }
  }

  function select(match) {
    activeId = match.id;
    if (options.onSelect) options.onSelect(match);
    else navigate(`/chat/${match.id}`);
  }

  async function refresh() {
    try {
      const data = await api.get('/matches');
      matches = data.matches || [];
      loading = false;
      render();
      return matches;
    } catch (err) {
      loading = false;
      scroll.innerHTML = '';
      scroll.append(
        emptyState('😕', 'Не удалось загрузить чаты', err.message || 'Попробуйте позже', button('Повторить', {
          variant: 'btn-secondary',
          onClick: refresh
        }))
      );
      return [];
    }
  }

  function setActive(id) {
    activeId = Number(id) || 0;
    render();
  }

  const offNew = onSocket('message:new', () => refresh());
  const offRemoved = onSocket('match:removed', () => refresh());
  const offMatch = onSocket('match:new', () => refresh());
  const offRead = onSocket('message:read', () => refresh());
  const offPresence = onSocket('presence:update', () => render());

  render();
  refresh();

  return {
    el: wrap,
    refresh,
    setActive,
    getMatches: () => matches,
    destroy() {
      offNew();
      offRemoved();
      offMatch();
      offRead();
      offPresence();
    }
  };
}
