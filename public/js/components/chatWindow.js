import { api, compressImage, toFormData } from '../api.js?v=25';
import {
  el,
  avatarNode,
  button,
  toast,
  confirmDialog,
  openModal,
  formatTime,
  formatDayLabel,
  lastSeenLabel,
  initials,
  gradientFor,
  svgIcon
} from '../ui.js?v=25';
import { PREFERRED_EMOJI, icon } from '../icons.js?v=25';
import { getState, setOnline, setCounts } from '../state.js?v=25';
import { onSocket, startTyping, stopTyping } from '../socket.js?v=25';
import { openReportDialog, openBlockConfirm } from './report.js?v=25';
import { loadCosmetics, giftMeta, giftNode, openGiftPicker } from './cosmetics.js?v=25';
import { navigate } from '../router.js?v=25';

export function createChatWindow(matchId, options = {}) {
  const root = el('div', { class: 'chat-window' });
  const id = Number(matchId);
  const me = getState().user;
  let match = options.match || null;
  let messages = [];
  let hasMore = false;
  let loadingOlder = false;
  let pendingImage = null;
  // Gift artwork arrives with the cosmetics catalog; refresh the chat when ready.
  loadCosmetics()
    .then(() => {
      if (messages.length) renderMessages();
    })
    .catch(() => {});
  let typingTimer = null;
  let lastTypingSent = 0;
  let peerTypingTimer = null;
  let peerTyping = false;
  let destroyed = false;

  getState().activeMatchId = id;

  /* Header */
  const header = el('div', { class: 'chat-window__head' });
  const backBtn = el('button', {
    class: 'btn-icon chat-back',
    attrs: { type: 'button', 'aria-label': 'Назад к чатам' },
    style: { width: '36px', height: '36px' }
  });
  backBtn.innerHTML = icon('arrowLeft', { size: 18 });
  backBtn.addEventListener('click', () => (options.onBack ? options.onBack() : navigate('/chats')));
  header.append(backBtn);

  const userBlock = el('div', { class: 'chat-window__user' });
  const avatarHolder = el('div');
  userBlock.append(avatarHolder);
  const nameBlock = el('div');
  const nameRow = el('div', { class: 'chat-window__name' });
  nameBlock.append(nameRow);
  const statusRow = el('div', { class: 'chat-window__status', text: '' });
  nameBlock.append(statusRow);
  userBlock.append(nameBlock);
  header.append(userBlock);

  const actionsWrap = el('div', { class: 'chat-window__actions' });
  const profileBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Профиль' } });
  profileBtn.innerHTML = icon('user', { size: 18 });
  profileBtn.addEventListener('click', () => {
    if (match) navigate(`/u/${match.user.username}`);
  });
  const menuBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Действия' } });
  menuBtn.innerHTML = icon('moreVertical', { size: 18 });
  menuBtn.addEventListener('click', (event) => openActions(event));
  actionsWrap.append(profileBtn, menuBtn);
  header.append(actionsWrap);
  root.append(header);

  function openActions(event) {
    event.stopPropagation();
    const existing = root.querySelector('.menu');
    if (existing) {
      existing.remove();
      return;
    }
    const menu = el('div', { class: 'menu' });
    menu.style.position = 'absolute';
    menu.style.right = '14px';
    menu.style.top = '62px';

    const item = (iconName, label, danger, onClick) => {
      const btn = el('button', { class: `menu__item ${danger ? 'menu__item--danger' : ''}`, attrs: { type: 'button' } });
      btn.innerHTML = icon(iconName, { size: 16 });
      btn.append(el('span', { text: label }));
      btn.addEventListener('click', () => {
        menu.remove();
        onClick();
      });
      return btn;
    };

    menu.append(item('user', 'Открыть профиль', false, () => match && navigate(`/u/${match.user.username}`)));
    menu.append(item('flag', 'Пожаловаться', false, () => match && openReportDialog({ user: match.user })));
    menu.append(item('block', 'Заблокировать', false, async () => {
      if (!match) return;
      const done = await openBlockConfirm(match.user);
      if (done) handleRemoved();
    }));
    menu.append(el('div', { class: 'menu__sep' }));
    menu.append(item('trash', 'Расматчить', true, unmatch));
    root.style.position = 'relative';
    root.append(menu);
    setTimeout(() => {
      const close = () => {
        menu.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  }

  async function unmatch() {
    const ok = await confirmDialog({
      title: 'Расматчить?',
      message: 'Диалог удалится у вас и у собеседника, а профиль снова станет скрытым.',
      confirmText: 'Расматчить',
      danger: true
    });
    if (!ok) return;
    try {
      await api.delete(`/matches/${id}`);
      toast('Матч завершён');
      handleRemoved();
    } catch (err) {
      toast(err.message || 'Не удалось расматчить', 'error');
    }
  }

  function handleRemoved() {
    if (options.onRemoved) options.onRemoved();
    else navigate('/chats');
  }

  /* Messages area */
  const messagesEl = el('div', { class: 'chat-messages', attrs: { role: 'log', 'aria-live': 'polite' } });
  root.append(messagesEl);
  const typingEl = el('div', { class: 'chat-typing' });
  root.append(typingEl);

  const emojiPanel = el('div', { class: 'emoji-panel hidden' });
  for (const emoji of PREFERRED_EMOJI) {
    const btn = el('button', { text: emoji, attrs: { type: 'button', 'aria-label': `Эмодзи ${emoji}` } });
    btn.addEventListener('click', () => {
      const input = composerInput;
      const start = input.selectionStart || input.value.length;
      input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(start)}`;
      input.focus();
      input.selectionStart = input.selectionEnd = start + emoji.length;
      onComposerInput();
    });
    emojiPanel.append(btn);
  }
  root.append(emojiPanel);

  const imagePreview = el('div', { class: 'chat-image-preview hidden' });
  root.append(imagePreview);

  const composer = el('form', { class: 'chat-composer' });
  const emojiBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Эмодзи' } });
  emojiBtn.style.width = '38px';
  emojiBtn.style.height = '38px';
  emojiBtn.innerHTML = icon('sparkles', { size: 19 });
  emojiBtn.addEventListener('click', () => emojiPanel.classList.toggle('hidden'));

  const giftBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Подарить подарок' } });
  giftBtn.style.width = '38px';
  giftBtn.style.height = '38px';
  giftBtn.innerHTML = icon('gift', { size: 19 });
  giftBtn.addEventListener('click', async () => {
    try {
      const data = await loadCosmetics(true);
      const isOwner = getState().user && getState().user.role === 'owner';
      const gifts = data.catalog.gifts.filter((gift) => gift.count > 0 || isOwner);
      openGiftPicker({
        gifts,
        title: 'Подарить подарок',
        onPick: async (gift) => {
          try {
            const result = await api.post('/cosmetics/gift/send', { match_id: id, gift_id: gift.id });
            addMessage(result.message);
            scrollToBottom();
            toast(`Вы подарили «${gift.name}»`, 'success');
          } catch (err) {
            toast(err.message || 'Не удалось подарить подарок', 'error');
          }
        }
      });
    } catch (err) {
      toast(err.message || 'Не удалось загрузить подарки', 'error');
    }
  });

  const imageBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Отправить фото' } });
  imageBtn.style.width = '38px';
  imageBtn.style.height = '38px';
  imageBtn.innerHTML = icon('image', { size: 19 });
  const fileInput = el('input', {
    attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' },
    style: { display: 'none' }
  });
  imageBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      pendingImage = compressed;
      imagePreview.innerHTML = '';
      const img = el('img', { attrs: { src: compressed.dataUrl, alt: 'Предпросмотр' } });
      imagePreview.append(img);
      imagePreview.append(el('span', { class: 'field__hint', text: 'Фото готово к отправке', style: { flex: '1' } }));
      const cancel = el('button', { class: 'btn btn-ghost btn-sm', text: 'Отмена', attrs: { type: 'button' } });
      cancel.addEventListener('click', () => {
        pendingImage = null;
        imagePreview.classList.add('hidden');
      });
      const sendBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Отправить', attrs: { type: 'button' } });
      sendBtn.addEventListener('click', sendImage);
      imagePreview.append(cancel, sendBtn);
      imagePreview.classList.remove('hidden');
    } catch (err) {
      toast(err.message || 'Не удалось обработать фото', 'error');
    }
  });

  const composerInput = el('textarea', {
    class: 'chat-composer__input',
    attrs: { placeholder: 'Напишите сообщение…', rows: '1', 'aria-label': 'Сообщение' }
  });
  const sendBtn = el('button', { class: 'chat-send', attrs: { type: 'submit', 'aria-label': 'Отправить' } });
  sendBtn.innerHTML = icon('send', { size: 19 });

  composer.append(emojiBtn, imageBtn, giftBtn, composerInput, sendBtn, fileInput);
  root.append(composer);

  function autoGrow() {
    composerInput.style.height = 'auto';
    composerInput.style.height = `${Math.min(120, composerInput.scrollHeight)}px`;
  }

  function onComposerInput() {
    autoGrow();
    const now = Date.now();
    if (composerInput.value.trim()) {
      if (now - lastTypingSent > 2000) {
        startTyping(id);
        lastTypingSent = now;
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => stopTyping(id), 1600);
    } else {
      stopTyping(id);
    }
  }
  composerInput.addEventListener('input', onComposerInput);
  composerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  });

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    sendText();
  });

  async function sendText() {
    const body = composerInput.value.trim();
    if (!body) return;
    composerInput.value = '';
    autoGrow();
    stopTyping(id);
    try {
      const data = await api.post(`/matches/${id}/messages`, { body });
      addMessage(data.message);
      scrollToBottom();
    } catch (err) {
      composerInput.value = body;
      toast(err.message || 'Не удалось отправить сообщение', 'error');
    }
  }

  async function sendImage() {
    if (!pendingImage) return;
    const form = toFormData({}, pendingImage.blob, 'photo.jpg');
    imagePreview.classList.add('hidden');
    try {
      const data = await api.upload(`/matches/${id}/messages/image`, form);
      addMessage(data.message);
      scrollToBottom();
    } catch (err) {
      toast(err.message || 'Не удалось отправить фото', 'error');
    } finally {
      pendingImage = null;
    }
  }

  function updateHeader() {
    avatarHolder.innerHTML = '';
    nameRow.innerHTML = '';
    if (!match) return;
    avatarHolder.append(avatarNode(match.user, 'md'));
    nameRow.append(el('span', { text: match.user.display_name }));
    if (match.user.is_verified) {
      const badge = el('span', { class: 'verified' });
      badge.innerHTML = icon('verified', { size: 15, fill: true });
      nameRow.append(badge);
    }
    const online = getState().online.get(match.user.id);
    statusRow.textContent = lastSeenLabel(online, match.user.last_seen);
    statusRow.classList.toggle('is-online', !!online);
  }

  /* Rendering messages */
  function messageNode(message, grouped) {
    const mine = message.sender_id === me.id;
    const bubble = el('div', {
      class: `msg ${mine ? 'msg--mine' : 'msg--theirs'} ${grouped ? (mine ? 'msg--group-mine' : 'msg--group-theirs') : ''}`,
      attrs: { 'data-id': message.id }
    });

    if (message.deleted) {
      bubble.append(el('span', { class: 'msg__deleted', text: 'Сообщение удалено' }));
    } else {
      if (message.type === 'image' && message.image_path) {
        const imageWrap = el('div', { class: 'msg__image' });
        const img = el('img', { attrs: { src: message.image_path, alt: 'Фото в чате', loading: 'lazy' } });
        img.addEventListener('click', () => openImage(message.image_path));
        imageWrap.append(img);
        bubble.append(imageWrap);
      }
      if (message.type === 'gift') {
        const gift = giftMeta(message.body);
        if (gift) {
          const card = giftNode(gift, { size: 'sm' });
          card.classList.add('msg__gift');
          bubble.append(card);
        } else {
          bubble.append(el('div', { text: '🎁 Подарок' }));
        }
      } else if (message.body) {
        bubble.append(el('div', { text: message.body }));
      }
    }

    const meta = el('div', { class: 'msg__meta' });
    meta.append(el('span', { text: formatTime(message.created_at) }));
    if (mine && message.type !== 'system' && getState().user.read_receipts) {
      const checks = el('span', {
        class: `msg__checks ${message.read_at ? 'is-read' : ''}`,
        text: message.read_at ? '✓✓' : '✓',
        attrs: { title: message.read_at ? 'Прочитано' : 'Отправлено' }
      });
      meta.append(checks);
    }
    bubble.append(meta);

    if (message.reaction === 'heart') {
      bubble.append(el('span', { class: 'msg__reaction', text: '❤️' }));
    }

    if (mine && !message.deleted) {
      const deleteBtn = el('button', {
        class: 'msg__menu-btn',
        attrs: { type: 'button', 'aria-label': 'Удалить сообщение' }
      });
      deleteBtn.innerHTML = icon('trash', { size: 12 });
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const ok = await confirmDialog({
          title: 'Удалить сообщение?',
          message: 'У собеседника оно тоже исчезнет.',
          confirmText: 'Удалить',
          danger: true
        });
        if (!ok) return;
        try {
          await api.delete(`/messages/${message.id}`);
          message.deleted = true;
          message.body = '';
          message.image_path = null;
          renderMessages();
        } catch (err) {
          toast(err.message || 'Не удалось удалить', 'error');
        }
      });
      bubble.append(deleteBtn);
    }

    let lastTap = 0;
    const react = async () => {
      try {
        const next = message.reaction === 'heart' ? null : 'heart';
        await api.post(`/messages/${message.id}/react`, { reaction: next });
        message.reaction = next;
        renderMessages();
      } catch (err) {
        toast('Не удалось поставить реакцию', 'error');
      }
    };
    bubble.addEventListener('dblclick', react);
    bubble.addEventListener('pointerup', () => {
      const now = Date.now();
      if (now - lastTap < 320) react();
      lastTap = now;
    });

    return bubble;
  }

  function openImage(src) {
    const body = el('div');
    const img = el('img', { attrs: { src, alt: 'Фото' }, style: { maxHeight: '70vh', objectFit: 'contain' } });
    body.append(img);
    openModal({ title: 'Фото', body, size: 'wide' });
  }

  function renderMessages() {
    const nearBottom =
      messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
    messagesEl.innerHTML = '';
    if (!messages.length) {
      messagesEl.append(
        el('div', { class: 'chat-system', text: 'Это начало вашей переписки. Скажите «привет» 👋' })
      );
    }
    let lastDay = null;
    let lastSender = null;
    for (const message of messages) {
      const day = formatDayLabel(message.created_at);
      if (day !== lastDay) {
        messagesEl.append(el('div', { class: 'chat-day', text: day }));
        lastDay = day;
        lastSender = null;
      }
      if (message.type === 'system') {
        messagesEl.append(el('div', { class: 'chat-system', text: message.body || 'Системное сообщение' }));
        lastSender = null;
        continue;
      }
      messagesEl.append(messageNode(message, lastSender === message.sender_id));
      lastSender = message.sender_id;
    }
    if (nearBottom || messages.length < 30) scrollToBottom();
  }

  function scrollToBottom(behavior = 'auto') {
    requestAnimationFrame(() => {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior });
    });
  }

  function addMessage(message) {
    if (messages.some((item) => item.id === message.id)) return;
    messages.push(message);
    messages.sort((a, b) => a.id - b.id);
    renderMessages();
  }

  async function markRead() {
    try {
      const data = await api.post(`/matches/${id}/read`);
      if (data.updated > 0) {
        setCounts({ unread_messages: Math.max(0, (getState().counts.unread_messages || 0) - data.updated) });
        if (match) match.unread = 0;
      }
    } catch (err) {
      // Silent: read state is not critical.
    }
  }

  async function loadOlder() {
    if (!hasMore || loadingOlder || !messages.length) return;
    loadingOlder = true;
    const before = messages[0].id;
    const previousHeight = messagesEl.scrollHeight;
    const previousTop = messagesEl.scrollTop;
    try {
      const data = await api.get(`/matches/${id}/messages?before=${before}&limit=30`);
      if (data.messages.length) {
        messages = data.messages.concat(messages);
        hasMore = data.has_more;
        renderMessages();
        messagesEl.scrollTop = messagesEl.scrollHeight - previousHeight + previousTop;
      } else {
        hasMore = false;
      }
    } catch (err) {
      toast(err.message || 'Не удалось загрузить историю', 'error');
    } finally {
      loadingOlder = false;
    }
  }

  messagesEl.addEventListener('scroll', () => {
    if (messagesEl.scrollTop < 50) loadOlder();
  });

  /* Realtime events */
  const cleanups = [];
  cleanups.push(
    onSocket('message:new', ({ message, match_id }) => {
      if (Number(match_id) !== id || destroyed) return;
      addMessage(message);
      if (message.sender_id !== me.id) markRead();
    })
  );
  cleanups.push(
    onSocket('message:read', ({ match_id, reader_id }) => {
      if (Number(match_id) !== id || reader_id === me.id) return;
      let changed = false;
      for (const message of messages) {
        if (message.sender_id === me.id && !message.read_at) {
          message.read_at = new Date().toISOString();
          changed = true;
        }
      }
      if (changed) renderMessages();
    })
  );
  cleanups.push(
    onSocket('message:deleted', ({ id: deletedId, match_id }) => {
      if (Number(match_id) !== id) return;
      const message = messages.find((item) => item.id === Number(deletedId));
      if (!message) return;
      message.deleted = true;
      message.body = '';
      message.image_path = null;
      renderMessages();
    })
  );
  cleanups.push(
    onSocket('message:reaction', ({ id: reactionId, match_id, reaction }) => {
      if (Number(match_id) !== id) return;
      const message = messages.find((item) => item.id === Number(reactionId));
      if (!message) return;
      message.reaction = reaction;
      renderMessages();
    })
  );
  cleanups.push(
    onSocket('typing:start', ({ match_id, user_id }) => {
      if (Number(match_id) !== id || user_id === me.id) return;
      peerTyping = true;
      typingEl.textContent = 'печатает…';
      clearTimeout(peerTypingTimer);
      peerTypingTimer = setTimeout(() => {
        peerTyping = false;
        typingEl.textContent = '';
      }, 4000);
    })
  );
  cleanups.push(
    onSocket('typing:stop', ({ match_id, user_id }) => {
      if (Number(match_id) !== id || user_id === me.id) return;
      peerTyping = false;
      typingEl.textContent = '';
    })
  );
  cleanups.push(
    onSocket('presence:update', ({ user_id, online }) => {
      if (!match || Number(user_id) !== match.user.id) return;
      setOnline(user_id, online);
      updateHeader();
    })
  );
  cleanups.push(
    onSocket('match:removed', ({ match_id }) => {
      if (Number(match_id) !== id) return;
      toast('Матч завершён');
      handleRemoved();
    })
  );

  async function init() {
    messagesEl.innerHTML = '';
    messagesEl.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      const meta = await api.get(`/matches/${id}`);
      match = meta.match;
      updateHeader();
      const data = await api.get(`/matches/${id}/messages?limit=30`);
      messages = data.messages || [];
      hasMore = !!data.has_more;
      renderMessages();
      scrollToBottom();
      await markRead();
      composerInput.focus({ preventScroll: true });
    } catch (err) {
      messagesEl.innerHTML = '';
      const wrap = el('div', { class: 'empty' });
      wrap.append(el('div', { class: 'empty__emoji', text: '💔' }));
      wrap.append(el('div', { class: 'empty__title', text: 'Диалог недоступен' }));
      wrap.append(el('div', { class: 'empty__text', text: err.message || 'Матч больше не активен' }));
      wrap.append(button('К чатам', { variant: 'btn-secondary', onClick: () => navigate('/chats') }));
      messagesEl.append(wrap);
      composer.style.display = 'none';
    }
  }

  init();

  return {
    el: root,
    destroy() {
      destroyed = true;
      for (const off of cleanups) off();
      clearTimeout(typingTimer);
      clearTimeout(peerTypingTimer);
      if (getState().activeMatchId === id) getState().activeMatchId = 0;
    }
  };
}
