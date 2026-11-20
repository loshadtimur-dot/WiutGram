import { api } from '../api.js?v=25';
import { el, button, avatarNode, openModal, toast, loadingRow, emptyState } from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { navigate } from '../router.js?v=25';

async function searchPeople(query) {
  if (!query || query.trim().length < 2) return [];
  const data = await api.get(`/people?q=${encodeURIComponent(query.trim())}&limit=8`);
  return data.people || data.results || [];
}

function peopleSuggest(input, onPick, multiple = false) {
  const box = el('div', { class: 'people-suggest' });
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      box.innerHTML = '';
      try {
        const people = await searchPeople(input.value);
        for (const person of people) {
          const row = el('button', { class: 'group-card', attrs: { type: 'button' }, style: { width: '100%', marginTop: '6px' } });
          row.append(avatarNode(person, 'sm'));
          const info = el('div', { style: { flex: '1', textAlign: 'left' } });
          info.append(el('div', { class: 'people-card__name', text: person.display_name }));
          info.append(el('div', { class: 'people-card__meta', text: `@${person.username}` }));
          row.append(info);
          row.addEventListener('click', () => {
            onPick(person);
            if (!multiple) {
              input.value = person.username;
              box.innerHTML = '';
            }
          });
          box.append(row);
        }
      } catch (err) {
        // Suggestions are best-effort.
      }
    }, 250);
  });
  return box;
}

export function openNewChatModal(onCreated) {
  const body = el('div', { class: 'form-stack' });
  const input = el('input', { class: 'input', attrs: { placeholder: 'Имя или @username', 'aria-label': 'Поиск людей' } });
  const box = peopleSuggest(input, async (person) => {
    try {
      const data = await api.post('/conversations/dm', { username: person.username });
      modal.close();
      if (onCreated) onCreated(data.conversation);
      else navigate(`/chat/${data.conversation.id}`);
      if (data.request) toast('Отправлен запрос на переписку');
    } catch (err) {
      toast(err.message || 'Не удалось открыть чат', 'error');
    }
  });
  body.append(el('label', { class: 'field__label', text: 'Кому написать' }), input, box);
  body.append(
    el('div', {
      class: 'purchase__note',
      text: 'Незнакомому человеку первое сообщение уйдёт как запрос на переписку. Ответить он сможет после принятия.'
    })
  );
  const modal = openModal({ title: 'Новый чат', body });
  setTimeout(() => input.focus(), 50);
  return modal;
}

export function openCreateGroupModal(onCreated) {
  const body = el('div', { class: 'form-stack' });
  const title = el('input', { class: 'input', attrs: { placeholder: 'Название группы', maxlength: '80' } });
  const description = el('textarea', { class: 'input', attrs: { placeholder: 'Описание (необязательно)', rows: '2', maxlength: '500' } });
  const memberInput = el('input', { class: 'input', attrs: { placeholder: 'Добавить участника по @username' } });
  const chips = el('div', { class: 'row', style: { flexWrap: 'wrap' } });
  const selected = new Set();
  const box = peopleSuggest(memberInput, (person) => {
    if (selected.has(person.username)) return;
    selected.add(person.username);
    const chip = el('button', { class: 'shop-chip', text: `@${person.username} ×`, attrs: { type: 'button' } });
    chip.addEventListener('click', () => {
      selected.delete(person.username);
      chip.remove();
    });
    chips.append(chip);
    memberInput.value = '';
  });
  const publicWrap = el('label', { class: 'check-row' });
  const publicToggle = el('input', { attrs: { type: 'checkbox' } });
  publicWrap.append(publicToggle, el('span', { text: 'Публичная группа с @username' }));
  const usernameInput = el('input', { class: 'input hidden', attrs: { placeholder: 'username группы', maxlength: '24' } });
  publicToggle.addEventListener('change', () => usernameInput.classList.toggle('hidden', !publicToggle.checked));
  const joinMode = el('select', { class: 'input' });
  for (const [value, label] of [
    ['invite_only', 'Только по приглашению'],
    ['approval', 'По заявке с одобрением'],
    ['open', 'Открытая — вступает любой']
  ]) {
    joinMode.append(el('option', { text: label, attrs: { value } }));
  }

  body.append(
    el('label', { class: 'field__label', text: 'Название' }),
    title,
    el('label', { class: 'field__label', text: 'Описание' }),
    description,
    el('label', { class: 'field__label', text: 'Участники' }),
    memberInput,
    box,
    chips,
    publicWrap,
    usernameInput,
    el('label', { class: 'field__label', text: 'Как вступают' }),
    joinMode
  );

  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  footer.append(
    button('Создать', {
      variant: 'btn-primary',
      onClick: async () => {
        try {
          const data = await api.post('/conversations', {
            title: title.value.trim(),
            description: description.value.trim(),
            usernames: [...selected],
            is_public: publicToggle.checked,
            username: publicToggle.checked ? usernameInput.value.trim() : '',
            join_mode: joinMode.value
          });
          modal.close();
          toast('Группа создана', 'success');
          if (onCreated) onCreated(data.conversation);
          else navigate(`/chat/${data.conversation.id}`);
        } catch (err) {
          toast(err.message || 'Не удалось создать группу', 'error');
        }
      }
    })
  );
  const modal = openModal({ title: 'Новая группа', body, footer });
  return modal;
}

export async function openGroupInfo(conversationId, options = {}) {
  const body = el('div');
  body.append(loadingRow());
  const modal = openModal({ title: 'О группе', body, size: 'wide' });
  let conversation = null;

  async function load() {
    body.innerHTML = '';
    body.append(loadingRow());
    try {
      const data = await api.get(`/conversations/${conversationId}`);
      conversation = data.conversation;
      body.innerHTML = '';
      const head = el('div', { class: 'status-preview' });
      head.append(el('div', { class: 'group-card__avatar', text: (conversation.title || 'Г').slice(0, 1) }));
      const info = el('div');
      info.append(el('div', { class: 'people-card__name', text: conversation.title }));
      info.append(
        el('div', {
          class: 'people-card__meta',
          text: `${conversation.members_count} участников${conversation.username ? ` · @${conversation.username}` : ''}`
        })
      );
      head.append(info);
      body.append(head);
      if (conversation.description) body.append(el('p', { class: 'field__hint', text: conversation.description }));

      const canManage = conversation.role === 'owner' || conversation.permissions.add_members;
      if (canManage) {
        const inviteBtn = button('Создать ссылку-приглашение', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            try {
              const data = await api.post(`/conversations/${conversationId}/invites`, { expires_in_days: 7, max_uses: 50 });
              const link = `${window.location.origin}${data.invite.link}`;
              try {
                await navigator.clipboard.writeText(link);
                toast('Ссылка скопирована', 'success');
              } catch (err) {
                toast(link);
              }
            } catch (err) {
              toast(err.message || 'Не удалось создать приглашение', 'error');
            }
          }
        });
        body.append(inviteBtn);
      }

      body.append(el('h3', { style: { fontSize: '14px', margin: '14px 0 6px' }, text: 'Участники' }));
      for (const member of data.members) {
        const row = el('div', { class: 'group-card', style: { marginBottom: '6px' } });
        row.append(avatarNode(member.user, 'sm'));
        const meta = el('div', { style: { flex: '1' } });
        meta.append(el('div', { class: 'people-card__name', text: member.user.display_name }));
        meta.append(
          el('div', {
            class: 'people-card__meta',
            text:
              member.role === 'owner'
                ? 'Владелец'
                : member.role === 'admin'
                  ? 'Администратор'
                  : member.banned
                    ? 'Заблокирован'
                    : 'Участник'
          })
        );
        row.append(meta);
        if (conversation.role === 'owner' && member.role !== 'owner') {
          const roleBtn = button(member.role === 'admin' ? 'Снять админа' : 'Сделать админом', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              await api.patch(`/conversations/${conversationId}/members/${member.user.id}`, {
                role: member.role === 'admin' ? 'member' : 'admin'
              });
              load();
            }
          });
          row.append(roleBtn);
          const kick = button('Исключить', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              await api.delete(`/conversations/${conversationId}/members/${member.user.id}`, { ban: false });
              load();
              if (options.onChanged) options.onChanged();
            }
          });
          row.append(kick);
        }
        body.append(row);
      }

      if (canManage) {
        const addInput = el('input', { class: 'input', attrs: { placeholder: 'Добавить по @username' } });
        const addBox = peopleSuggest(addInput, async (person) => {
          try {
            await api.post(`/conversations/${conversationId}/members`, { usernames: [person.username] });
            toast('Участник добавлен', 'success');
            load();
          } catch (err) {
            toast(err.message || 'Не удалось добавить', 'error');
          }
        });
        body.append(el('label', { class: 'field__label', text: 'Пригласить участника' }), addInput, addBox);
      }

      const leave = button('Выйти из группы', {
        variant: 'btn-ghost btn-sm',
        onClick: async () => {
          await api.delete(`/conversations/${conversationId}`);
          modal.close();
          toast('Вы вышли из группы');
          if (options.onLeave) options.onLeave();
        }
      });
      body.append(el('div', { style: { marginTop: '16px' } }, [leave]));
    } catch (err) {
      body.innerHTML = '';
      body.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить группу' }));
    }
  }

  load();
  return modal;
}

const WALLPAPERS = [
  { key: 'paper', label: 'Бумага' },
  { key: 'dunes', label: 'Дюны' },
  { key: 'mint', label: 'Мята' },
  { key: 'ocean', label: 'Океан' },
  { key: 'dusk', label: 'Сумерки' },
  { key: 'night', label: 'Ночь' }
];

export function openWallpaperPicker(conversationId, current, onSaved) {
  const body = el('div', { class: 'decor-gallery' });
  const modal = openModal({ title: 'Обои чата', body });
  for (const wallpaper of WALLPAPERS) {
    const tile = el('div', { class: 'decor-tile' });
    const preview = el('div', { class: `decor-tile__preview chat-wallpaper-${wallpaper.key}` });
    tile.append(preview);
    const info = el('div', { class: 'decor-tile__body' });
    info.append(el('div', { class: 'decor-tile__title', text: wallpaper.label }));
    info.append(
      button(wallpaper.key === current ? 'Выбрано' : 'Применить', {
        variant: wallpaper.key === current ? 'btn-secondary btn-sm' : 'btn-primary btn-sm',
        disabled: wallpaper.key === current,
        onClick: async () => {
          try {
            await api.post(`/conversations/${conversationId}/wallpaper`, { wallpaper: wallpaper.key });
            toast('Обои обновлены', 'success');
            modal.close();
            if (onSaved) onSaved(wallpaper.key);
          } catch (err) {
            toast(err.message || 'Не удалось сохранить', 'error');
          }
        }
      })
    );
    tile.append(info);
    body.append(tile);
  }
  return modal;
}

export function openPollModal(conversationId, onCreated) {
  const body = el('div', { class: 'form-stack' });
  const question = el('input', { class: 'input', attrs: { placeholder: 'Вопрос', maxlength: '200' } });
  const optionsWrap = el('div', { class: 'form-stack' });
  const addOption = () => {
    if (optionsWrap.children.length >= 10) return;
    optionsWrap.append(el('input', { class: 'input', attrs: { placeholder: `Вариант ${optionsWrap.children.length + 1}`, maxlength: '100' } }));
  };
  addOption();
  addOption();
  const anonymous = el('input', { attrs: { type: 'checkbox' } });
  const multiple = el('input', { attrs: { type: 'checkbox' } });
  body.append(
    el('label', { class: 'field__label', text: 'Вопрос' }),
    question,
    el('label', { class: 'field__label', text: 'Варианты' }),
    optionsWrap,
    button('Добавить вариант', { variant: 'btn-ghost btn-sm', onClick: addOption }),
    el('label', { class: 'check-row' }, [anonymous, el('span', { text: 'Анонимный опрос' })]),
    el('label', { class: 'check-row' }, [multiple, el('span', { text: 'Несколько ответов' })])
  );
  const footer = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const modal = openModal({ title: 'Новый опрос', body, footer });
  footer.append(
    button('Опубликовать', {
      variant: 'btn-primary',
      onClick: async () => {
        const options = [...optionsWrap.querySelectorAll('input')].map((input) => input.value.trim()).filter(Boolean);
        try {
          const data = await api.post(`/conversations/${conversationId}/polls`, {
            question: question.value.trim(),
            options,
            anonymous: anonymous.checked,
            multiple: multiple.checked
          });
          modal.close();
          if (onCreated) onCreated(data);
        } catch (err) {
          toast(err.message || 'Не удалось создать опрос', 'error');
        }
      }
    })
  );
  return modal;
}

export async function openForwardModal(messageIds, onDone) {
  const body = el('div');
  body.append(loadingRow());
  const modal = openModal({ title: 'Переслать', body });
  try {
    const data = await api.get('/conversations');
    body.innerHTML = '';
    if (!data.conversations.length) {
      body.append(emptyState('💬', 'Нет чатов', 'Сначала начните переписку.'));
      return modal;
    }
    for (const conversation of data.conversations) {
      const row = el('button', { class: 'group-card', attrs: { type: 'button' }, style: { width: '100%', marginBottom: '6px' } });
      row.append(avatarNode({ display_name: conversation.title, avatar_path: conversation.photo }, 'sm'));
      row.append(el('span', { class: 'people-card__name', text: conversation.title }));
      row.addEventListener('click', async () => {
        try {
          await api.post('/messages/forward', { message_ids: messageIds, conversation_ids: [conversation.id] });
          toast('Переслано', 'success');
          modal.close();
          if (onDone) onDone();
        } catch (err) {
          toast(err.message || 'Не удалось переслать', 'error');
        }
      });
      body.append(row);
    }
  } catch (err) {
    body.innerHTML = '';
    body.append(el('div', { class: 'purchase__note', text: err.message || 'Ошибка' }));
  }
  return modal;
}

export async function openChatGiftPicker(conversationId, onSent) {
  const body = el('div');
  body.append(loadingRow());
  const modal = openModal({ title: 'Подарить подарок', body });
  try {
    const data = await api.get('/gifts/mine');
    body.innerHTML = '';
    const gifts = (data.gifts || []).filter((gift) => !gift.hidden);
    if (!gifts.length) {
      body.append(
        emptyState(
          '🎁',
          'Нет подарков',
          'Купите подарок, чтобы отправить его в чат.',
          button('В магазин', { variant: 'btn-primary', onClick: () => navigate('/shop') })
        )
      );
      return modal;
    }
    const grid = el('div', { class: 'shop-grid' });
    for (const gift of gifts) {
      const card = el('button', { class: 'shop-card shop-card--gift', attrs: { type: 'button' } });
      const art = el('div', { class: 'shop-card__art' });
      art.innerHTML = gift.svg || '';
      card.append(art);
      const info = el('div', { class: 'shop-card__body' });
      info.append(el('div', { class: 'shop-card__title', text: gift.name }));
      card.append(info);
      card.addEventListener('click', async () => {
        try {
          const result = await api.post(`/conversations/${conversationId}/gifts`, { gift_id: gift.id });
          modal.close();
          toast('Подарок отправлен', 'success');
          if (onSent) onSent(result.message);
        } catch (err) {
          toast(err.message || 'Не удалось отправить подарок', 'error');
        }
      });
      grid.append(card);
    }
    body.append(grid);
  } catch (err) {
    body.innerHTML = '';
    body.append(el('div', { class: 'purchase__note', text: err.message || 'Ошибка' }));
  }
  return modal;
}

export function openEmojiPicker(onPick) {
  const body = el('div');
  body.append(el('h3', { style: { fontSize: '13px', margin: '0 0 6px' }, text: 'Стеклянные' }));
  const glass = el('div', { class: 'emoji-grid' });
  for (const id of ['heart', 'star', 'bolt', 'coffee', 'rocket', 'crown', 'sparkles', 'moon']) {
    const btn = el('button', { class: 'emoji-button', attrs: { type: 'button' } });
    btn.innerHTML = `<svg width="26" height="26" viewBox="0 0 64 64"><use href="/img/glass-sprite.svg#glass-${id}"></use></svg>`;
    btn.addEventListener('click', () => onPick(`glass:${id}`));
    glass.append(btn);
  }
  body.append(glass);
  body.append(el('h3', { style: { fontSize: '13px', margin: '12px 0 6px' }, text: 'Обычные' }));
  const plain = el('div', { class: 'emoji-grid' });
  for (const emoji of ['❤️', '👍', '😂', '🔥', '😮', '😢', '🎉', '🙏', '👏', '😍', '🤔', '💯']) {
    const btn = el('button', { class: 'emoji-button', text: emoji, attrs: { type: 'button' } });
    btn.addEventListener('click', () => onPick(emoji));
    plain.append(btn);
  }
  body.append(plain);
  return openModal({ title: 'Реакция', body });
}

