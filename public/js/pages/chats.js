import { el, button } from '../ui.js?v=19';
import { createChatList } from '../components/chatList.js?v=19';
import { navigate } from '../router.js?v=19';

export default function ChatsPage() {
  const root = el('div', { class: 'chats-page chats-page--list' });
  const list = createChatList({
    onSelect: (match) => navigate(`/chat/${match.id}`)
  });
  root.append(list.el);

  const placeholder = el('div', { class: 'chat-window' });
  const empty = el('div', { class: 'empty', style: { margin: 'auto' } });
  empty.innerHTML = `
    <div class="empty__emoji">💌</div>
    <div class="empty__title">Выберите диалог</div>
    <div class="empty__text">Здесь появятся сообщения с вашими матчами. Новые матчи — в ленте сверху.</div>
  `;
  empty.append(
    button('Найти новых людей', {
      variant: 'btn-primary',
      icon: 'flame',
      onClick: () => navigate('/swipe')
    })
  );
  placeholder.append(empty);
  root.append(placeholder);

  return {
    el: root,
    cleanup() {
      list.destroy();
    }
  };
}
