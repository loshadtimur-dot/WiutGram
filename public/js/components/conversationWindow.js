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
  lastSeenLabel
} from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { getState } from '../state.js?v=25';
import { onSocket, emitConversationTyping } from '../socket.js?v=25';
import { navigate } from '../router.js?v=25';
import {
  openGroupInfo,
  openWallpaperPicker,
  openPollModal,
  openForwardModal,
  openChatGiftPicker,
  openEmojiPicker
} from './chatModals.js?v=25';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '🔥'];

function reactionNode(emoji) {
  if (String(emoji).startsWith('glass:')) {
    const id = emoji.slice(6);
    return `<svg width="15" height="15" viewBox="0 0 64 64" aria-hidden="true"><use href="/img/glass-sprite.svg#glass-${id}"></use></svg>`;
  }
  return `<span>${emoji}</span>`;
}

function renderText(text) {
  const fragment = document.createDocumentFragment();
  const parts = String(text || '').split(/(@[a-zA-Z0-9._]{3,24})/g);
  for (const part of parts) {
    if (/^@[a-zA-Z0-9._]{3,24}$/.test(part)) {
      fragment.append(el('span', { class: 'mention', text: part }));
    } else if (part) {
      fragment.append(document.createTextNode(part));
    }
  }
  return fragment;
}

function humanDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function createConversationWindow(conversationId, options = {}) {
  const id = Number(conversationId);
  const me = getState().user;
  const root = el('div', { class: 'chat-window' });
  let conversation = null;
  let members = [];
  let messages = [];
  let pinned = [];
  let wallpaper = 'paper';
  let hasMore = false;
  let loadingOlder = false;
  let replyTo = null;
  let editing = null;
  let pendingImage = null;
  let firstUnreadSeq = 0;
  let destroyed = false;
  let typingTimer = null;
  let lastTypingSent = 0;
  let peerTypingTimer = null;
  let recorder = null;
  let recordChunks = [];
  let recordTimer = null;
  let recordSeconds = 0;
  let recordStream = null;

  /* ---------- Header ---------- */
  const header = el('div', { class: 'chat-window__head' });
  const backBtn = el('button', { class: 'btn-icon chat-back', attrs: { type: 'button', 'aria-label': 'Назад' } });
  backBtn.style.cssText = 'width:36px;height:36px';
  backBtn.innerHTML = icon('arrowLeft', { size: 18 });
  backBtn.addEventListener('click', () => (options.onBack ? options.onBack() : navigate('/chats')));
  header.append(backBtn);

  const userBlock = el('div', { class: 'chat-window__user' });
  const avatarHolder = el('div');
  const nameBlock = el('div', { style: { minWidth: '0' } });
  const nameRow = el('div', { class: 'chat-window__name' });
  const statusRow = el('div', { class: 'chat-window__status' });
  nameBlock.append(nameRow, statusRow);
  userBlock.append(avatarHolder, nameBlock);
  header.append(userBlock);

  const actions = el('div', { class: 'chat-window__actions' });
  const searchBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Поиск в чате' } });
  searchBtn.innerHTML = icon('search', { size: 18 });
  const infoBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Информация' } });
  infoBtn.innerHTML = icon('info', { size: 18 });
  const menuBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Действия' } });
  menuBtn.innerHTML = icon('moreVertical', { size: 18 });
  actions.append(searchBtn, infoBtn, menuBtn);
  header.append(actions);
  root.append(header);

  const pinnedBar = el('div', { class: 'chat-pinned-bar hidden' });
  root.append(pinnedBar);

  const messagesEl = el('div', { class: `chat-messages chat-wallpaper-${wallpaper}`, attrs: { role: 'log', 'aria-live': 'polite' } });
  root.append(messagesEl);
  const typingEl = el('div', { class: 'chat-typing' });
  root.append(typingEl);

  const jumpBtn = el('button', { class: 'chat-jump hidden', attrs: { type: 'button', 'aria-label': 'Вниз' } });
  jumpBtn.innerHTML = icon('chevronDown', { size: 18 });
  root.append(jumpBtn);

  /* ---------- Composer ---------- */
  const replyBar = el('div', { class: 'chat-reply-bar hidden' });
  root.append(replyBar);

  const imagePreview = el('div', { class: 'chat-image-preview hidden' });
  root.append(imagePreview);

  const recordBar = el('div', { class: 'chat-record-bar hidden' });
  const recordDot = el('span', { class: 'chat-record-dot' });
  const recordTime = el('span', { text: '0:00' });
  const recordCancel = button('Отмена', { variant: 'btn-ghost btn-sm', onClick: () => stopRecording(false) });
  const recordSend = button('Отправить', { variant: 'btn-primary btn-sm', onClick: () => stopRecording(true) });
  recordBar.append(recordDot, recordTime, el('span', { class: 'field__hint', text: 'Идёт запись…', style: { flex: '1' } }), recordCancel, recordSend);
  root.append(recordBar);

  const composer = el('form', { class: 'chat-composer' });
  const emojiBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Эмодзи' } });
  emojiBtn.style.cssText = 'width:38px;height:38px';
  emojiBtn.innerHTML = icon('sparkles', { size: 19 });
  const attachBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Прикрепить' } });
  attachBtn.style.cssText = 'width:38px;height:38px';
  attachBtn.innerHTML = icon('plus', { size: 19 });
  const giftBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Подарить' } });
  giftBtn.style.cssText = 'width:38px;height:38px';
  giftBtn.innerHTML = icon('gift', { size: 19 });
  const input = el('textarea', {
    class: 'chat-composer__input',
    attrs: { placeholder: 'Сообщение…', rows: '1', 'aria-label': 'Сообщение' }
  });
  const voiceBtn = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Голосовое' } });
  voiceBtn.style.cssText = 'width:38px;height:38px';
  voiceBtn.innerHTML = icon('mic', { size: 19 });
  const sendBtn = el('button', { class: 'chat-send', attrs: { type: 'submit', 'aria-label': 'Отправить' } });
  sendBtn.innerHTML = icon('send', { size: 19 });
  const fileInput = el('input', { attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' }, style: { display: 'none' } });

  composer.append(emojiBtn, attachBtn, giftBtn, input, voiceBtn, sendBtn, fileInput);
  root.append(composer);

  /* ---------- Attach menu ---------- */
  attachBtn.addEventListener('click', () => {
    const menu = el('div', { class: 'menu' });
    menu.style.cssText = 'position:absolute;bottom:76px;right:16px;z-index:40';
    const action = (label, handler) => {
      const btn = el('button', { class: 'menu__item', text: label, attrs: { type: 'button' } });
      btn.addEventListener('click', () => {
        menu.remove();
        handler();
      });
      menu.append(btn);
    };
    action('Фото', () => fileInput.click());
    action('Опрос', () =>
      openPollModal(id, (data) => {
        data.message.poll = data.poll;
        data.message.mine = true;
        data.message.sender = me;
        data.message.reactions = [];
        addMessage(data.message, true);
      })
    );
    root.style.position = 'relative';
    root.append(menu);
    setTimeout(() => {
      const close = () => {
        menu.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  });

  emojiBtn.addEventListener('click', () => {
    openEmojiPicker((emoji) => {
      if (emoji.startsWith('glass:')) {
        toast('Стеклянные эмодзи доступны в реакциях');
        return;
      }
      input.value += emoji;
      input.focus();
      autoGrow();
    });
  });

  giftBtn.addEventListener('click', () => openChatGiftPicker(id, (message) => addMessage(message, true)));

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      pendingImage = compressed;
      imagePreview.innerHTML = '';
      imagePreview.append(el('img', { attrs: { src: compressed.dataUrl, alt: 'Предпросмотр' } }));
      imagePreview.append(el('span', { class: 'field__hint', text: 'Фото готово', style: { flex: '1' } }));
      const cancel = button('Отмена', {
        variant: 'btn-ghost btn-sm',
        onClick: () => {
          pendingImage = null;
          imagePreview.classList.add('hidden');
        }
      });
      const send = button('Отправить', { variant: 'btn-primary btn-sm', onClick: sendImage });
      imagePreview.append(cancel, send);
      imagePreview.classList.remove('hidden');
    } catch (err) {
      toast(err.message || 'Не удалось обработать фото', 'error');
    }
  });

  /* ---------- Recording ---------- */
  voiceBtn.addEventListener('click', async () => {
    if (recorder && recorder.state === 'recording') return stopRecording(true);
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast('Запись голоса не поддерживается браузером', 'error');
      return;
    }
    try {
      recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      recorder = new MediaRecorder(recordStream);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) recordChunks.push(event.data);
      });
      recorder.addEventListener('stop', uploadRecording);
      recorder.start();
      recordSeconds = 0;
      recordTime.textContent = '0:00';
      recordBar.classList.remove('hidden');
      emitConversationTyping(id, true, true);
      recordTimer = setInterval(() => {
        recordSeconds += 1;
        recordTime.textContent = humanDuration(recordSeconds);
        if (recordSeconds >= 120) stopRecording(true);
      }, 1000);
    } catch (err) {
      toast('Нет доступа к микрофону', 'error');
    }
  });

  function stopRecording(send) {
    if (recordTimer) clearInterval(recordTimer);
    recordTimer = null;
    recordBar.classList.add('hidden');
    emitConversationTyping(id, false, false);
    if (recorder && recorder.state === 'recording') {
      recorder._send = send;
      recorder.stop();
    }
    if (recordStream) recordStream.getTracks().forEach((track) => track.stop());
    recordStream = null;
  }

  async function uploadRecording() {
    const send = recorder && recorder._send;
    const blob = new Blob(recordChunks, { type: (recorder && recorder.mimeType) || 'audio/webm' });
    const duration = recordSeconds;
    recorder = null;
    if (!send || !blob.size || duration < 1) return;
    const form = new FormData();
    form.append('voice', blob, 'voice.webm');
    form.append('duration', String(duration));
    try {
      const data = await api.upload(`/conversations/${id}/messages/voice`, form);
      addMessage(data.message, true);
      scrollToBottom('smooth');
    } catch (err) {
      toast(err.message || 'Не удалось отправить голосовое', 'error');
    }
  }

  /* ---------- Header rendering ---------- */
  function updateHeader() {
    if (!conversation) return;
    avatarHolder.innerHTML = '';
    nameRow.innerHTML = '';
    if (conversation.type === 'group') {
      const circle = el('div', { class: 'group-card__avatar' });
      circle.style.width = '38px';
      circle.style.height = '38px';
      circle.textContent = (conversation.title || 'Г').slice(0, 1).toUpperCase();
      avatarHolder.append(circle);
      nameRow.append(el('span', { text: conversation.title }));
      statusRow.textContent = `${conversation.members_count} участников${conversation.username ? ` · @${conversation.username}` : ''}`;
    } else if (conversation.type === 'saved') {
      const circle = el('div', { class: 'group-card__avatar' });
      circle.innerHTML = icon('star', { size: 19 });
      avatarHolder.append(circle);
      nameRow.append(el('span', { text: 'Избранное' }));
      statusRow.textContent = 'Заметки и пересланные сообщения';
    } else {
      avatarHolder.append(avatarNode(conversation.peer || { display_name: conversation.title }, 'md'));
      nameRow.append(el('span', { text: conversation.title }));
      if (conversation.peer_status) {
        const bubble = el('span', { class: 'status-bubble' });
        bubble.innerHTML = `<svg width="15" height="15" viewBox="0 0 64 64"><use href="/img/glass-sprite.svg#glass-${conversation.peer_status.emoji}"></use></svg>`;
        bubble.append(el('span', { text: conversation.peer_status.text || conversation.peer_status.name || '' }));
        nameRow.append(bubble);
      }
      const peerId = conversation.peer ? conversation.peer.id : 0;
      const online = getState().online.get(peerId);
      statusRow.textContent = lastSeenLabel(online, conversation.peer ? conversation.peer.last_seen : null);
      statusRow.classList.toggle('is-online', !!online);
    }
    infoBtn.style.display = conversation.type === 'group' ? '' : 'none';
    input.placeholder = conversation.can_write === false ? 'Отправка сообщений отключена' : 'Сообщение…';
    input.disabled = conversation.can_write === false;
    sendBtn.disabled = conversation.can_write === false;
  }

  /* ---------- Message rendering ---------- */
  function openMessageMenu(event, message) {
    const existing = document.querySelector('.msg-menu');
    if (existing) existing.remove();
    const menu = el('div', { class: 'menu msg-menu' });
    menu.style.cssText = `position:fixed;z-index:70;left:${Math.min(window.innerWidth - 220, event.clientX)}px;top:${Math.min(window.innerHeight - 260, event.clientY)}px`;
    const action = (label, handler, danger = false) => {
      const btn = el('button', { class: `menu__item ${danger ? 'menu__item--danger' : ''}`, text: label, attrs: { type: 'button' } });
      btn.addEventListener('click', () => {
        menu.remove();
        handler();
      });
      menu.append(btn);
    };
    action('Ответить', () => startReply(message));
    action('Переслать', () => openForwardModal([message.id]));
    action('Копировать текст', async () => {
      try {
        await navigator.clipboard.writeText(message.body || '');
        toast('Скопировано', 'success');
      } catch (err) {
        toast('Не удалось скопировать', 'error');
      }
    });
    action(message.pinned ? 'Открепить' : 'Закрепить', () => togglePin(message));
    if (message.mine && message.type === 'text' && !message.deleted) {
      action('Изменить', () => startEdit(message));
    }
    if (!message.deleted && (message.mine || (conversation && conversation.role !== 'member'))) {
      action('Удалить у всех', () => deleteMessage(message, 'all'), true);
    }
    if (!message.deleted) action('Удалить у себя', () => deleteMessage(message, 'me'), true);
    action('Реакция', () => {
      openEmojiPicker(async (emoji) => {
        try {
          const data = await api.post(`/messages/${message.id}/reactions`, { emoji });
          message.reactions = data.reactions;
          renderMessages();
        } catch (err) {
          toast(err.message || 'Не удалось поставить реакцию', 'error');
        }
      });
    });
    document.body.append(menu);
    setTimeout(() => {
      const close = () => {
        menu.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  }

  function pollCard(message) {
    const poll = message.poll;
    const card = el('div', { class: 'poll-card' });
    card.append(el('div', { class: 'poll-card__q', text: poll.question }));
    card.append(el('div', { class: 'people-card__meta', text: `${poll.total_votes} голосов · ${poll.is_anonymous ? 'анонимный' : 'открытый'}` }));
    for (const option of poll.options) {
      const percent = poll.total_votes ? Math.round((option.votes / poll.total_votes) * 100) : 0;
      const row = el('button', { class: `poll-option ${poll.my_votes.includes(option.id) ? 'is-mine' : ''}`, attrs: { type: 'button' } });
      const bar = el('span', { class: 'poll-option__bar' });
      bar.style.width = `${percent}%`;
      row.append(bar);
      row.append(el('span', { class: 'poll-option__label', text: option.label }));
      row.append(el('span', { class: 'poll-option__value', text: `${percent}%` }));
      row.addEventListener('click', async () => {
        try {
          const data = await api.post(`/polls/${poll.id}/vote`, { option_ids: [option.id] });
          message.poll = data.poll;
          renderMessages();
        } catch (err) {
          toast(err.message || 'Не удалось проголосовать', 'error');
        }
      });
      card.append(row);
    }
    return card;
  }

  function voiceCard(message) {
    const wrap = el('div', { class: 'voice-bubble' });
    const audio = el('audio', { attrs: { src: message.image_path, preload: 'metadata' } });
    const play = el('button', { class: 'voice-play', attrs: { type: 'button', 'aria-label': 'Воспроизвести' } });
    play.innerHTML = icon('play', { size: 16 });
    const wave = el('div', { class: 'voice-wave' });
    for (let i = 0; i < 22; i += 1) {
      const bar = el('span');
      bar.style.height = `${8 + ((i * 7) % 18)}px`;
      wave.append(bar);
    }
    const time = el('span', { class: 'voice-time', text: humanDuration(message.meta ? message.meta.duration : 0) });
    const speed = el('button', { class: 'voice-speed', text: '1×', attrs: { type: 'button' } });
    play.addEventListener('click', () => {
      if (audio.paused) {
        document.querySelectorAll('.voice-bubble audio').forEach((other) => other !== audio && other.pause());
        audio.play();
      } else audio.pause();
    });
    audio.addEventListener('play', () => {
      play.innerHTML = icon('pause', { size: 16 });
    });
    audio.addEventListener('pause', () => {
      play.innerHTML = icon('play', { size: 16 });
    });
    audio.addEventListener('timeupdate', () => {
      time.textContent = humanDuration(audio.currentTime || 0);
    });
    speed.addEventListener('click', () => {
      const rates = [1, 1.5, 2];
      audio.playbackRate = rates[(rates.indexOf(audio.playbackRate) + 1) % rates.length];
      speed.textContent = `${audio.playbackRate}×`;
    });
    wrap.append(play, wave, time, speed, audio);
    return wrap;
  }

  function giftCard(message) {
    const gift = message.gift;
    const card = el('div', { class: 'msg__gift-card' });
    const art = el('div', { class: 'msg__gift-art' });
    art.innerHTML = gift ? gift.svg : '';
    card.append(art);
    card.append(el('div', { class: 'msg__gift-name', text: gift ? gift.name : 'Подарок' }));
    if (gift && gift.message) card.append(el('div', { class: 'msg__gift-note', text: gift.message }));
    card.addEventListener('click', () => navigate('/shop?tab=orders'));
    return card;
  }

  function messageNode(message, grouped) {
    const row = el('div', { class: `msg-row ${message.mine ? 'msg-row--mine' : ''}`, attrs: { 'data-id': message.id, 'data-seq': message.seq } });
    const bubble = el('div', {
      class: `msg ${message.mine ? 'msg--mine' : 'msg--theirs'} ${grouped ? (message.mine ? 'msg--group-mine' : 'msg--group-theirs') : ''}`
    });
    if (conversation && conversation.type === 'group' && !message.mine && !grouped && message.sender) {
      bubble.append(el('div', { class: 'msg__sender', text: message.sender.display_name }));
    }
    if (message.forward) {
      bubble.append(el('div', { class: 'msg__forward', text: `Переслано от ${message.forward.from_user}` }));
    }
    if (message.reply_to) {
      const quote = el('div', { class: 'reply-quote' });
      quote.append(el('strong', { text: message.reply_to.sender_name }));
      quote.append(el('span', { text: message.reply_to.body || 'Вложение' }));
      bubble.append(quote);
    }
    if (message.deleted) {
      bubble.append(el('span', { class: 'msg__deleted', text: 'Сообщение удалено' }));
    } else if (message.type === 'image' && message.image_path) {
      const imageWrap = el('div', { class: 'msg__image' });
      const img = el('img', { attrs: { src: message.image_path, alt: 'Фото в чате', loading: 'lazy' } });
      img.addEventListener('click', () => {
        const body = el('div');
        body.append(el('img', { attrs: { src: message.image_path, alt: 'Фото' }, style: { maxHeight: '72vh', objectFit: 'contain' } }));
        openModal({ title: 'Фото', body, size: 'wide' });
      });
      imageWrap.append(img);
      bubble.append(imageWrap);
      if (message.body) bubble.append(el('div', { text: message.body }));
    } else if (message.type === 'voice' && message.image_path) {
      bubble.append(voiceCard(message));
    } else if (message.type === 'gift') {
      bubble.append(giftCard(message));
    } else if (message.type === 'poll' && message.poll) {
      bubble.append(pollCard(message));
    } else if (message.body) {
      const text = el('div', { class: 'msg__text' });
      text.append(renderText(message.body));
      bubble.append(text);
    }

    if (message.reactions && message.reactions.length) {
      const wrap = el('div', { class: 'msg__reactions' });
      for (const reaction of message.reactions) {
        const chip = el('button', {
          class: `reaction-chip ${reaction.mine ? 'is-mine' : ''}`,
          attrs: { type: 'button', title: 'Реакция' }
        });
        chip.innerHTML = `${reactionNode(reaction.emoji)}<span>${reaction.count}</span>`;
        chip.addEventListener('click', async (event) => {
          event.stopPropagation();
          try {
            const data = await api.post(`/messages/${message.id}/reactions`, { emoji: reaction.emoji });
            message.reactions = data.reactions;
            renderMessages();
          } catch (err) {
            toast('Не удалось изменить реакцию', 'error');
          }
        });
        wrap.append(chip);
      }
      bubble.append(wrap);
    }

    const meta = el('div', { class: 'msg__meta' });
    meta.append(el('span', { text: formatTime(message.created_at) }));
    if (message.edited_at) meta.append(el('span', { text: 'изменено' }));
    if (message.mine && !message.deleted) {
      const checks = el('span', {
        class: `msg__checks ${message.reader_count > 0 ? 'is-read' : ''}`,
        text: message.reader_count > 0 ? '✓✓' : '✓',
        attrs: { title: message.reader_count > 0 ? 'Прочитано' : 'Отправлено' }
      });
      meta.append(checks);
      if (conversation && conversation.type === 'group' && message.reader_count > 0) {
        meta.append(el('span', { text: ` ${message.reader_count}` }));
      }
    }
    bubble.append(meta);

    bubble.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openMessageMenu(event, message);
    });
    let pressTimer = null;
    bubble.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => openMessageMenu({ clientX: 80, clientY: 200 }, message), 500);
    }, { passive: true });
    bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
    bubble.addEventListener('dblclick', async () => {
      try {
        const data = await api.post(`/messages/${message.id}/reactions`, { emoji: '❤️' });
        message.reactions = data.reactions;
        renderMessages();
      } catch (err) {
        toast('Не удалось поставить реакцию', 'error');
      }
    });
    row.append(bubble);
    return row;
  }

  function renderMessages() {
    const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 140;
    messagesEl.innerHTML = '';
    if (!messages.length) {
      messagesEl.append(
        el('div', {
          class: 'chat-system',
          text: conversation && conversation.type === 'group' ? 'В группе пока нет сообщений' : 'Это начало переписки. Скажите «привет» 👋'
        })
      );
    }
    let lastDay = null;
    let lastSender = null;
    let lastTime = 0;
    let markerShown = false;
    for (const message of messages) {
      const day = formatDayLabel(message.created_at);
      if (day !== lastDay) {
        messagesEl.append(el('div', { class: 'chat-day', text: day }));
        lastDay = day;
        lastSender = null;
      }
      if (!markerShown && firstUnreadSeq && message.seq >= firstUnreadSeq && message.sender_id !== me.id) {
        messagesEl.append(el('div', { class: 'chat-new-marker', text: 'Новые сообщения' }));
        markerShown = true;
      }
      if (message.type === 'system') {
        messagesEl.append(el('div', { class: 'chat-system', text: message.body || 'Системное сообщение' }));
        lastSender = null;
        continue;
      }
      const time = new Date(message.created_at).getTime();
      const grouped = lastSender === message.sender_id && time - lastTime < 5 * 60 * 1000;
      messagesEl.append(messageNode(message, grouped));
      lastSender = message.sender_id;
      lastTime = time;
    }
    if (nearBottom) scrollToBottom();
  }

  function scrollToBottom(behavior = 'auto') {
    requestAnimationFrame(() => messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior }));
  }

  function addMessage(message, forceScroll = false) {
    if (!message) return;
    if (messages.some((item) => item.id === message.id)) return;
    messages.push(message);
    messages.sort((a, b) => a.seq - b.seq);
    renderMessages();
    if (forceScroll || message.mine) scrollToBottom('smooth');
  }

  function renderPinned() {
    pinnedBar.innerHTML = '';
    if (!pinned.length) {
      pinnedBar.classList.add('hidden');
      return;
    }
    pinnedBar.classList.remove('hidden');
    const pin = pinned[0];
    const btn = el('button', { class: 'chat-pinned-bar__btn', attrs: { type: 'button' } });
    btn.innerHTML = icon('star', { size: 15 });
    btn.append(el('span', { text: pin.body || (pin.type === 'image' ? 'Фото' : 'Закреплённое сообщение') }));
    btn.addEventListener('click', () => jumpToMessage(pin));
    pinnedBar.append(btn);
    if (pinned.length > 1) pinnedBar.append(el('span', { class: 'chat-pinned-bar__count', text: `+${pinned.length - 1}` }));
    const unpin = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Открепить' } });
    unpin.innerHTML = icon('x', { size: 14 });
    unpin.addEventListener('click', () => togglePin(pin));
    pinnedBar.append(unpin);
  }

  async function togglePin(message) {
    try {
      const data = await api.post(`/messages/${message.id}/pin`, { pinned: !message.pinned });
      pinned = data.pinned_messages || [];
      message.pinned = !message.pinned;
      renderPinned();
      toast(data.pinned ? 'Закреплено' : 'Откреплено');
    } catch (err) {
      toast(err.message || 'Не удалось закрепить', 'error');
    }
  }

  function jumpToMessage(target) {
    const node = messagesEl.querySelector(`[data-id="${target.id}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.add('msg-row--flash');
      setTimeout(() => node.classList.remove('msg-row--flash'), 1200);
      return;
    }
    toast('Сообщение выше загруженной истории');
  }

  function startReply(message) {
    replyTo = message;
    editing = null;
    replyBar.innerHTML = '';
    replyBar.classList.remove('hidden');
    const info = el('div', { style: { flex: '1', minWidth: '0' } });
    info.append(el('div', { class: 'chat-reply-bar__title', text: `Ответ ${message.sender ? message.sender.display_name : ''}` }));
    info.append(el('div', { class: 'chat-reply-bar__text', text: message.body || 'Вложение' }));
    const close = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Отменить' } });
    close.innerHTML = icon('x', { size: 15 });
    close.addEventListener('click', () => {
      replyTo = null;
      replyBar.classList.add('hidden');
    });
    replyBar.append(info, close);
    input.focus();
  }

  function startEdit(message) {
    editing = message;
    replyTo = null;
    replyBar.innerHTML = '';
    replyBar.classList.remove('hidden');
    const info = el('div', { style: { flex: '1' } });
    info.append(el('div', { class: 'chat-reply-bar__title', text: 'Изменение сообщения' }));
    info.append(el('div', { class: 'chat-reply-bar__text', text: message.body }));
    const close = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Отменить' } });
    close.innerHTML = icon('x', { size: 15 });
    close.addEventListener('click', () => {
      editing = null;
      replyBar.classList.add('hidden');
      input.value = '';
      autoGrow();
    });
    replyBar.append(info, close);
    input.value = message.body;
    input.focus();
    autoGrow();
  }

  async function deleteMessage(message, scope) {
    const ok = await confirmDialog({
      title: scope === 'me' ? 'Удалить у себя?' : 'Удалить у всех?',
      message: scope === 'me' ? 'Сообщение исчезнет только у вас.' : 'Сообщение исчезнет у всех участников.',
      confirmText: 'Удалить',
      danger: true
    });
    if (!ok) return;
    try {
      await api.delete(`/messages/${message.id}?scope=${scope}`);
      if (scope === 'all') {
        message.deleted = true;
        message.body = '';
        message.image_path = null;
        message.gift = null;
        message.poll = null;
        message.reactions = [];
        renderMessages();
      } else {
        messages = messages.filter((item) => item.id !== message.id);
        renderMessages();
      }
    } catch (err) {
      toast(err.message || 'Не удалось удалить', 'error');
    }
  }

  /* ---------- Sending ---------- */
  function autoGrow() {
    input.style.height = '0px';
    input.style.height = `${Math.min(104, Math.max(42, input.scrollHeight))}px`;
  }

  input.addEventListener('input', () => {
    autoGrow();
    const now = Date.now();
    if (input.value.trim() && now - lastTypingSent > 2000) {
      emitConversationTyping(id, true);
      lastTypingSent = now;
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => emitConversationTyping(id, false), 1600);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendText();
    } else if (event.key === 'Escape') {
      replyTo = null;
      editing = null;
      replyBar.classList.add('hidden');
      if (editing) input.value = '';
    } else if (event.key === 'ArrowUp' && !input.value.trim()) {
      const own = [...messages].reverse().find((message) => message.mine && message.type === 'text' && !message.deleted);
      if (own) {
        event.preventDefault();
        startEdit(own);
      }
    }
  });

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    sendText();
  });

  async function sendText() {
    const body = input.value.trim();
    if (!body) return;
    if (editing) return saveEdit(body);
    input.value = '';
    autoGrow();
    emitConversationTyping(id, false);
    try {
      const data = await api.post(`/conversations/${id}/messages`, {
        body,
        reply_to_id: replyTo ? replyTo.id : null,
        client_msg_id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`
      });
      addMessage(data.message, true);
      replyTo = null;
      replyBar.classList.add('hidden');
    } catch (err) {
      input.value = body;
      toast(err.message || 'Не удалось отправить', 'error');
    }
  }

  async function saveEdit(body) {
    try {
      const data = await api.patch(`/messages/${editing.id}`, { body });
      const index = messages.findIndex((item) => item.id === editing.id);
      if (index >= 0) messages[index] = { ...messages[index], ...data.message, sender: messages[index].sender };
      editing = null;
      input.value = '';
      replyBar.classList.add('hidden');
      autoGrow();
      renderMessages();
    } catch (err) {
      toast(err.message || 'Не удалось изменить', 'error');
    }
  }

  async function sendImage() {
    if (!pendingImage) return;
    const form = toFormData({ reply_to_id: replyTo ? String(replyTo.id) : '' }, pendingImage.blob, 'photo.jpg');
    imagePreview.classList.add('hidden');
    try {
      const data = await api.upload(`/conversations/${id}/messages/image`, form);
      addMessage(data.message, true);
      replyTo = null;
      replyBar.classList.add('hidden');
    } catch (err) {
      toast(err.message || 'Не удалось отправить фото', 'error');
    } finally {
      pendingImage = null;
    }
  }

  /* ---------- Loading ---------- */
  async function markRead() {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    try {
      await api.post(`/conversations/${id}/read`, { seq: last.seq });
    } catch (err) {
      // Read state is best-effort.
    }
  }

  async function loadOlder() {
    if (!hasMore || loadingOlder || !messages.length) return;
    loadingOlder = true;
    const previousHeight = messagesEl.scrollHeight;
    const previousTop = messagesEl.scrollTop;
    try {
      const data = await api.get(`/conversations/${id}/messages?before_seq=${messages[0].seq}&limit=40`);
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
    if (messagesEl.scrollTop < 60) loadOlder();
    const far = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight > 500;
    jumpBtn.classList.toggle('hidden', !far);
  });
  jumpBtn.addEventListener('click', () => scrollToBottom('smooth'));

  async function reloadConversation() {
    const data = await api.get(`/conversations/${id}`);
    conversation = data.conversation;
    members = data.members || [];
    pinned = data.pinned || [];
    updateHeader();
    renderPinned();
    return conversation;
  }

  async function init() {
    messagesEl.innerHTML = '';
    messagesEl.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      await reloadConversation();
      const data = await api.get(`/conversations/${id}/messages?limit=40`);
      messages = data.messages || [];
      hasMore = !!data.has_more;
      firstUnreadSeq = (Number(conversation.last_read_seq) || 0) + 1;
      renderMessages();
      scrollToBottom();
      await markRead();
      try {
        const wall = await api.get('/chat/wallpapers');
        wallpaper = wall.wallpaper || 'paper';
        messagesEl.className = `chat-messages chat-wallpaper-${wallpaper}`;
      } catch (err) {
        // Wallpaper is cosmetic.
      }
      if (conversation.can_write !== false) input.focus({ preventScroll: true });
    } catch (err) {
      messagesEl.innerHTML = '';
      const wrap = el('div', { class: 'empty' });
      wrap.append(el('div', { class: 'empty__emoji', text: '💬' }));
      wrap.append(el('div', { class: 'empty__title', text: 'Чат недоступен' }));
      wrap.append(el('div', { class: 'empty__text', text: err.message || 'Возможно, вы не участник беседы' }));
      wrap.append(button('К чатам', { variant: 'btn-secondary', onClick: () => navigate('/chats') }));
      messagesEl.append(wrap);
      composer.style.display = 'none';
      pinnedBar.classList.add('hidden');
    }
  }

  /* ---------- Actions ---------- */
  infoBtn.addEventListener('click', () => {
    openGroupInfo(id, {
      onLeave: () => navigate('/chats'),
      onChanged: () => reloadConversation().catch(() => {})
    });
  });

  searchBtn.addEventListener('click', () => {
    const body = el('div', { class: 'form-stack' });
    const inputSearch = el('input', { class: 'input', attrs: { placeholder: 'Текст сообщения', type: 'search' } });
    const results = el('div');
    body.append(inputSearch, results);
    const modal = openModal({ title: 'Поиск в чате', body, size: 'wide' });
    let timer = null;
    inputSearch.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        results.innerHTML = '';
        if (inputSearch.value.trim().length < 2) return;
        try {
          const data = await api.get(`/conversations/${id}/search?q=${encodeURIComponent(inputSearch.value.trim())}`);
          if (!data.messages.length) {
            results.append(el('div', { class: 'purchase__note', text: 'Ничего не найдено' }));
            return;
          }
          for (const message of data.messages) {
            const row = el('button', { class: 'group-card', attrs: { type: 'button' }, style: { width: '100%', marginBottom: '6px' } });
            row.append(el('span', { class: 'people-card__meta', text: message.sender_name }));
            row.append(el('span', { class: 'people-card__name', text: message.body || message.type, style: { flex: '1', textAlign: 'left' } }));
            row.append(el('span', { class: 'people-card__meta', text: formatTime(message.created_at) }));
            row.addEventListener('click', () => {
              modal.close();
              jumpToMessage(message);
            });
            results.append(row);
          }
        } catch (err) {
          toast(err.message || 'Ошибка поиска', 'error');
        }
      }, 300);
    });
    setTimeout(() => inputSearch.focus(), 60);
  });

  menuBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    const existing = document.querySelector('.conv-window-menu');
    if (existing) {
      existing.remove();
      return;
    }
    const menu = el('div', { class: 'menu conv-window-menu' });
    menu.style.cssText = 'position:absolute;right:14px;top:60px;z-index:50';
    const item = (label, handler, danger = false) => {
      const btn = el('button', { class: `menu__item ${danger ? 'menu__item--danger' : ''}`, text: label, attrs: { type: 'button' } });
      btn.addEventListener('click', () => {
        menu.remove();
        handler();
      });
      menu.append(btn);
    };
    item('Обои чата', () => {
      openWallpaperPicker(id, wallpaper, (next) => {
        wallpaper = next;
        messagesEl.className = `chat-messages chat-wallpaper-${next}`;
      });
    });
    if (conversation && conversation.type === 'dm' && conversation.peer) {
      item('Профиль собеседника', () => navigate(`/u/${conversation.peer.username}`));
    }
    if (conversation && conversation.type === 'group') item('Информация о группе', () => infoBtn.click());
    item(conversation && conversation.muted ? 'Включить звук' : 'Без звука', async () => {
      try {
        const data = await api.post(`/conversations/${id}/${conversation.muted ? 'unmute' : 'mute'}`, { hours: 24 });
        conversation.muted = !!data.muted_until;
        toast(data.muted_until ? 'Уведомления выключены на сутки' : 'Звук включён');
      } catch (err) {
        toast(err.message || 'Ошибка', 'error');
      }
    });
    if (conversation && conversation.type === 'dm') {
      item('Заблокировать', async () => {
        try {
          await api.post(`/users/${conversation.peer.id}/block`);
          toast('Пользователь заблокирован');
          navigate('/chats');
        } catch (err) {
          toast(err.message || 'Ошибка', 'error');
        }
      }, true);
    }
    item(conversation && conversation.type === 'group' ? 'Выйти из группы' : 'Удалить чат', async () => {
      const ok = await confirmDialog({
        title: 'Удалить чат?',
        message: conversation && conversation.type === 'group' ? 'Вы выйдете из группы.' : 'Чат переместится в архив.',
        confirmText: 'Удалить',
        danger: true
      });
      if (!ok) return;
      await api.delete(`/conversations/${id}`);
      navigate('/chats');
    }, true);
    root.style.position = 'relative';
    root.append(menu);
    setTimeout(() => {
      const close = () => {
        menu.remove();
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  });

  /* ---------- Realtime ---------- */
  const offs = [
    onSocket('message:new', ({ message, conversation_id }) => {
      if (Number(conversation_id) !== id || destroyed) return;
      addMessage(message);
      if (message.sender_id !== me.id) {
        if (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 220) markRead();
        else {
          jumpBtn.classList.remove('hidden');
          jumpBtn.textContent = '↓';
        }
      }
    }),
    onSocket('message:edited', ({ conversation_id, message }) => {
      if (Number(conversation_id) !== id) return;
      const index = messages.findIndex((item) => item.id === message.id);
      if (index < 0) return;
      messages[index] = { ...messages[index], body: message.body, edited_at: message.edited_at };
      renderMessages();
    }),
    onSocket('message:deleted', ({ conversation_id, id: deletedId }) => {
      if (Number(conversation_id) !== id) return;
      const message = messages.find((item) => item.id === Number(deletedId));
      if (!message) return;
      message.deleted = true;
      message.body = '';
      message.image_path = null;
      message.gift = null;
      message.poll = null;
      message.reactions = [];
      renderMessages();
    }),
    onSocket('message:reaction', ({ conversation_id, id: messageId, reactions }) => {
      if (Number(conversation_id) !== id) return;
      const message = messages.find((item) => item.id === Number(messageId));
      if (!message) return;
      message.reactions = reactions;
      renderMessages();
    }),
    onSocket('message:pin', () => {
      reloadConversation().catch(() => {});
    }),
    onSocket('conversation:read', ({ conversation_id, reader_id, seq }) => {
      if (Number(conversation_id) !== id || Number(reader_id) === me.id) return;
      let changed = false;
      for (const message of messages) {
        if (message.mine && message.seq <= Number(seq)) {
          message.reader_count = Math.max(Number(message.reader_count) || 0, 1);
          changed = true;
        }
      }
      if (changed) renderMessages();
    }),
    onSocket('conversation:typing', ({ conversation_id, user_id, name, typing, recording }) => {
      if (Number(conversation_id) !== id || Number(user_id) === me.id) return;
      if (typing) {
        const who = conversation && conversation.type === 'group' ? `${name || 'Кто-то'} ` : '';
        typingEl.textContent = recording ? `${who}записывает голосовое…` : `${who}печатает…`;
        clearTimeout(peerTypingTimer);
        peerTypingTimer = setTimeout(() => {
          typingEl.textContent = '';
        }, 5000);
      } else {
        typingEl.textContent = '';
      }
    }),
    onSocket('conversation:update', ({ conversation_id }) => {
      if (Number(conversation_id) === id) reloadConversation().catch(() => {});
    }),
    onSocket('poll:update', ({ conversation_id, poll }) => {
      if (Number(conversation_id) !== id) return;
      const message = messages.find((item) => item.poll && item.poll.id === poll.id);
      if (!message) return;
      message.poll = poll;
      renderMessages();
    }),
    onSocket('presence:update', () => updateHeader())
  ];

  init();

  return {
    el: root,
    destroy() {
      destroyed = true;
      for (const off of offs) off();
      clearTimeout(typingTimer);
      clearTimeout(peerTypingTimer);
      if (recordTimer) clearInterval(recordTimer);
      if (recordStream) recordStream.getTracks().forEach((track) => track.stop());
      if (getState().activeMatchId === id) getState().activeMatchId = 0;
    }
  };
}
