import { api } from '../../api.js?v=19';
import { el, button, toast, openModal } from '../../ui.js?v=19';
import { sectionHead, emptyState, fmtDate, chip, sudoConfirm } from './shared.js?v=19';

export default async function universitiesSection() {
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  let requests = [];
  let tab = 'list';
  let universities = [];

  const addBtn = button('Добавить университет', { variant: 'btn-primary btn-sm', onClick: () => editUniversity(null) });
  const importBtn = button('Импорт', { variant: 'btn-secondary btn-sm', onClick: () => openImport() });
  const mergeBtn = button('Объединить', { variant: 'btn-secondary btn-sm', onClick: () => openMerge() });
  root.append(sectionHead('Университеты', 'Список виден при регистрации и в фильтрах', [addBtn, importBtn, mergeBtn]));

  const tabs = el('div', { class: 'admin-tabs' });
  const listTab = el('button', { class: 'admin-tabs__item is-active', text: 'Список', attrs: { type: 'button' } });
  const requestsTab = el('button', { class: 'admin-tabs__item', text: 'Заявки', attrs: { type: 'button' } });
  tabs.append(listTab, requestsTab);
  root.append(tabs);
  const content = el('div');
  root.append(content);

  listTab.addEventListener('click', () => {
    tab = 'list';
    listTab.classList.add('is-active');
    requestsTab.classList.remove('is-active');
    render();
  });
  requestsTab.addEventListener('click', () => {
    tab = 'requests';
    requestsTab.classList.add('is-active');
    listTab.classList.remove('is-active');
    render();
  });

  async function load() {
    const [list, requestList] = await Promise.all([
      api.get('/admin/universities'),
      api.get('/admin/universities/requests?status=new').catch(() => ({ requests: [] }))
    ]);
    universities = list.universities || [];
    requests = requestList.requests || [];
  }

  function render() {
    content.innerHTML = '';
    if (tab === 'requests') {
      content.append(renderRequests());
      return;
    }
    if (!universities.length) {
      content.append(emptyState('Список пуст. Добавьте первый университет.'));
      return;
    }
    const wrap = el('div', { class: 'admin-table-wrap' });
    const table = el('table', { class: 'admin-table' });
    const thead = el('thead');
    const head = el('tr');
    ['Порядок', 'Аббревиатура', 'Название', 'Студенты', 'Статус', 'Действия'].forEach((label) =>
      head.append(el('th', { text: label }))
    );
    thead.append(head);
    const tbody = el('tbody');
    universities.forEach((university, index) => {
      const row = el('tr');
      const orderCell = el('td');
      const orderButtons = el('div', { class: 'admin-inline' });
      orderButtons.append(
        button('↑', {
          variant: 'btn-ghost btn-sm',
          onClick: () => move(index, -1)
        }),
        button('↓', {
          variant: 'btn-ghost btn-sm',
          onClick: () => move(index, 1)
        })
      );
      orderCell.append(orderButtons);
      row.append(orderCell);
      row.append(el('td', { text: university.short_name }));
      const nameCell = el('td');
      nameCell.append(el('div', { text: university.name }));
      if (university.name_en) nameCell.append(el('div', { class: 'field__hint', text: university.name_en }));
      if (university.is_system) nameCell.append(chip('Служебный'));
      row.append(nameCell);
      row.append(el('td', { text: String(university.users_count ?? 0) }));
      const statusCell = el('td');
      statusCell.append(chip(university.is_active ? 'Активен' : 'Скрыт', university.is_active ? '' : 'demo'));
      row.append(statusCell);
      const actions = el('td');
      const actionWrap = el('div', { class: 'admin-inline' });
      actionWrap.append(
        button('Изменить', { variant: 'btn-secondary btn-sm', onClick: () => editUniversity(university) }),
        button(university.is_active ? 'Скрыть' : 'Показать', {
          variant: 'btn-ghost btn-sm',
          onClick: async () => {
            try {
              await api.put(`/admin/universities/${university.id}`, {
                short_name: university.short_name,
                name: university.name,
                name_en: university.name_en,
                is_active: !university.is_active
              });
              await load();
              render();
              toast('Сохранено', 'success');
            } catch (err) {
              toast(err.message, 'error');
            }
          }
        })
      );
      if (!university.is_system) {
        actionWrap.append(
          button('Удалить', { variant: 'btn-ghost btn-sm', onClick: () => deleteUniversity(university) })
        );
      }
      actions.append(actionWrap);
      row.append(actions);
      tbody.append(row);
    });
    table.append(thead, tbody);
    wrap.append(table);
    content.append(wrap);

    const exportRow = el('div', { class: 'row' });
    exportRow.append(
      button('Экспорт списка', {
        variant: 'btn-secondary btn-sm',
        onClick: async () => {
          const data = await api.get('/admin/universities/export');
          const body = el('div', { class: 'col', style: { gap: '12px' } });
          const text = el('textarea', { class: 'textarea', attrs: { rows: '12', readonly: 'readonly' } });
          text.value = data.text;
          body.append(text);
          openModal({ title: 'Экспорт университетов', body, footer: el('div') });
        }
      })
    );
    content.append(exportRow);
  }

  function renderRequests() {
    const wrap = el('div', { class: 'col', style: { gap: '12px' } });
    if (!requests.length) return emptyState('Новых заявок нет');
    for (const request of requests) {
      const card = el('div', { class: 'admin-panel' });
      card.append(el('h3', { class: 'admin-panel__title', text: request.name }));
      card.append(
        el('p', {
          class: 'field__hint',
          text: `Автор: ${request.display_name} (@${request.username}) · ${fmtDate(request.created_at)}`
        })
      );
      const actions = el('div', { class: 'row' });
      actions.append(
        button('Одобрить', {
          variant: 'btn-primary btn-sm',
          onClick: () =>
            sudoConfirm({
              title: 'Одобрить заявку',
              description: `Университет «${request.name}» будет создан и присвоен автору.`,
              submitLabel: 'Одобрить',
              onConfirm: async () => {
                await api.post(`/admin/universities/requests/${request.id}`, { decision: 'approve' });
                await load();
                render();
              }
            })
        }),
        button('Отклонить', {
          variant: 'btn-secondary btn-sm',
          onClick: () =>
            sudoConfirm({
              title: 'Отклонить заявку',
              submitLabel: 'Отклонить',
              onConfirm: async () => {
                await api.post(`/admin/universities/requests/${request.id}`, { decision: 'reject' });
                await load();
                render();
              }
            })
        })
      );
      card.append(actions);
      wrap.append(card);
    }
    return wrap;
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= universities.length) return;
    const order = universities.map((university) => university.id);
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await api.put('/admin/universities/order', { order });
      await load();
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function editUniversity(university) {
    const body = el('div', { class: 'col', style: { gap: '12px' } });
    const short = el('input', { class: 'input', attrs: { maxlength: '12', placeholder: 'WIUT' } });
    const name = el('input', { class: 'input', attrs: { maxlength: '120', placeholder: 'Полное название' } });
    const nameEn = el('input', { class: 'input', attrs: { maxlength: '120', placeholder: 'English name (необязательно)' } });
    const active = el('input', { attrs: { type: 'checkbox' } });
    const activeRow = el('label', { class: 'checkbox' });
    activeRow.append(active, el('span', { text: 'Активен (виден при регистрации)' }));
    if (university) {
      short.value = university.short_name;
      name.value = university.name;
      nameEn.value = university.name_en || '';
      active.checked = !!university.is_active;
    } else {
      active.checked = true;
    }
    body.append(short, name, nameEn, activeRow);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: university ? 'Изменить университет' : 'Новый университет', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Сохранить', {
        variant: 'btn-primary',
        onClick: async (event) => {
          if (!short.value.trim() || name.value.trim().length < 2) {
            return toast('Укажите аббревиатуру и название', 'error');
          }
          event.target.disabled = true;
          try {
            const payload = {
              short_name: short.value.trim(),
              name: name.value.trim(),
              name_en: nameEn.value.trim(),
              is_active: active.checked
            };
            if (university) await api.put(`/admin/universities/${university.id}`, payload);
            else await api.post('/admin/universities', payload);
            await load();
            render();
            modal.close();
            toast('Сохранено', 'success');
          } catch (err) {
            toast(err.message || 'Не удалось сохранить', 'error');
            event.target.disabled = false;
          }
        }
      })
    );
  }

  function deleteUniversity(university) {
    const body = el('div', { class: 'col', style: { gap: '12px' } });
    body.append(
      el('p', {
        text: `Удаление «${university.short_name}». Студентов: ${university.users_count ?? 0}.`
      })
    );
    const transferField = el('label', { class: 'field' });
    transferField.append(el('span', { class: 'field__label', text: 'Перенести студентов в' }));
    const transfer = el('select', { class: 'select' });
    transfer.append(el('option', { text: 'Оставить без университета', attrs: { value: '' } }));
    universities
      .filter((item) => item.id !== university.id)
      .forEach((item) => transfer.append(el('option', { text: `${item.short_name} — ${item.name}`, attrs: { value: String(item.id) } })));
    transferField.append(transfer);
    const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
    body.append(transferField, password);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Удалить университет', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Удалить', {
        variant: 'btn-danger',
        onClick: async (event) => {
          if (!password.value) return toast('Введите пароль владельца', 'error');
          event.target.disabled = true;
          try {
            await api.post('/admin/reauth', { password: password.value });
            const payload = transfer.value
              ? { transfer_to: Number(transfer.value) }
              : { keep_users_without_university: true };
            await api.delete(`/admin/universities/${university.id}`, payload);
            await load();
            render();
            modal.close();
            toast('Университет удалён', 'success');
          } catch (err) {
            toast(err.message || 'Не удалось удалить', 'error');
            event.target.disabled = false;
          }
        }
      })
    );
  }

  function openMerge() {
    const body = el('div', { class: 'col', style: { gap: '12px' } });
    body.append(el('p', { class: 'field__hint', text: 'Все студенты первого университета перейдут во второй, первый будет удалён.' }));
    const from = el('select', { class: 'select' });
    const into = el('select', { class: 'select' });
    universities
      .filter((university) => !university.is_system)
      .forEach((university) => {
        const label = `${university.short_name} — ${university.name}`;
        from.append(el('option', { text: label, attrs: { value: String(university.id) } }));
        into.append(el('option', { text: label, attrs: { value: String(university.id) } }));
      });
    if (into.options.length > 1) into.selectedIndex = 1;
    const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
    body.append(from, into, password);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Объединить университеты', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Объединить', {
        variant: 'btn-primary',
        onClick: async (event) => {
          if (from.value === into.value) return toast('Выберите два разных университета', 'error');
          if (!password.value) return toast('Введите пароль', 'error');
          event.target.disabled = true;
          try {
            await api.post('/admin/reauth', { password: password.value });
            await api.post('/admin/universities/merge', { from_id: Number(from.value), into_id: Number(into.value) });
            await load();
            render();
            modal.close();
            toast('Университеты объединены', 'success');
          } catch (err) {
            toast(err.message || 'Не удалось объединить', 'error');
            event.target.disabled = false;
          }
        }
      })
    );
  }

  function openImport() {
    const body = el('div', { class: 'col', style: { gap: '12px' } });
    body.append(el('p', { class: 'field__hint', text: 'Одна строка = «АББРЕВИАТУРА | Полное название». Существующие пропускаются.' }));
    const text = el('textarea', { class: 'textarea', attrs: { rows: '10', placeholder: 'WIUT | Вестминстерский международный университет в Ташкенте' } });
    body.append(text);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Импорт университетов', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Импортировать', {
        variant: 'btn-primary',
        onClick: async (event) => {
          event.target.disabled = true;
          try {
            const result = await api.post('/admin/universities/import', { text: text.value });
            await load();
            render();
            modal.close();
            toast(`Добавлено: ${result.created}, пропущено: ${result.skipped}`, 'success');
          } catch (err) {
            toast(err.message || 'Ошибка импорта', 'error');
            event.target.disabled = false;
          }
        }
      })
    );
  }

  await load();
  render();
  return root;
}
