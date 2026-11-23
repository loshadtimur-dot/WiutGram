import { api } from '../../api.js?v=31';
import { el, button, openModal, toast } from '../../ui.js?v=31';
import { sectionHead, emptyState, sudoConfirm, fmtDateTime } from './shared.js?v=31';

const STATUS = {
  new: 'Новый',
  in_progress: 'В работе',
  granted: 'Выдан доступ',
  declined: 'Отклонён'
};

function tempPasswordModal(password, username) {
  const body = el('div', { class: 'col', style: { gap: '10px' } });
  body.append(
    el('p', {
      class: 'field__hint',
      text: 'Пароль показывается один раз. Передайте его пользователю в Telegram. После закрытия окна его невозможно увидеть снова.'
    })
  );
  const code = el('div', { class: 'purchase__code', style: { fontSize: '20px', justifyContent: 'center' }, text: password });
  body.append(code, el('div', { class: 'people-card__meta', text: `Логин: @${username}` }));
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Временный пароль', body, footer });
  footer.append(
    button('Копировать', {
      variant: 'btn-secondary',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(password);
          toast('Скопировано', 'success');
        } catch (err) {
          toast('Выделите пароль вручную', 'error');
        }
      }
    }),
    button('Закрыть', { variant: 'btn-primary', onClick: () => modal.close() })
  );
}

function recoveryCardModal(userId) {
  const body = el('div', { class: 'col', style: { gap: '10px' } });
  body.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
  const modal = openModal({ title: 'Восстановление доступа', body, size: 'wide' });
  let card = null;

  const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Новый пароль (мин. 10 символов)' } });

  async function load() {
    body.innerHTML = '';
    body.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      card = await api.get(`/admin/access/users/${userId}`);
      body.innerHTML = '';
      const info = el('div', { class: 'admin-card', style: { padding: '10px' } });
      info.append(el('div', { style: { fontWeight: '700' }, text: card.user.display_name }));
      info.append(
        el('div', {
          class: 'people-card__meta',
          text: `@${card.user.username} · ${card.user.email || 'email не указан'} · id ${card.user.id}`
        })
      );
      info.append(
        el('div', {
          class: 'people-card__meta',
          text: `Создан: ${fmtDateTime(card.user.created_at)} · последний вход: ${fmtDateTime(card.user.last_login_at)} · IP: ${card.user.last_ip || '—'}`
        })
      );
      if (card.user.force_password_change) info.append(el('div', { class: 'people-card__meta', text: 'Требуется смена пароля' }));
      body.append(info);

      const actions = el('div', { class: 'row', style: { flexWrap: 'wrap' } });
      actions.append(
        button('Временный пароль', {
          variant: 'btn-primary btn-sm',
          onClick: () =>
            sudoConfirm({
              title: 'Выдать временный пароль',
              description: 'Все сессии пользователя будут завершены, при входе потребуется новый пароль.',
              submitLabel: 'Выдать',
              onConfirm: async () => {
                const result = await api.post(`/admin/access/users/${userId}/temp-password`, {});
                tempPasswordModal(result.password, card.user.username);
              }
            })
        }),
        button('Завершить сессии', {
          variant: 'btn-ghost btn-sm',
          onClick: () =>
            sudoConfirm({
              title: 'Завершить все сессии',
              onConfirm: async () => {
                await api.post(`/admin/access/users/${userId}/revoke-sessions`, {});
                load();
              }
            })
        })
      );
      body.append(actions);
      body.append(
        el('div', { class: 'purchase__note', text: 'Пароль хранится только как bcrypt-хеш и никогда не отображается. Задать новый можно вручную:' })
      );
      body.append(password);
      body.append(
        button('Задать пароль вручную', {
          variant: 'btn-secondary btn-sm',
          onClick: () =>
            sudoConfirm({
              title: 'Новый пароль',
              onConfirm: async () => {
                await api.post(`/admin/access/users/${userId}/password`, { password: password.value });
                toast('Пароль обновлён', 'success');
              }
            })
        })
      );

      body.append(el('h3', { style: { fontSize: '13px', margin: '8px 0 2px' }, text: 'Сессии' }));
      if (!card.sessions.length) body.append(el('div', { class: 'people-card__meta', text: 'Активных сессий нет' }));
      for (const session of card.sessions) {
        body.append(
          el('div', {
            class: 'people-card__meta',
            text: `${session.device} · ${session.ip || '—'} · ${fmtDateTime(session.last_active_at)}`
          })
        );
      }
      body.append(el('h3', { style: { fontSize: '13px', margin: '8px 0 2px' }, text: 'История входов' }));
      for (const login of card.logins.slice(0, 10)) {
        body.append(
          el('div', {
            class: 'people-card__meta',
            text: `${login.success ? '✓' : '✕'} ${login.identifier || ''} · ${login.ip || '—'} · ${fmtDateTime(login.created_at)}`
          })
        );
      }
    } catch (err) {
      body.innerHTML = '';
      body.append(emptyState(err.message || 'Не удалось загрузить карточку'));
    }
  }
  load();
  return modal;
}

export default async function AccessAdmin() {
  const root = el('div');
  root.append(sectionHead('Доступ', 'Запросы на восстановление и управление сессиями. Пароли не хранятся в открытом виде.'));
  const filters = el('div', { class: 'shop-chips', style: { marginBottom: '10px' } });
  const list = el('div');
  let status = 'new';
  root.append(filters, list);

  function chips() {
    filters.innerHTML = '';
    for (const [key, label] of [['', 'Все'], ...Object.entries(STATUS)]) {
      const chip = el('button', { class: `shop-chip ${status === key ? 'is-active' : ''}`, text: label, attrs: { type: 'button' } });
      chip.addEventListener('click', () => {
        status = key;
        chips();
        load();
      });
      filters.append(chip);
    }
  }

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      const data = await api.get(`/admin/access/requests?status=${status}`);
      list.innerHTML = '';
      if (!data.requests.length) {
        list.append(emptyState('Запросов нет'));
        return;
      }
      for (const request of data.requests) {
        const card = el('div', { class: 'admin-card', style: { padding: '10px', marginBottom: '6px' } });
        const row = el('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap' } });
        const info = el('div', { style: { flex: '1', minWidth: '220px' } });
        info.append(
          el('div', { style: { fontWeight: '700' }, text: request.username ? `@${request.username}` : request.identifier })
        );
        info.append(el('div', { class: 'people-card__meta', text: `Статус: ${STATUS[request.status] || request.status}` }));
        info.append(el('div', { class: 'people-card__meta', text: `Связь: ${request.contact || '—'}` }));
        if (request.comment) info.append(el('div', { class: 'people-card__meta', text: `Комментарий: ${request.comment}` }));
        info.append(el('div', { class: 'people-card__meta', text: fmtDateTime(request.created_at) }));
        row.append(info);
        const actions = el('div', { class: 'admin-actions' });
        if (request.user_id) {
          actions.append(
            button('Карточка', {
              variant: 'btn-secondary btn-sm',
              onClick: () => recoveryCardModal(request.user_id)
            })
          );
        }
        actions.append(
          button('В работу', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              await api.post(`/admin/access/requests/${request.id}/status`, { status: 'in_progress' });
              load();
            }
          }),
          button('Отклонить', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              await api.post(`/admin/access/requests/${request.id}/status`, { status: 'declined' });
              load();
            }
          }),
          button('Доступ выдан', {
            variant: 'btn-primary btn-sm',
            onClick: async () => {
              await api.post(`/admin/access/requests/${request.id}/status`, { status: 'granted' });
              toast('Запрос закрыт', 'success');
              load();
            }
          })
        );
        row.append(actions);
        card.append(row);
        list.append(card);
      }
      const badge = el('div', { class: 'people-card__meta', text: `Новых запросов: ${data.counts.new}` });
      list.append(badge);
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить запросы'));
    }
  }

  chips();
  load();
  return root;
}
