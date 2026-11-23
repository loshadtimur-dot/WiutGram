import { api } from '../../api.js?v=25';
import { el, button, toast, openModal } from '../../ui.js?v=25';
import { sectionHead, emptyState, fmtDateTime, sudoConfirm, pager } from './shared.js?v=25';

function formatSize(bytes) {
  if (!bytes) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export default async function systemSection({ active }) {
  if (active === 'log') return renderLog();
  if (active === 'data') return renderData();
  return renderSettings();
}

async function renderSettings() {
  const data = await api.get('/admin/settings');
  const settings = data.settings || {};
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(sectionHead('Настройки сайта', 'Изменения сразу видны всем пользователям'));

  const card = el('div', { class: 'admin-panel' });
  const form = el('div', { class: 'admin-form-grid' });
  const switchList = el('div', { class: 'admin-switch-list' });
  const inputs = {};

  const addText = (key, label, options = {}) => {
    const field = el('label', { class: 'field' });
    field.append(el('span', { class: 'field__label', text: label }));
    const input = el('input', {
      class: 'input',
      attrs: { type: options.type || 'text', min: options.min, max: options.max, maxlength: options.maxlength || '300' }
    });
    input.value = settings[key] ?? '';
    inputs[key] = input;
    field.append(input);
    form.append(field);
  };
  const addToggle = (key, label, hint) => {
    const row = el('label', { class: 'switch' });
    const text = el('div', { class: 'switch__text' });
    text.append(el('div', { class: 'switch__title', text: label }));
    text.append(el('div', { class: 'switch__desc', text: hint }));
    const input = el('input', { attrs: { type: 'checkbox' } });
    input.checked = String(settings[key]) === '1' || settings[key] === true;
    inputs[key] = input;
    row.append(text, input);
    switchList.append(row);
  };

  addText('site_name', 'Название сайта', { maxlength: 40 });
  addText('max_photos', 'Максимум фото профиля', { type: 'number', min: 1, max: 9 });
  addText('max_bio', 'Максимум символов в био', { type: 'number', min: 50, max: 2000 });
  addText('super_likes_per_day', 'Суперлайков в день', { type: 'number', min: 0, max: 50 });
  addToggle('registration_open', 'Регистрация открыта', 'Новые пользователи могут создавать аккаунты');
  addToggle('maintenance_mode', 'Режим обслуживания', 'Сайт доступен только владельцу');
  addToggle('allow_university_requests', 'Заявки на университеты', 'Пользователи смогут предлагать новые университеты');
  card.append(form);
  card.append(el('h3', { class: 'admin-panel__title', text: 'Доступ и режим' }), switchList);

  const welcomeField = el('label', { class: 'field' });
  welcomeField.append(el('span', { class: 'field__label', text: 'Приветственное сообщение' }));
  const welcome = el('textarea', { class: 'textarea', attrs: { rows: '3', maxlength: '300' } });
  welcome.value = settings.welcome_message || '';
  welcomeField.append(welcome);
  card.append(welcomeField);

  const ageNote = el('p', { class: 'field__hint', text: `Город: ${data.city}. Минимальный возраст: ${data.min_age} лет (не редактируется).` });
  card.append(ageNote);

  const save = button('Сохранить настройки', {
    variant: 'btn-primary',
    onClick: async () => {
      save.disabled = true;
      try {
        const payload = {
          site_name: inputs.site_name.value,
          max_photos: Number(inputs.max_photos.value),
          max_bio: Number(inputs.max_bio.value),
          super_likes_per_day: Number(inputs.super_likes_per_day.value),
          registration_open: inputs.registration_open.checked,
          maintenance_mode: inputs.maintenance_mode.checked,
          allow_university_requests: inputs.allow_university_requests.checked,
          welcome_message: welcome.value
        };
        await api.put('/admin/settings', payload);
        toast('Настройки сохранены', 'success');
      } catch (err) {
        toast(err.message || 'Не удалось сохранить', 'error');
      } finally {
        save.disabled = false;
      }
    }
  });
  const saveRow = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  saveRow.append(save);
  card.append(saveRow);
  root.append(card);
  return root;
}

async function renderLog() {
  const root = el('div', { class: 'col', style: { gap: '12px' } });
  root.append(sectionHead('Журнал действий', 'Записи нельзя изменить или удалить'));
  let query = '';
  let offset = 0;
  const limit = 50;
  const tableWrap = el('div');
  const toolbar = el('div', { class: 'admin-toolbar admin-toolbar--compact' });
  const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Действие, цель или username' } });
  const exportBtn = button('Экспорт CSV', { variant: 'btn-secondary btn-sm', onClick: () => exportLog() });
  toolbar.append(search, exportBtn);
  root.append(toolbar, tableWrap);

  async function load() {
    tableWrap.innerHTML = '';
    tableWrap.append(el('div', { class: 'skeleton', style: { height: '240px' } }));
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (query) params.set('q', query);
      const data = await api.get(`/admin/log?${params.toString()}`);
      tableWrap.innerHTML = '';
      if (!data.log.length) {
        tableWrap.append(emptyState('Записей нет'));
        return;
      }
      const wrap = el('div', { class: 'admin-table-wrap' });
      const table = el('table', { class: 'admin-table' });
      const thead = el('thead');
      const head = el('tr');
      ['Время', 'Действие', 'Цель', 'Владелец', 'IP', 'Детали'].forEach((label) => head.append(el('th', { text: label })));
      thead.append(head);
      const tbody = el('tbody');
      for (const entry of data.log) {
        const row = el('tr');
        row.append(el('td', { text: fmtDateTime(entry.created_at) }));
        row.append(el('td', { text: entry.action }));
        row.append(el('td', { text: entry.target || '—' }));
        row.append(el('td', { text: entry.username ? `@${entry.username}` : '—' }));
        row.append(el('td', { text: entry.ip || '—' }));
        const details = el('td', { class: 'admin-log-details' });
        const json = [entry.before_json, entry.after_json, entry.meta].filter(Boolean).join(' ');
        details.textContent = json ? json.slice(0, 180) : '—';
        details.title = json || '';
        row.append(details);
        tbody.append(row);
      }
      table.append(thead, tbody);
      wrap.append(table);
      tableWrap.append(wrap);
      tableWrap.append(
        pager({
          total: data.total,
          limit: data.limit,
          offset: data.offset,
          onChange: (next) => {
            offset = next;
            load();
          }
        })
      );
    } catch (err) {
      tableWrap.innerHTML = '';
      tableWrap.append(emptyState(err.message || 'Не удалось загрузить журнал'));
    }
  }

  async function exportLog() {
    const data = await api.get('/admin/log?limit=200');
    const rows = [['created_at', 'action', 'target', 'username', 'ip', 'details']].concat(
      data.log.map((entry) => [
        entry.created_at,
        entry.action,
        entry.target || '',
        entry.username || '',
        entry.ip || '',
        [entry.before_json, entry.after_json, entry.meta].filter(Boolean).join(' ')
      ])
    );
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = el('a', { attrs: { href: URL.createObjectURL(blob), download: 'activity-log.csv' } });
    document.body.append(link);
    link.click();
    link.remove();
  }

  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      query = search.value.trim();
      offset = 0;
      load();
    }
  });
  await load();
  return root;
}

async function renderData() {
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(sectionHead('Данные и резервные копии', 'Копии базы, демо-профили и передача владения'));
  const data = await api.get('/admin/backups');

  const info = el('div', { class: 'kpi-grid kpi-grid--compact' });
  for (const [label, value] of [['Размер базы', formatSize(data.db_size)], ['Папка uploads', formatSize(data.uploads_size)]]) {
    const card = el('div', { class: 'kpi' });
    card.append(el('div', { class: 'kpi__label', text: label }), el('div', { class: 'kpi__value', text: value }));
    info.append(card);
  }
  root.append(info);

  const backupCard = el('div', { class: 'admin-panel' });
  const head = el('div', { class: 'row', style: { justifyContent: 'space-between' } });
  head.append(el('h3', { class: 'admin-panel__title', text: 'Резервные копии' }));
  const createBtn = button('Создать копию', {
    variant: 'btn-primary btn-sm',
    onClick: async () => {
      createBtn.disabled = true;
      try {
        await api.post('/admin/backups', {});
        toast('Резервная копия создана', 'success');
        const node = await renderData();
        root.replaceWith(node);
      } catch (err) {
        toast(err.message || 'Не удалось создать копию', 'error');
      } finally {
        createBtn.disabled = false;
      }
    }
  });
  head.append(createBtn);
  backupCard.append(head);
  if (!data.backups.length) backupCard.append(emptyState('Копий пока нет'));
  for (const backup of data.backups) {
    const row = el('div', { class: 'admin-kv-row' });
    row.append(el('span', { text: `${backup.name} · ${formatSize(backup.size)}` }));
    row.append(el('span', { class: 'field__hint', text: fmtDateTime(backup.created_at) }));
    const actions = el('div', { class: 'admin-inline' });
    actions.append(
      button('Скачать', {
        variant: 'btn-secondary btn-sm',
        onClick: () => window.open(`/api/admin/backups/${encodeURIComponent(backup.name)}`, '_blank')
      }),
      button('Удалить', {
        variant: 'btn-ghost btn-sm',
        onClick: () =>
          sudoConfirm({
            title: 'Удалить резервную копию',
            description: backup.name,
            submitLabel: 'Удалить',
            onConfirm: async () => {
              await api.delete(`/admin/backups/${encodeURIComponent(backup.name)}`);
              const node = await renderData();
              root.replaceWith(node);
            }
          })
      })
    );
    row.append(actions);
    backupCard.append(row);
  }
  root.append(backupCard);

  const demoCard = el('div', { class: 'admin-panel' });
  demoCard.append(el('h3', { class: 'admin-panel__title', text: 'Демо-данные' }));
  demoCard.append(
    el('p', {
      class: 'field__hint',
      text: 'Демо-профили помечены DEMO и не могут войти. Пароли генерируются случайно и не показываются.'
    })
  );
  const demoActions = el('div', { class: 'row' });
  demoActions.append(
    button('Создать 30 демо-профилей', {
      variant: 'btn-secondary btn-sm',
      onClick: () =>
        sudoConfirm({
          title: 'Создать демо-профили',
          description: 'Текущие демо-профили будут заменены новыми.',
          submitLabel: 'Создать',
          onConfirm: async () => {
            const result = await api.post('/admin/seed-demo', { count: 30 });
            toast(`Создано профилей: ${result.created}`, 'success');
          }
        })
    }),
    button('Удалить все демо', {
      variant: 'btn-danger btn-sm',
      onClick: () =>
        sudoConfirm({
          title: 'Удалить демо-профили',
          submitLabel: 'Удалить',
          onConfirm: async () => {
            const result = await api.delete('/admin/demo');
            toast(`Удалено: ${result.removed}`, 'success');
          }
        })
    })
  );
  demoCard.append(demoActions);
  root.append(demoCard);

  const transferCard = el('div', { class: 'admin-panel' });
  transferCard.append(el('h3', { class: 'admin-panel__title', text: 'Передача владения' }));
  transferCard.append(
    el('p', {
      class: 'field__hint',
      text: 'После передачи ваш аккаунт станет обычным пользователем. Действие необратимо без нового входа в панель.'
    })
  );
  const userId = el('input', { class: 'input', attrs: { type: 'number', placeholder: 'ID нового владельца', min: '1' } });
  const word = el('input', { class: 'input', attrs: { placeholder: 'Введите ПЕРЕДАТЬ' } });
  const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
  const transferBtn = button('Передать владение', {
    variant: 'btn-danger',
    onClick: async () => {
      transferBtn.disabled = true;
      try {
        await api.post('/admin/reauth', { password: password.value });
        await api.post('/admin/transfer-owner', {
          user_id: Number(userId.value),
          confirm: word.value,
          password: password.value
        });
        toast('Владение передано. Войдите заново.', 'success');
        window.location.href = '/login';
      } catch (err) {
        toast(err.message || 'Не удалось передать владение', 'error');
        transferBtn.disabled = false;
      }
    }
  });
  transferCard.append(userId, word, password, transferBtn);
  root.append(transferCard);

  return root;
}
