import { api } from '../api.js?v=31';
import { el, avatarNode, button, emptyState, loadingRow, shortTimeAgo, openModal, confirmDialog, toast } from '../ui.js?v=31';
import { getState } from '../state.js?v=31';
import { icon } from '../icons.js?v=31';
import { onSocket } from '../socket.js?v=31';
import { navigate } from '../router.js?v=31';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'dm', label: 'Личные' },
  { key: 'group', label: 'Группы' },
  { key: 'unread', label: 'Непрочитанные' },
  { key: 'requests', label: 'Запросы' },
  { key: 'archived', label: 'Архив' }
];

function previewText(conversation, me) {
  const last = conversation.last_message;
  if (!last) return conversation.type === 'saved' ? 'Заметки и пересланные сообщения' : 'Нет сообщений';
  if (last.deleted) return 'Сообщение удалено';
  if (last.type === 'image') return '📷 Фото';
  if (last.type === 'voice') return '🎤 Голосовое';
  if (last.type === 'gift') return '🎁 Подарок';
  if (last.type === 'poll') return '📊 Опрос';
  if (last.type === 'system') return last.body || '';
  const mine = me && last.sender_id === me.id;
  return `${mine ? 'Вы: ' : ''}${last.body || ''}`;
}

export function openRequestsModal(onDone) {
  const body = el('div');
  const modal = openModal({ title: 'Запросы на переписку', body, size: 'wide' });
  async function load() {
    body.innerHTML = '';
    body.append(loadingRow());
    try {
      const data = await api.get('/conversations/requests');
      body.innerHTML = '';
      if (!data.requests.length) {
        body.append(emptyState('📭', 'Нет запросов', 'Сюда попадут сообщения от людей, с которыми у вас нет матча.'));
        return;
      }
      for (const request of data.requests) {
        const card = el('div', { class: 'group-card', style: { marginBottom: '8px' } });
        card.append(avatarNode({ display_name: request.display_name, avatar_path: request.avatar_path }, 'md'));
        const info = el('div', { style: { flex: '1', minWidth: '0' } });
        info.append(el('div', { class: 'people-card__name', text: request.display_name }));
        info.append(el('div', { class: 'people-card__meta', text: request.first_message || 'Хочет начать переписку' }));
        card.append(info);
        const actions = el('div', { class: 'row' });
        actions.append(
          button('Принять', {
            variant: 'btn-primary btn-sm',
            onClick: async () => {
              await api.post(`/conversations/requests/${request.id}/accept`);
              toast('Запрос принят', 'success');
              request.accepted = true;
              load();
              if (onDone) onDone();
            }
          }),
          button('Отклонить', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              await api.post(`/conversations/requests/${request.id}/decline`);
              load();
            }
          }),
          button('Блок', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              await api.post(`/conversations/requests/${request.id}/block`);
              toast('Пользователь заблокирован');
              load();
            }
          })
        );
        card.append(actions);
        body.append(card);
      }
    } catch (err) {
      body.innerHTML = '';
      body.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить запросы' }));
    }
  }
  load();
  return modal;
}

export function createConversationList(options = {}) {
  const root = el('div', { class: 'chats-panel' });
  const head = el('div', { class: 'chats-panel__head' });
  head.append(el('div', { class: 'chats-panel__title', text: 'Чаты' }));
  const headActions = el('div', { class: 'row' });

  const savedBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', title: 'Избранное', 'aria-label': 'Избранное' } });
  savedBtn.innerHTML = icon('star', { size: 18 });
  savedBtn.addEventListener('click', async () => {
    try {
      const data = await api.post('/conversations/saved');
      navigate(`/chat/${data.conversation.id}`);
    } catch (err) {
      toast(err.message || 'Не удалось открыть избранное', 'error');
    }
  });

  const newBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', title: 'Новый чат', 'aria-label': 'Новый чат' } });
  newBtn.innerHTML = icon('plus', { size: 20 });
  newBtn.addEventListener('click', () => import('./chatModals.js?v=31').then((mod) => mod.openNewChatModal()));

  const groupBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', title: 'Создать группу', 'aria-label': 'Создать группу' } });
  groupBtn.innerHTML = icon('users', { size: 18 });
  groupBtn.addEventListener('click', () => import('./chatModals.js?v=31').then((mod) => mod.openCreateGroupModal()));

  headActions.append(savedBtn, groupBtn, newBtn);
  head.append(headActions);
  root.append(head);

  const filters = el('div', { class: 'shop-chips', style: { padding: '0 12px 8px' } });
  const searchWrap = el('div', { style: { padding: '0 12px 8px' } });
  const search = el('input', {
    class: 'input',
    attrs: { type: 'search', placeholder: 'Поиск по чатам', 'aria-label': 'Поиск по чатам' }
  });
  searchWrap.append(search);

  const scroll = el('div', { class: 'chats-scroll' });
  root.append(filters, searchWrap, scroll);

  const me = getState().user;
  let conversations = [];
  let mutuals = [];
  let filter = 'all';
  let query = '';
  let loading = true;
  let activeId = Number(options.activeId) || 0;

  function renderFilters() {
    filters.innerHTML = '';
    for (const entry of FILTERS) {
      const chip = el('button', {
        class: `shop-chip ${filter === entry.key ? 'is-active' : ''}`,
        text: entry.label,
        attrs: { type: 'button' }
      });
      chip.addEventListener('click', () => {
        filter = entry.key;
        renderFilters();
        refresh();
      });
      filters.append(chip);
    }
  }

  function render() {
    scroll.innerHTML = '';
    if (loading) {
      scroll.append(loadingRow('Загружаем чаты…'));
      return;
    }
    const visible = conversations.filter((item) => !query || item.title.toLowerCase().includes(query));
    const showMutuals = filter === 'all' && !query && mutuals.length > 0;
    if (showMutuals) {
      const section = el('div', { class: 'chat-section' });
      section.append(el('div', { class: 'chat-section__title', text: 'Взаимные подписки' }));
      for (const person of mutuals) {
        const row = el('div', {
          class: 'chat-row chat-row--mutual',
          attrs: { role: 'button', tabindex: '0', 'aria-label': `Написать ${person.display_name}` }
        });
        const avatarWrap = el('div', { class: 'chat-row__avatar' });
        avatarWrap.append(avatarNode(person, 'md'));
        row.append(avatarWrap);
        const body = el('div', { class: 'chat-row__body' });
        body.append(el('div', { class: 'chat-row__name', text: person.display_name }));
        body.append(
          el('div', {
            class: 'chat-row__preview',
            text: 'Взаимная подписка'
          })
        );
        row.append(body, el('span', { class: 'chat-greet-pill', text: 'Привет' }));
        const open = async () => {
          try {
            const data = await api.post('/conversations/dm', { username: person.username });
            sessionStorage.setItem(`chat:greet:${data.conversation.id}`, '1');
            if (options.onSelect) options.onSelect(data.conversation);
            else navigate(`/chat/${data.conversation.id}`);
          } catch (err) {
            toast(err.message || 'Не удалось открыть чат', 'error');
          }
        };
        row.addEventListener('click', open);
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') open();
        });
        section.append(row);
      }
      scroll.append(section);
    }
    if (!visible.length && !showMutuals) {
      scroll.append(
        emptyState(
          '💬',
          filter === 'requests' ? 'Нет запросов' : 'Пока пусто',
          filter === 'group' ? 'Создайте группу и пригласите друзей.' : 'Найдите людей и начните переписку.',
          button('Найти людей', { variant: 'btn-primary', onClick: () => navigate('/people') })
        )
      );
      return;
    }
    for (const conversation of visible) {
      const row = el('div', {
        class: `chat-row ${conversation.unread ? 'is-unread' : ''} ${conversation.id === activeId ? 'is-active' : ''}`,
        attrs: { role: 'button', tabindex: '0' }
      });
      const avatarWrap = el('div', { class: 'chat-row__avatar' });
      if (conversation.type === 'saved') {
        const circle = el('div', { class: 'group-card__avatar' });
        circle.style.background = 'var(--brand-gradient)';
        circle.innerHTML = icon('star', { size: 20 });
        avatarWrap.append(circle);
      } else if (conversation.type === 'group') {
        const circle = el('div', { class: 'group-card__avatar', text: (conversation.title || 'Г').slice(0, 1).toUpperCase() });
        avatarWrap.append(circle);
      } else {
        avatarWrap.append(
          avatarNode(
            { display_name: conversation.title, avatar_path: conversation.photo, username: conversation.title },
            'md'
          )
        );
        if (conversation.peer && getState().online.get(conversation.peer.id)) {
          avatarWrap.append(el('span', { class: 'online-status' }));
        }
      }
      row.append(avatarWrap);

      const body = el('div', { class: 'chat-row__body' });
      const top = el('div', { class: 'chat-row__top' });
      const name = el('div', { class: 'chat-row__name' });
      name.append(el('span', { text: conversation.title }));
      if (conversation.type === 'group') name.append(el('span', { class: 'people-card__meta', text: ` · ${conversation.members_count}` }));
      top.append(name);
      if (conversation.pinned) {
        const pin = el('span');
        pin.innerHTML = icon('star', { size: 12 });
        top.append(pin);
      }
      top.append(el('div', { class: 'chat-row__time', text: shortTimeAgo(conversation.last_message_at) }));
      body.append(top);
      const preview = el('div', { class: 'chat-row__preview' });
      preview.append(el('span', { text: previewText(conversation, me) }));
      body.append(preview);
      row.append(body);
      if (conversation.unread) row.append(el('span', { class: 'chat-row__unread', text: String(conversation.unread) }));
      const menu = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Действия с чатом' } });
      menu.style.width = '26px';
      menu.style.height = '26px';
      menu.innerHTML = icon('moreVertical', { size: 15 });
      menu.addEventListener('click', (event) => {
        event.stopPropagation();
        openRowMenu(conversation, event);
      });
      row.append(menu);

      row.addEventListener('click', () => {
        activeId = conversation.id;
        if (options.onSelect) options.onSelect(conversation);
        else navigate(`/chat/${conversation.id}`);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') row.click();
      });
      scroll.append(row);
    }
  }

  function openRowMenu(conversation, event) {
    const existing = document.querySelector('.conv-menu');
    if (existing) existing.remove();
    const menu = el('div', { class: 'menu conv-menu' });
    menu.style.position = 'fixed';
    menu.style.left = `${Math.min(window.innerWidth - 210, event.clientX)}px`;
    menu.style.top = `${event.clientY + 6}px`;
    menu.style.zIndex = '60';
    const item = (label, handler, danger = false) => {
      const btn = el('button', { class: `menu__item ${danger ? 'menu__item--danger' : ''}`, text: label, attrs: { type: 'button' } });
      btn.addEventListener('click', () => {
        menu.remove();
        handler();
      });
      menu.append(btn);
    };
    item(conversation.pinned ? 'Открепить' : 'Закрепить', async () => {
      await api.patch(`/conversations/${conversation.id}/member`, { is_pinned: !conversation.pinned }).catch(async () => {
        await api.post(`/conversations/${conversation.id}/pin`, { pinned: !conversation.pinned });
      });
      refresh();
    });
    item(conversation.archived ? 'Вернуть из архива' : 'В архив', async () => {
      await api.post(`/conversations/${conversation.id}/${conversation.archived ? 'unarchive' : 'archive'}`);
      refresh();
    });
    item(conversation.muted ? 'Включить звук' : 'Без звука', async () => {
      await api.post(`/conversations/${conversation.id}/${conversation.muted ? 'unmute' : 'mute'}`, { hours: 24 });
      refresh();
    });
    if (conversation.unread) {
      item('Отметить прочитанным', async () => {
        await api.post(`/conversations/${conversation.id}/read`, {});
        refresh();
      });
    }
    item('Удалить чат', async () => {
      const ok = await confirmDialog({
        title: 'Удалить чат?',
        message: conversation.type === 'group' ? 'Вы выйдете из группы.' : 'Чат переместится в архив.',
        confirmText: 'Удалить',
        danger: true
      });
      if (!ok) return;
      await api.delete(`/conversations/${conversation.id}`);
      refresh();
    }, true);
    document.body.append(menu);
    setTimeout(() => {
      const close = () => {
        menu.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  }

  async function refresh() {
    try {
      const data = await api.get(`/conversations?filter=${filter}`);
      conversations = data.conversations || [];
      mutuals = data.mutuals || [];
      loading = false;
      render();
      if (options.onRequests !== undefined) options.onRequests(data.requests || 0);
      return conversations;
    } catch (err) {
      loading = false;
      scroll.innerHTML = '';
      scroll.append(emptyState('😕', 'Не удалось загрузить чаты', err.message || 'Попробуйте позже'));
      return [];
    }
  }

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  const offs = [
    onSocket('message:new', () => refresh()),
    onSocket('message:read', () => refresh()),
    onSocket('conversation:update', () => refresh()),
    onSocket('conversation:read', () => refresh()),
    onSocket('presence:update', () => render())
  ];

  renderFilters();
  render();
  refresh();

  return {
    el: root,
    refresh,
    setActive(id) {
      activeId = Number(id) || 0;
      render();
    },
    destroy() {
      for (const off of offs) off();
    }
  };
}
