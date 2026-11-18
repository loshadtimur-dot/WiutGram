import { api } from '../api.js?v=24';
import { el, button, openModal, confirmDialog, toast, avatarNode } from '../ui.js?v=24';

const REASONS = [
  ['spam', 'Спам или реклама'],
  ['nudity', 'Фото 18+ / обнажённость'],
  ['harassment', 'Оскорбления и травля'],
  ['scam', 'Мошенничество'],
  ['fake', 'Фейковый профиль'],
  ['underage', 'Несовершеннолетний пользователь'],
  ['other', 'Другое']
];

export function openReportDialog({ user, postId = null, onDone }) {
  const body = el('div', { class: 'col' });
  const header = el('div', { class: 'row' });
  header.append(avatarNode(user, 'sm'));
  header.append(el('div', { class: 'list-row__title', text: user.display_name || user.username }));
  body.append(header);
  body.append(el('p', { class: 'field__hint', text: 'Расскажите, что не так. Жалоба уйдёт модераторам.' }));

  let reason = '';
  const options = el('div', { class: 'option-grid' });
  REASONS.forEach(([value, label]) => {
    const card = el('button', { class: 'option-card', attrs: { type: 'button' } });
    card.append(el('span', { class: 'option-card__emoji', text: '⚠️' }));
    card.append(el('span', { text: label }));
    card.addEventListener('click', () => {
      reason = value;
      options.querySelectorAll('.option-card').forEach((node) => node.classList.remove('is-selected'));
      card.classList.add('is-selected');
    });
    options.append(card);
  });
  body.append(options);

  const details = el('textarea', {
    class: 'textarea',
    attrs: { placeholder: 'Детали (необязательно)', maxlength: '1000' }
  });
  body.append(details);

  const footer = el('div', { class: 'row' });
  const modal = openModal({
    title: 'Пожаловаться',
    body,
    footer,
    size: 'wide'
  });
  const send = button('Отправить жалобу', {
    variant: 'btn-danger',
    onClick: async () => {
      if (!reason) {
        toast('Выберите причину жалобы', 'error');
        return;
      }
      send.disabled = true;
      try {
        await api.post('/reports', {
          reported_id: user.id,
          post_id: postId,
          reason,
          details: details.value.trim()
        });
        toast('Жалоба отправлена модераторам', 'success');
        modal.close();
        if (onDone) onDone();
      } catch (err) {
        toast(err.message || 'Не удалось отправить жалобу', 'error');
      } finally {
        send.disabled = false;
      }
    }
  });
  footer.append(
    button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
    send
  );
  return modal;
}

export async function openBlockConfirm(user, options = {}) {
  const ok = await confirmDialog({
    title: 'Заблокировать пользователя?',
    message: `${user.display_name || user.username} исчезнет из свайпов, поиска и чатов. Вы больше не увидите друг друга.`,
    confirmText: 'Заблокировать',
    danger: true
  });
  if (!ok) return false;
  try {
    await api.post(`/users/${user.id}/block`);
    toast('Пользователь заблокирован', 'success');
    if (options.onDone) options.onDone();
    return true;
  } catch (err) {
    toast(err.message || 'Не удалось заблокировать', 'error');
    return false;
  }
}

export { REASONS };
