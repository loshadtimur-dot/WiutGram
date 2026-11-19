import { api } from '../../api.js?v=25';
import { el, button, openModal, toast } from '../../ui.js?v=25';
import { sectionHead, emptyState, sudoConfirm, fmtDateTime } from './shared.js?v=25';

async function openGroupDetails(id) {
  const body = el('div', { class: 'col', style: { gap: '8px' } });
  body.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
  const modal = openModal({ title: 'Группа', body, size: 'wide' });
  try {
    const data = await api.get(`/admin/groups/${id}`);
    body.innerHTML = '';
    body.append(el('h3', { style: { margin: 0, fontSize: '16px' }, text: data.group.title }));
    body.append(
      el('div', {
        class: 'people-card__meta',
        text: `${data.group.username ? `@${data.group.username} · ` : ''}${data.group.members_count || data.stats.members} участников · ${data.stats.messages} сообщений`
      })
    );
    if (data.group.description) body.append(el('p', { class: 'field__hint', text: data.group.description }));
    if (data.group.blocked) body.append(el('div', { class: 'purchase__note', text: 'Группа заблокирована' }));
    body.append(el('h3', { style: { fontSize: '13px', margin: '6px 0 0' }, text: 'Состав' }));
    for (const member of data.members) {
      body.append(
        el('div', {
          class: 'people-card__meta',
          text: `${member.display_name} (@${member.username}) · ${member.role}${member.banned ? ' · забанен' : ''}`
        })
      );
    }
    if (data.reports.length) {
      body.append(el('h3', { style: { fontSize: '13px', margin: '6px 0 0' }, text: 'Жалобы' }));
      for (const report of data.reports) {
        body.append(
          el('div', {
            class: 'people-card__meta',
            text: `@${report.reporter_username} · ${report.reason || 'без причины'} · ${fmtDateTime(report.created_at)}`
          })
        );
      }
    }
    if (data.log.length) {
      body.append(el('h3', { style: { fontSize: '13px', margin: '6px 0 0' }, text: 'Журнал' }));
      for (const entry of data.log.slice(0, 12)) {
        body.append(el('div', { class: 'people-card__meta', text: `${entry.action} · @${entry.username || '—'} · ${fmtDateTime(entry.created_at)}` }));
      }
    }
  } catch (err) {
    body.innerHTML = '';
    body.append(emptyState(err.message || 'Не удалось загрузить группу'));
  }
  return modal;
}

function blockGroup(group, refresh) {
  const body = el('div', { class: 'col', style: { gap: '8px' } });
  const reason = el('input', { class: 'input', attrs: { placeholder: 'Причина блокировки' } });
  const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
  body.append(el('p', { class: 'field__hint', text: `Группа «${group.title}»` }), reason, password);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: group.blocked ? 'Разблокировать группу' : 'Заблокировать группу', body, footer });
  footer.append(
    button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }),
    button(group.blocked ? 'Разблокировать' : 'Заблокировать', {
      variant: group.blocked ? 'btn-primary' : 'btn-ghost',
      onClick: async () => {
        try {
          await api.post('/admin/reauth', { password: password.value });
          await api.post(`/admin/groups/${group.id}/block`, {
            block: !group.blocked,
            reason: reason.value.trim()
          });
          toast(group.blocked ? 'Группа разблокирована' : 'Группа заблокирована', 'success');
          modal.close();
          refresh();
        } catch (err) {
          toast(err.message || 'Ошибка', 'error');
        }
      }
    })
  );
  return modal;
}

export default async function GroupsAdmin() {
  const root = el('div');
  root.append(sectionHead('Группы', 'Публичные и частные беседы, состав, жалобы и блокировка.'));
  const tools = el('div', { class: 'row', style: { marginBottom: '10px', flexWrap: 'wrap' } });
  const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Название или @username' } });
  const blocked = el('input', { attrs: { type: 'checkbox' } });
  const blockedLabel = el('label', { class: 'check-row' }, [blocked, el('span', { text: 'Только заблокированные' })]);
  tools.append(search, blockedLabel);
  const list = el('div');
  root.append(tools, list);
  let timer = null;

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'loading-row', html: '<div class="spinner spinner--sm"></div>' }));
    try {
      const params = new URLSearchParams();
      if (search.value.trim()) params.set('q', search.value.trim());
      if (blocked.checked) params.set('blocked', '1');
      const data = await api.get(`/admin/groups?${params.toString()}`);
      list.innerHTML = '';
      if (!data.groups.length) {
        list.append(emptyState('Групп нет'));
        return;
      }
      for (const group of data.groups) {
        const card = el('div', { class: 'admin-card', style: { padding: '10px', marginBottom: '6px' } });
        const row = el('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } });
        const info = el('div', { style: { flex: '1', minWidth: '220px' } });
        info.append(el('div', { style: { fontWeight: '700' }, text: group.title }));
        info.append(
          el('div', {
            class: 'people-card__meta',
            text: `${group.username ? `@${group.username} · ` : ''}${group.members} участников · жалоб: ${group.reports} · ${
              group.is_public ? 'публичная' : 'частная'
            }`
          })
        );
        if (group.owner) info.append(el('div', { class: 'people-card__meta', text: `Владелец: @${group.owner.username}` }));
        info.append(el('div', { class: 'people-card__meta', text: fmtDateTime(group.created_at) }));
        row.append(info);
        const actions = el('div', { class: 'row' });
        actions.append(
          button('Состав', { variant: 'btn-ghost btn-sm', onClick: () => openGroupDetails(group.id) }),
          button(group.blocked ? 'Разблокировать' : 'Блокировать', {
            variant: group.blocked ? 'btn-primary btn-sm' : 'btn-ghost btn-sm',
            onClick: () => blockGroup(group, load)
          })
        );
        row.append(actions);
        card.append(row);
        list.append(card);
      }
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить группы'));
    }
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(load, 300);
  });
  blocked.addEventListener('change', load);
  load();
  return root;
}

export { sudoConfirm };
