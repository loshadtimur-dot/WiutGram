import { api } from '../api.js?v=23';
import {
  el,
  avatarNode,
  button,
  emptyState,
  loadingRow,
  formatDayLabel,
  timeAgo,
  toast
} from '../ui.js?v=23';
import { icon } from '../icons.js?v=23';
import { setCounts, getState } from '../state.js?v=23';
import { onSocket } from '../socket.js?v=23';
import { navigate } from '../router.js?v=23';

const ICONS = {
  like: 'heart',
  super_like: 'star',
  match: 'sparkles',
  message: 'chat',
  comment: 'comment',
  post_like: 'heart',
  profile_view: 'eye',
  story_view: 'eye',
  follow: 'users',
  gift: 'gift',
  badge: 'star',
  banner: 'image',
  system: 'info'
};

const TEXTS = {
  like: 'лайкнул(а) ваш профиль',
  super_like: 'отправил(а) суперлайк ⭐',
  match: 'это взаимно! Новый матч',
  message: 'написал(а) сообщение',
  comment: 'оставил(а) комментарий',
  post_like: 'лайкнул(а) ваш пост',
  profile_view: 'посмотрел(а) ваш профиль',
  story_view: 'посмотрел(а) вашу историю',
  follow: 'подписался(ась) на ваш профиль',
  gift: 'подарил(а) вам подарок',
  badge: 'выдал(а) вам значок',
  banner: 'выдал(а) вам баннер'
};

export default async function NotificationsPage() {
  const root = el('div', { class: 'notifications' });
  const head = el('div', { class: 'section__head' });
  const headText = el('div');
  headText.append(el('h1', { text: 'Уведомления', style: { fontSize: '24px', letterSpacing: '-0.03em' } }));
  headText.append(el('p', { class: 'section__subtitle', text: 'Лайки, матчи, сообщения и всё, что происходит с вашим профилем.' }));
  head.append(headText);
  const readAllBtn = button('Прочитать все', { variant: 'btn-secondary' });
  head.append(readAllBtn);
  root.append(head);

  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  root.append(list);

  let items = [];
  let offset = 0;
  let total = 0;
  let loading = false;

  function targetFor(notification) {
    const actor = notification.actor;
    if (!actor) return null;
    switch (notification.type) {
      case 'match':
      case 'message':
        return '/chats';
      case 'like':
      case 'super_like':
      case 'profile_view':
      case 'story_view':
      case 'post_like':
      case 'comment':
      case 'follow':
        return `/u/${actor.username}`;
      case 'gift':
      case 'badge':
      case 'banner':
        return '/profile';
      default:
        return null;
    }
  }

  function render() {
    list.innerHTML = '';
    if (loading && !items.length) {
      list.append(loadingRow('Загружаем уведомления…'));
      return;
    }
    if (!items.length) {
      list.append(
        emptyState('🔔', 'Пока тихо', 'Здесь появятся лайки, матчи и комментарии. Свайпните пару профилей!', button('К свайпам', {
          variant: 'btn-primary',
          onClick: () => navigate('/swipe')
        }))
      );
      return;
    }

    let currentDay = null;
    let group = null;
    for (const notification of items) {
      const day = formatDayLabel(notification.created_at);
      if (day !== currentDay) {
        currentDay = day;
        const dayLabel = el('div', { class: 'notification-day', text: day });
        list.append(dayLabel);
        group = el('div', { class: 'notification-list' });
        list.append(group);
      }
      const row = el('div', { class: `notification ${notification.is_read ? '' : 'is-unread'}` });
      const iconWrap = el('div', { class: `notification__icon notification__icon--${notification.type}` });
      iconWrap.innerHTML = icon(ICONS[notification.type] || 'bell', { size: 16, fill: notification.type === 'match' });
      if (notification.actor) {
        const avatarWrap = el('div', { style: { position: 'relative', flex: 'none' } });
        avatarWrap.append(avatarNode(notification.actor, 'sm'));
        row.append(avatarWrap);
      } else {
        row.append(iconWrap);
      }
      const body = el('div', { class: 'notification__body' });
      const text = el('div', { class: 'notification__text' });
      if (notification.actor) {
        text.append(el('strong', { text: notification.actor.display_name }));
        text.append(el('span', { text: ` ${TEXTS[notification.type] || notification.text || ''}` }));
      } else {
        text.append(el('span', { text: notification.text || 'Системное уведомление' }));
      }
      body.append(text);
      if (notification.type === 'message' && notification.text) {
        body.append(el('div', { class: 'notification__time', text: notification.text }));
      }
      body.append(el('div', { class: 'notification__time', text: timeAgo(notification.created_at) }));
      row.append(body);
      if (notification.actor) {
        const thumb = el('div', { style: { flex: 'none', opacity: '0.8' } });
        thumb.innerHTML = icon(ICONS[notification.type] || 'bell', { size: 17 });
        row.append(thumb);
      }
      row.addEventListener('click', async () => {
        if (!notification.is_read) {
          notification.is_read = true;
          row.classList.remove('is-unread');
          setCounts({ unread_notifications: Math.max(0, (getState().counts.unread_notifications || 0) - 1) });
          api.post(`/notifications/${notification.id}/read`).catch(() => {});
        }
        const target = targetFor(notification);
        if (target) navigate(target);
        else toast(notification.text || 'Уведомление');
      });
      group.append(row);
    }

    if (offset < total) {
      list.append(
        el('div', { class: 'row', style: { justifyContent: 'center' } }, [
          button('Показать ещё', {
            variant: 'btn-secondary',
            onClick: () => load(false)
          })
        ])
      );
    }
  }

  async function load(reset = true) {
    if (loading) return;
    loading = true;
    if (reset) {
      offset = 0;
      items = [];
      render();
    }
    try {
      const data = await api.get(`/notifications?limit=30&offset=${offset}`);
      items = reset ? data.notifications : items.concat(data.notifications);
      offset = items.length;
      total = data.total;
      setCounts({ unread_notifications: data.unread || 0 });
    } catch (err) {
      if (!items.length) {
        list.innerHTML = '';
        list.append(emptyState('😕', 'Не удалось загрузить', err.message || '', button('Повторить', { variant: 'btn-secondary', onClick: () => load(true) })));
        loading = false;
        return;
      }
    } finally {
      loading = false;
      render();
    }
  }

  readAllBtn.addEventListener('click', async () => {
    try {
      await api.post('/notifications/read-all');
      items = items.map((item) => ({ ...item, is_read: true }));
      setCounts({ unread_notifications: 0 });
      render();
      toast('Все уведомления прочитаны', 'success');
    } catch (err) {
      toast(err.message || 'Не удалось отметить', 'error');
    }
  });

  const off = onSocket('notification:new', () => load(true));
  load(true);

  return {
    el: root,
    cleanup() {
      off();
    }
  };
}
