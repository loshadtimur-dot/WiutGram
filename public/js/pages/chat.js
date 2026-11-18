import { el } from '../ui.js?v=18';
import { createChatList } from '../components/chatList.js?v=18';
import { createChatWindow } from '../components/chatWindow.js?v=18';
import { navigate } from '../router.js?v=18';

export default function ChatPage(ctx) {
  const matchId = Number(ctx.params.id);
  const root = el('div', { class: 'chats-page chats-page--chat' });

  const list = createChatList({
    activeId: matchId,
    onSelect: (match) => {
      if (match.id !== matchId) navigate(`/chat/${match.id}`);
    }
  });
  root.append(list.el);

  const chat = createChatWindow(matchId, {
    onBack: () => navigate('/chats'),
    onRemoved: () => {
      list.refresh();
      navigate('/chats');
    }
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
