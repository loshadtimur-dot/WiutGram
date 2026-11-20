import { el } from '../ui.js?v=25';
import { createConversationList } from '../components/conversationList.js?v=25';
import { navigate } from '../router.js?v=25';

export default function ChatsPage() {
  const root = el('div', { class: 'chats-page chats-page--list' });
  const list = createConversationList({
    onSelect: (conversation) => navigate(`/chat/${conversation.id}`)
  });
  root.append(list.el);

  const placeholder = el('div', { class: 'chat-window' });
  const empty = el('div', { class: 'empty', style: { margin: 'auto' } });
  empty.innerHTML = `
    <div class="empty__emoji">💬</div>
    <div class="empty__title">Выберите чат</div>
    <div class="empty__text">Личные диалоги, группы и «Избранное» — всё здесь. Начните с поиска людей.</div>
  `;
  placeholder.append(empty);
  root.append(placeholder);

  return {
    el: root,
    cleanup() {
      list.destroy();
    }
  };
}
