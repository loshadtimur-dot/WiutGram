import { el } from '../ui.js?v=31';
import { createConversationList } from '../components/conversationList.js?v=31';
import { createConversationWindow } from '../components/conversationWindow.js?v=31';
import { navigate } from '../router.js?v=31';

export default function ChatPage(ctx) {
  const conversationId = Number(ctx.params.id);
  const root = el('div', { class: 'chats-page chats-page--chat' });

  const list = createConversationList({
    activeId: conversationId,
    onSelect: (conversation) => {
      if (conversation.id !== conversationId) navigate(`/chat/${conversation.id}`);
    }
  });
  root.append(list.el);

  const chat = createConversationWindow(conversationId, {
    onBack: () => navigate('/chats')
  });
  root.append(chat.el);

  return {
    el: root,
    cleanup() {
      list.destroy();
      chat.destroy();
    }
  };
}
