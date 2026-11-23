import { api, compressImage, setToken } from '../../api.js?v=31';
import { el, button, avatarNode, toast, openModal } from '../../ui.js?v=31';
import { icon } from '../../icons.js?v=31';
import { getState } from '../../state.js?v=31';
import { navigate } from '../../router.js?v=31';
import {
  sectionHead,
  statusChips,
  chip,
  fmtDate,
  fmtDateTime,
  courseLabel,
  emptyState,
  sudoConfirm,
  confirmDialog,
  pager,
  textField,
  selectField,
  switchField
} from './shared.js?v=31';

const COURSE_OPTIONS = [
  ['', 'Не указан'],
  ['1', '1 курс'],
  ['2', '2 курс'],
  ['3', '3 курс'],
  ['4', '4 курс'],
  ['5', '5 курс'],
  ['6', '6 курс'],
  ['master', 'Магистратура'],
  ['graduate', 'Выпускник'],
  ['phd', 'Аспирант']
];

const USERNAME_MAP = {
  display_name: 'Имя',
  username: 'Username',
  email: 'Email',
  birthdate: 'Дата рождения',
  gender: 'Пол',
  interested_in: 'Кого ищет',
  looking_for: 'Цель',
  university_short_name: 'Университет',
  course: 'Курс',
  district: 'Район',
  faculty: 'Факультет',
  job: 'Работа',
  education: 'Образование',
  height: 'Рост',
  bio: 'Био',
  is_verified: 'Верификация',
  is_banned: 'Бан',
  shadow_banned: 'Теневой бан',
  owner_note: 'Заметка',
  force_password_change: 'Смена пароля',
  password_hash: 'Пароль',
  token_version: 'Версия токена'
};

export default async function usersSection({ userId, showUser, backToUsers, refresh }) {
  if (userId) return renderDetail(userId, { backToUsers, refresh });
  return renderList({ showUser });
}

/* ---------------- List ---------------- */

async function renderList({ showUser }) {
  const state = { q: '', university_id: '', course: '', status: '', verified: '', demo: '', limit: 25, offset: 0 };
  const selected = new Set();
  let data = { users: [], total: 0 };
  let universities = [];

  const root = el('div', { class: 'col', style: { gap: '16px' } });
  const exportBtn = button('Экспорт CSV', {
    variant: 'btn-secondary btn-sm',
    onClick: () => window.open('/api/admin/users/export?format=csv', '_blank')
  });
  root.append(sectionHead('Пользователи', 'Все аккаунты, фильтры и модерация', exportBtn));

  const toolbar = el('div', { class: 'admin-toolbar admin-toolbar--users' });
  const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'ID, username, email, имя, университет, IP' } });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      state.q = search.value.trim();
      state.offset = 0;
      load();
    }
  });
  toolbar.append(search);

  try {
    universities = (await api.get('/admin/universities')).universities || [];
  } catch (err) {
    universities = [];
  }
  const uniFilter = el('select', { class: 'select' });
  uniFilter.append(el('option', { text: 'Все университеты', attrs: { value: '' } }));
  universities.forEach((university) =>
    uniFilter.append(el('option', { text: university.short_name, attrs: { value: String(university.id) } }))
  );
  uniFilter.addEventListener('change', () => {
    state.university_id = uniFilter.value;
    state.offset = 0;
    load();
  });

  const courseFilter = el('select', { class: 'select' });
  COURSE_OPTIONS.forEach(([value, label]) => courseFilter.append(el('option', { text: label, attrs: { value } })));
  courseFilter.addEventListener('change', () => {
    state.course = courseFilter.value;
    state.offset = 0;
    load();
  });

  const statusFilter = el('select', { class: 'select' });
  [
    ['', 'Все статусы'],
    ['active', 'Активные'],
    ['banned', 'Забаненные'],
    ['shadow', 'Теневой бан']
  ].forEach(([value, label]) => statusFilter.append(el('option', { text: label, attrs: { value } })));
  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.offset = 0;
    load();
  });

  const verifiedFilter = el('select', { class: 'select' });
  [
    ['', 'Верификация: все'],
    ['1', 'Верифицированные'],
    ['0', 'Без верификации']
  ].forEach(([value, label]) => verifiedFilter.append(el('option', { text: label, attrs: { value } })));
  verifiedFilter.addEventListener('change', () => {
    state.verified = verifiedFilter.value;
    state.offset = 0;
    load();
  });

  const demoFilter = el('select', { class: 'select' });
  [
    ['', 'Демо: все'],
    ['0', 'Только реальные'],
    ['1', 'Только демо']
  ].forEach(([value, label]) => demoFilter.append(el('option', { text: label, attrs: { value } })));
  demoFilter.addEventListener('change', () => {
    state.demo = demoFilter.value;
    state.offset = 0;
    load();
  });

  const limitFilter = el('select', { class: 'select' });
  [25, 50, 100].forEach((value) =>
    limitFilter.append(el('option', { text: `${value} на странице`, attrs: { value: String(value) } }))
  );
  limitFilter.addEventListener('change', () => {
    state.limit = Number(limitFilter.value);
    state.offset = 0;
    load();
  });

  toolbar.append(uniFilter, courseFilter, statusFilter, verifiedFilter, demoFilter, limitFilter);
  root.append(toolbar);

  const bulkBar = el('div', { class: 'admin-bulk hidden' });
  const bulkCount = el('span', { class: 'field__hint' });
  bulkBar.append(bulkCount);
  const bulkActions = [
    ['ban', 'Забанить'],
    ['unban', 'Разбанить'],
    ['verify', 'Верифицировать'],
    ['delete', 'Удалить']
  ];
  for (const [action, label] of bulkActions) {
    bulkBar.append(
      button(label, {
        variant: action === 'delete' ? 'btn-danger btn-sm' : 'btn-secondary btn-sm',
        onClick: () => {
          const ids = [...selected];
          if (!ids.length) return;
          sudoConfirm({
            title: `Массовое действие: ${label.toLowerCase()}`,
            description: `Будет затронуто аккаунтов: ${ids.length}.`,
            submitLabel: label,
            onConfirm: async () => {
              await api.post('/admin/users/bulk', { ids, action });
              selected.clear();
              updateBulkBar();
              await load();
            }
          });
        }
      })
    );
  }
  root.append(bulkBar);

  const tableWrap = el('div');
  root.append(tableWrap);
  const pagerWrap = el('div');
  root.append(pagerWrap);

  function updateBulkBar() {
    bulkBar.classList.toggle('hidden', selected.size === 0);
    bulkCount.textContent = `Выбрано: ${selected.size}`;
  }

  async function load() {
    tableWrap.innerHTML = '';
    tableWrap.append(el('div', { class: 'skeleton', style: { height: '260px' } }));
    try {
      const query = new URLSearchParams();
      Object.entries(state).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
      });
      data = await api.get(`/admin/users?${query.toString()}`);
    } catch (err) {
      tableWrap.innerHTML = '';
      tableWrap.append(emptyState(err.message || 'Не удалось загрузить пользователей'));
      return;
    }
    tableWrap.innerHTML = '';
    if (!data.users.length) {
      tableWrap.append(emptyState('Пользователи не найдены. Измените фильтры.'));
      pagerWrap.innerHTML = '';
      return;
    }

    const wrap = el('div', { class: 'admin-table-wrap' });
    const table = el('table', { class: 'admin-table' });
    const thead = el('thead');
    const headRow = el('tr');
    const selectAll = el('input', { attrs: { type: 'checkbox', 'aria-label': 'Выбрать всех' } });
    selectAll.addEventListener('change', () => {
      data.users.forEach((user) => {
        if (selectAll.checked) selected.add(user.id);
        else selected.delete(user.id);
      });
      table.querySelectorAll('[data-select-user]').forEach((box) => {
        box.checked = selectAll.checked;
      });
      updateBulkBar();
    });
    const thSelect = el('th');
    thSelect.append(selectAll);
    headRow.append(thSelect);
    ['Пользователь', 'Возраст', 'Университет', 'Статус', 'Регистрация', 'Вход', ''].forEach((label) =>
      headRow.append(el('th', { text: label }))
    );
    thead.append(headRow);

    const tbody = el('tbody');
    for (const user of data.users) {
      const row = el('tr');
      const cellSelect = el('td');
      const box = el('input', { attrs: { type: 'checkbox', 'aria-label': `Выбрать ${user.username}` } });
      box.setAttribute('data-select-user', String(user.id));
      box.checked = selected.has(user.id);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(user.id);
        else selected.delete(user.id);
        updateBulkBar();
      });
      cellSelect.append(box);
      row.append(cellSelect);

      const userCell = el('td');
      const userButton = el('button', { class: 'admin-user-link', attrs: { type: 'button' } });
      userButton.append(avatarNode({ ...user, avatar_path: user.avatar_path }, 'sm'));
      const userText = el('span', { class: 'admin-user-link__text' });
      userText.append(el('span', { text: user.display_name }));
      userText.append(el('span', { class: 'admin-user-link__meta', text: `@${user.username} · #${user.id}` }));
      userText.append(el('span', { class: 'admin-user-link__meta', text: user.email || 'email не указан' }));
      userButton.append(userText);
      userButton.addEventListener('click', () => showUser(user.id));
      userCell.append(userButton);
      row.append(userCell);

      row.append(el('td', { text: String(user.age ?? '—') }));
      const uniCell = el('td');
      uniCell.append(el('div', { text: user.university ? user.university.short_name : '—' }));
      uniCell.append(el('div', { class: 'field__hint', text: courseLabel(user.course) }));
      row.append(uniCell);
      const statusCell = el('td');
      statusCell.append(statusChips(user));
      row.append(statusCell);
      row.append(el('td', { text: fmtDate(user.created_at) }));
      row.append(el('td', { text: user.last_login_at ? fmtDate(user.last_login_at) : '—' }));
      const actionCell = el('td');
      actionCell.append(
        button('Открыть', { variant: 'btn-secondary btn-sm', onClick: () => showUser(user.id) })
      );
      row.append(actionCell);
      tbody.append(row);
    }
    table.append(thead, tbody);
    wrap.append(table);
    tableWrap.append(wrap);

    pagerWrap.innerHTML = '';
    pagerWrap.append(
      pager({
        total: data.total,
        limit: data.limit,
        offset: data.offset,
        onChange: (offset) => {
          state.offset = offset;
          load();
        }
      })
    );
  }

  await load();
  return root;
}

/* ---------------- Detail ---------------- */

async function renderDetail(userId, { backToUsers, refresh }) {
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  let detail;
  try {
    [detail] = await Promise.all([api.get(`/admin/users/${userId}`)]);
  } catch (err) {
    root.append(emptyState(err.message || 'Пользователь не найден', button('Назад', { onClick: backToUsers })));
    return root;
  }
  const user = detail.user;
  const universities = (await api.get('/admin/universities').catch(() => ({ universities: [] }))).universities || [];

  const head = el('div', { class: 'admin-user-head' });
  head.append(avatarNode(user, 'lg'));
  const headText = el('div', { class: 'admin-user-head__text' });
  const nameRow = el('div', { class: 'row', style: { gap: '8px' } });
  nameRow.append(el('h1', { text: user.display_name }));
  nameRow.append(statusChips(user));
  headText.append(nameRow);
  headText.append(
    el('p', {
      class: 'field__hint',
      text: `@${user.username} · #${user.id} · ${user.university_name || 'без университета'} · ${courseLabel(user.course)}${
        user.online ? ' · в сети' : ''
      }`
    })
  );
  head.append(headText);
  const headActions = el('div', { class: 'row' });
  headActions.append(button('К списку', { variant: 'btn-secondary btn-sm', onClick: backToUsers }));
  if (user.role !== 'owner') {
    headActions.append(
      button('Войти как пользователь', {
        variant: 'btn-secondary btn-sm',
        onClick: () => {
          sudoConfirm({
            title: 'Вход как пользователь',
            description: `Вы откроете сайт глазами @${user.username}. По умолчанию доступен только просмотр.`,
            submitLabel: 'Войти',
            onConfirm: async () => {
              const session = await api.post(`/admin/users/${user.id}/impersonate`, { full_access: false });
              setToken(session.token);
              window.location.href = '/swipe';
            }
          });
        }
      })
    );
    headActions.append(
      button('Удалить', {
        variant: 'btn-danger btn-sm',
        onClick: () =>
          confirmDialog({
            title: 'Удаление аккаунта',
            text: 'Будут удалены профиль, фото, посты, истории, матчи и сообщения. Действие необратимо.',
            confirmLabel: 'Удалить навсегда',
            danger: true,
            onConfirm: async () => {
              await api.delete(`/admin/users/${user.id}`, { confirm: user.username });
              backToUsers();
            }
          })
      })
    );
  }
  head.append(headActions);
  root.append(head);

  const tabs = [
    ['profile', 'Профиль'],
    ['photos', 'Фото'],
    ['activity', 'Активность'],
    ['chats', 'Переписки'],
    ['security', 'Безопасность'],
    ['moderation', 'Модерация'],
    ['log', 'Журнал']
  ];
  const tabBar = el('div', { class: 'admin-tabs' });
  const panel = el('div', { class: 'admin-panel' });
  let activeTab = 'profile';
  const buttons = new Map();

  for (const [id, label] of tabs) {
    const tab = el('button', { class: `admin-tabs__item ${id === activeTab ? 'is-active' : ''}`, text: label, attrs: { type: 'button' } });
    tab.addEventListener('click', () => {
      activeTab = id;
      buttons.forEach((node, key) => node.classList.toggle('is-active', key === id));
      loadTab();
    });
    buttons.set(id, tab);
    tabBar.append(tab);
  }
  root.append(tabBar, panel);

  async function loadTab() {
    panel.innerHTML = '';
    panel.append(el('div', { class: 'skeleton', style: { height: '180px' } }));
    try {
      let content;
      if (activeTab === 'profile') content = renderProfileTab(user, universities, refresh);
      if (activeTab === 'photos') content = renderPhotosTab(user, refresh);
      if (activeTab === 'activity') content = await renderActivityTab(user);
      if (activeTab === 'chats') content = await renderChatsTab(user);
      if (activeTab === 'security') content = await renderSecurityTab(user);
      if (activeTab === 'moderation') content = renderModerationTab(user, detail, refresh);
      if (activeTab === 'log') content = await renderLogTab(user);
      panel.innerHTML = '';
      panel.append(content);
    } catch (err) {
      panel.innerHTML = '';
      panel.append(emptyState(err.message || 'Не удалось загрузить вкладку'));
    }
  }

  loadTab();
  return root;
}

function renderProfileTab(user, universities, refresh) {
  const wrap = el('div', { class: 'col', style: { gap: '16px' } });
  const form = {
    display_name: user.display_name,
    username: user.username,
    email: user.email,
    birthdate: user.birthdate,
    gender: user.gender,
    interested_in: user.interested_in,
    looking_for: user.looking_for,
    university_id: user.university_id || '',
    faculty: user.faculty || '',
    course: user.course || '',
    district: user.district || '',
    bio: user.bio || '',
    job: user.job || '',
    education: user.education || '',
    height: user.height || '',
    instagram_link: user.instagram_link || ''
  };

  const grid = el('div', { class: 'admin-form-grid' });
  const addText = (key, label, options = {}) => {
    const field = el('label', { class: 'field' });
    field.append(el('span', { class: 'field__label', text: label }));
    const input = el('input', { class: 'input', attrs: { type: options.type || 'text', maxlength: options.maxlength || '120' } });
    input.value = form[key] ?? '';
    input.addEventListener('input', () => { form[key] = input.value; });
    field.append(input);
    grid.append(field);
    return input;
  };
  const addSelect = (key, label, options) => {
    const { field, select } = selectField(label, form[key], options);
    select.addEventListener('change', () => { form[key] = select.value; });
    grid.append(field);
    return select;
  };

  addText('display_name', 'Имя', { maxlength: 40 });
  addText('username', 'Username', { maxlength: 20 });
  addText('email', 'Email', { type: 'email', maxlength: 120 });
  addText('birthdate', 'Дата рождения', { type: 'date' });
  addSelect('gender', 'Пол', [['male', 'Мужчина'], ['female', 'Женщина'], ['other', 'Другое']]);
  addSelect('interested_in', 'Кого ищет', [['male', 'Мужчин'], ['female', 'Женщин'], ['everyone', 'Всех']]);
  addSelect('looking_for', 'Цель', [
    ['friends', 'Дружба'], ['chat', 'Общение'], ['project', 'Проектная работа'], ['not_sure', 'Не уверен(а)']
  ]);
  const uniSelect = addSelect(
    'university_id',
    'Университет',
    [['', 'Без университета'], ...universities.map((university) => [String(university.id), `${university.short_name} — ${university.name}`])]
  );
  uniSelect.addEventListener('change', () => {
    form.university_id = uniSelect.value ? Number(uniSelect.value) : null;
  });
  addText('faculty', 'Факультет', { maxlength: 80 });
  addSelect('course', 'Курс', COURSE_OPTIONS);
  addSelect('district', 'Район', [
    ['', 'Не указан'],
    ...['Алмазарский', 'Бектемирский', 'Мирабадский', 'Мирзо-Улугбекский', 'Сергелийский', 'Учтепинский', 'Чилансарский', 'Шайхантахурский', 'Юнусабадский', 'Яккасарайский', 'Яшнабадский', 'Янгихаётский'].map((name) => [name, name])
  ]);
  addText('job', 'Работа', { maxlength: 80 });
  addText('education', 'Образование', { maxlength: 80 });
  addText('height', 'Рост, см', { type: 'number', maxlength: 3 });
  addText('instagram_link', 'Instagram', { maxlength: 200 });
  wrap.append(grid);

  const bioField = el('label', { class: 'field' });
  bioField.append(el('span', { class: 'field__label', text: 'О себе' }));
  const bio = el('textarea', { class: 'textarea', attrs: { rows: '4', maxlength: '500' } });
  bio.value = form.bio;
  bio.addEventListener('input', () => { form.bio = bio.value; });
  bioField.append(bio);
  wrap.append(bioField);

  const toggles = el('div', { class: 'admin-form-grid' });
  const toggleDefs = [
    ['hide_district', 'Скрыть район'],
    ['hide_age', 'Скрыть возраст'],
    ['hide_online', 'Скрыть онлайн-статус'],
    ['is_incognito', 'Инкогнито'],
    ['hide_from_discovery', 'Скрыть из поиска']
  ];
  const toggleInputs = {};
  for (const [key, label] of toggleDefs) {
    const { row, input } = switchField(label, user[key]);
    toggleInputs[key] = input;
    toggles.append(row);
  }
  wrap.append(toggles);

  const saveRow = el('div', { class: 'row', style: { justifyContent: 'flex-end' } });
  const save = button('Сохранить профиль', {
    variant: 'btn-primary',
    onClick: async () => {
      save.disabled = true;
      try {
        const payload = { ...form };
        Object.entries(toggleInputs).forEach(([key, input]) => { payload[key] = input.checked; });
        if (!payload.university_id) payload.university_id = null;
        await api.put(`/admin/users/${user.id}`, payload);
        toast('Профиль обновлён', 'success');
        if (refresh) refresh();
      } catch (err) {
        toast(err.message || 'Не удалось сохранить', 'error');
      } finally {
        save.disabled = false;
      }
    }
  });
  saveRow.append(save);
  wrap.append(saveRow);
  return wrap;
}

function renderPhotosTab(user, refresh) {
  const wrap = el('div', { class: 'col', style: { gap: '16px' } });
  const photos = user.photos || [];
  const grid = el('div', { class: 'admin-photo-grid' });
  if (!photos.length) grid.append(emptyState('Фотографий нет'));
  photos.forEach((photo, index) => {
    const item = el('div', { class: 'admin-photo' });
    item.append(el('img', { attrs: { src: photo.path, alt: `Фото ${index + 1}` } }));
    const actions = el('div', { class: 'admin-photo__actions' });
    actions.append(
      button(index === 0 ? 'Главное' : 'Сделать главным', {
        variant: 'btn-secondary btn-sm',
        onClick: async () => {
          await api.put(`/admin/users/${user.id}/photos/${photo.id}/avatar`, {});
          toast('Главное фото обновлено', 'success');
          refresh();
        }
      })
    );
    if (index > 0) {
      actions.append(
        button('↑', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            const order = photos.map((p) => p.id);
            [order[index - 1], order[index]] = [order[index], order[index - 1]];
            await api.put(`/admin/users/${user.id}/photos/order`, { order });
            refresh();
          }
        })
      );
    }
    actions.append(
      button('Удалить', {
        variant: 'btn-ghost btn-sm',
        onClick: async () => {
          await api.delete(`/admin/users/${user.id}/photos/${photo.id}`);
          toast('Фото удалено', 'success');
          refresh();
        }
      })
    );
    item.append(actions);
    grid.append(item);
  });
  wrap.append(grid);

  const uploadRow = el('div', { class: 'row' });
  const input = el('input', { attrs: { type: 'file', accept: 'image/*' } });
  const upload = button('Загрузить фото', {
    variant: 'btn-primary btn-sm',
    onClick: async () => {
      if (!input.files || !input.files[0]) return toast('Выберите файл', 'error');
      upload.disabled = true;
      try {
        const compressed = await compressImage(input.files[0], 1280, 0.85);
        const form = new FormData();
        form.append('image', compressed.blob, 'photo.jpg');
        await api.upload(`/admin/users/${user.id}/photos`, form);
        toast('Фото загружено', 'success');
        refresh();
      } catch (err) {
        toast(err.message || 'Не удалось загрузить', 'error');
        upload.disabled = false;
      }
    }
  });
  uploadRow.append(input, upload);
  wrap.append(uploadRow);
  return wrap;
}

async function renderActivityTab(user) {
  const data = await api.get(`/admin/users/${user.id}/activity`);
  const wrap = el('div', { class: 'col', style: { gap: '16px' } });
  const counts = data.counts || {};
  const grid = el('div', { class: 'kpi-grid kpi-grid--compact' });
  const labels = {
    likes_given: 'Лайков отправлено',
    likes_received: 'Лайков получено',
    super_likes: 'Суперлайки',
    swipes: 'Всего свайпов',
    matches: 'Матчи',
    profile_views: 'Просмотры профиля',
    posts: 'Посты',
    stories: 'Истории'
  };
  for (const [key, label] of Object.entries(labels)) {
    const kpi = el('div', { class: 'kpi' });
    kpi.append(el('div', { class: 'kpi__label', text: label }), el('div', { class: 'kpi__value', text: String(counts[key] ?? 0) }));
    grid.append(kpi);
  }
  wrap.append(grid);

  const listBlock = (title, items) => {
    const card = el('div');
    card.append(el('h3', { class: 'admin-panel__title', text: title }));
    if (!items || !items.length) return card.append(emptyState('Пока пусто')), card;
    for (const item of items) {
      const row = el('div', { class: 'admin-kv-row' });
      row.append(el('span', { text: `${item.user.display_name} (@${item.user.username})` }));
      row.append(el('span', { class: 'field__hint', text: fmtDate(item.at) }));
      card.append(row);
    }
    return card;
  };
  const cols = el('div', { class: 'admin-two' });
  cols.append(listBlock('Кто лайкнул', data.likers));
  cols.append(listBlock('Кого лайкнул', data.liked));
  wrap.append(cols);
  wrap.append(listBlock('Матчи', (data.matches || []).map((match) => ({ user: { display_name: match.other_name, username: match.other_username }, at: match.created_at }))));
  wrap.append(listBlock('Смотрели профиль', data.viewers));
  return wrap;
}

async function renderChatsTab(user) {
  const data = await api.get(`/admin/users/${user.id}/chats`);
  const wrap = el('div', { class: 'col', style: { gap: '12px' } });
  if (!data.chats || !data.chats.length) return emptyState('У пользователя нет переписок');
  for (const chat of data.chats) {
    const row = el('div', { class: 'admin-kv-row' });
    const info = el('div');
    info.append(el('strong', { text: chat.other_name || chat.other_username || `Матч #${chat.id}` }));
    info.append(el('div', { class: 'field__hint', text: `${chat.messages_count || 0} сообщений · ${fmtDate(chat.created_at)}` }));
    row.append(info);
    row.append(
      button('Открыть переписку', {
        variant: 'btn-secondary btn-sm',
        onClick: () => openChat(user, chat)
      })
    );
    wrap.append(row);
  }
  wrap.prepend(el('p', { class: 'field__hint', text: 'Открытие переписки требует пароля владельца и причины. Действие записывается в журнал.' }));
  return wrap;
}

function openChat(user, chat) {
  const body = el('div', { class: 'col', style: { gap: '12px' } });
  const reason = el('textarea', { class: 'textarea', attrs: { rows: '2', maxlength: '300', placeholder: 'Причина просмотра (например, жалоба №12)' } });
  const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
  body.append(reason, password);
  const messagesBox = el('div', { class: 'admin-chat-log' });
  body.append(messagesBox);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Переписка', body, footer });
  footer.append(button('Закрыть', { variant: 'btn-ghost', onClick: () => modal.close() }));
  footer.append(
    button('Открыть', {
      variant: 'btn-primary',
      onClick: async (event) => {
        if (!reason.value.trim()) return toast('Укажите причину', 'error');
        if (!password.value) return toast('Введите пароль', 'error');
        event.target.disabled = true;
        try {
          await api.post('/admin/reauth', { password: password.value });
          const data = await api.post(`/admin/users/${user.id}/chats/${chat.id}/open`, { reason: reason.value.trim() });
          messagesBox.innerHTML = '';
          for (const message of data.messages || []) {
            const row = el('div', { class: 'admin-chat-line' });
            row.append(el('span', { class: 'field__hint', text: fmtDateTime(message.created_at) }));
            row.append(el('span', { text: message.body || `[${message.type}]` }));
            messagesBox.append(row);
          }
          if (!(data.messages || []).length) messagesBox.append(el('p', { class: 'field__hint', text: 'Сообщений нет' }));
          toast('Переписка открыта', 'success');
        } catch (err) {
          toast(err.message || 'Не удалось открыть', 'error');
        } finally {
          event.target.disabled = false;
        }
      }
    })
  );
}

async function renderSecurityTab(user) {
  const data = await api.get(`/admin/users/${user.id}/security`);
  const wrap = el('div', { class: 'col', style: { gap: '16px' } });

  const passCard = el('div', { class: 'admin-panel' });
  passCard.append(el('h3', { class: 'admin-panel__title', text: 'Пароль' }));
  passCard.append(el('p', { class: 'field__hint', text: 'Пароль хранится в виде необратимого хэша bcrypt. Посмотреть его нельзя.' }));
  const actions = el('div', { class: 'row' });
  actions.append(
    button('Задать новый пароль', {
      variant: 'btn-secondary btn-sm',
      onClick: () => setPassword(user)
    }),
    button(user.role === 'owner' ? 'Сгенерировать пароль' : 'Сгенерировать временный пароль', {
      variant: 'btn-secondary btn-sm',
      onClick: () => tempPassword(user)
    }),
    button('Выйти со всех устройств', {
      variant: 'btn-secondary btn-sm',
      onClick: () =>
        sudoConfirm({
          title: 'Завершить все сессии',
          description: 'Пользователь будет разлогинен на всех устройствах.',
          submitLabel: 'Завершить сессии',
          onConfirm: async () => {
            await api.post(`/admin/users/${user.id}/revoke-sessions`);
          }
        })
    })
  );
  passCard.append(actions);
  wrap.append(passCard);

  const sessionsCard = el('div', { class: 'admin-panel' });
  sessionsCard.append(el('h3', { class: 'admin-panel__title', text: 'Активные сессии' }));
  if (!data.sessions.length) sessionsCard.append(emptyState('Активных сессий нет'));
  for (const session of data.sessions) {
    const row = el('div', { class: 'admin-kv-row' });
    row.append(el('span', { text: `${session.device} · ${session.ip}` }));
    row.append(el('span', { class: 'field__hint', text: `Активность: ${fmtDateTime(session.last_active_at)}` }));
    row.append(
      button('Завершить', {
        variant: 'btn-ghost btn-sm',
        onClick: () =>
          sudoConfirm({
            title: 'Завершить сессию',
            submitLabel: 'Завершить',
            onConfirm: async () => {
              await api.delete(`/admin/users/${user.id}/sessions/${session.id}`);
            }
          })
      })
    );
    sessionsCard.append(row);
  }
  wrap.append(sessionsCard);

  const historyCard = el('div', { class: 'admin-panel' });
  historyCard.append(el('h3', { class: 'admin-panel__title', text: 'История входов' }));
  if (!data.history.length) historyCard.append(emptyState('История пуста'));
  for (const entry of data.history) {
    const row = el('div', { class: 'admin-kv-row' });
    row.append(el('span', { text: `${entry.success ? 'Успешно' : 'Неудачно'} · ${entry.identifier || '—'}` }));
    row.append(el('span', { class: 'field__hint', text: `${fmtDateTime(entry.created_at)} · ${entry.ip || ''}` }));
    historyCard.append(row);
  }
  wrap.append(historyCard);
  return wrap;
}

function setPassword(user) {
  const body = el('div', { class: 'col', style: { gap: '12px' } });
  const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль владельца' } });
  const next = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Новый пароль пользователя' } });
  const force = el('input', { attrs: { type: 'checkbox' } });
  const forceRow = el('label', { class: 'checkbox' });
  forceRow.append(force, el('span', { text: 'Потребовать смену при следующем входе' }));
  body.append(password, next, forceRow);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Новый пароль', body, footer });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
  footer.append(
    button('Сохранить', {
      variant: 'btn-primary',
      onClick: async (event) => {
        event.target.disabled = true;
        try {
          await api.post('/admin/reauth', { password: password.value });
          await api.post(`/admin/users/${user.id}/password`, { password: next.value, force_change: force.checked });
          toast('Пароль обновлён', 'success');
          modal.close();
        } catch (err) {
          toast(err.message || 'Не удалось изменить пароль', 'error');
          event.target.disabled = false;
        }
      }
    })
  );
}

function tempPassword(user) {
  sudoConfirm({
    title: 'Временный пароль',
    description: 'Пароль будет показан один раз и сразу сработает требование смены при входе.',
    submitLabel: 'Сгенерировать',
    onConfirm: async () => {
      const data = await api.post(`/admin/users/${user.id}/temp-password`, {});
      const body = el('div', { class: 'col', style: { gap: '12px' } });
      body.append(el('p', { class: 'field__hint', text: 'Скопируйте пароль сейчас. После закрытия окна он недоступен.' }));
      const value = el('input', { class: 'input', attrs: { readonly: 'readonly' } });
      value.value = data.password;
      body.append(value);
      const footer = el('div', { class: 'row' });
      const modal = openModal({ title: 'Временный пароль', body, footer });
      footer.append(
        button('Скопировать', {
          variant: 'btn-primary',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(data.password);
              toast('Скопировано', 'success');
            } catch (err) {
              value.select();
              document.execCommand('copy');
              toast('Скопировано', 'success');
            }
          }
        }),
        button('Закрыть', { variant: 'btn-ghost', onClick: () => modal.close() })
      );
      return false;
    }
  });
}

function renderModerationTab(user, detail, refresh) {
  const wrap = el('div', { class: 'col', style: { gap: '16px' } });
  const banCard = el('div', { class: 'admin-panel' });
  banCard.append(el('h3', { class: 'admin-panel__title', text: 'Блокировка и статусы' }));
  if (user.role === 'owner') {
    banCard.append(el('p', { class: 'field__hint', text: 'Владельца нельзя заблокировать, удалить или разжаловать.' }));
  } else {
    const reason = el('input', { class: 'input', attrs: { placeholder: 'Причина блокировки', maxlength: '200' } });
    const days = el('select', { class: 'select' });
    [['1', '1 день'], ['7', '7 дней'], ['30', '30 дней'], ['0', 'Навсегда']].forEach(([value, label]) =>
      days.append(el('option', { text: label, attrs: { value } }))
    );
    const banRow = el('div', { class: 'row', style: { alignItems: 'flex-end' } });
    banRow.append(reason, days);
    banRow.append(
      button(user.is_banned ? 'Изменить блокировку' : 'Забанить', {
        variant: 'btn-danger btn-sm',
        onClick: async () => {
          await api.put(`/admin/users/${user.id}/ban`, {
            reason: reason.value || 'Нарушение правил сообщества',
            days: Number(days.value)
          });
          toast('Пользователь заблокирован', 'success');
          refresh();
        }
      })
    );
    banCard.append(banRow);
    const buttons = el('div', { class: 'row', style: { marginTop: '8px' } });
    if (user.is_banned) {
      buttons.append(
        button('Разбанить', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            await api.put(`/admin/users/${user.id}/unban`, {});
            toast('Пользователь разбанен', 'success');
            refresh();
          }
        })
      );
    }
    buttons.append(
      button(user.shadow_banned ? 'Снять теневой бан' : 'Теневой бан', {
        variant: 'btn-secondary btn-sm',
        onClick: async () => {
          await api.put(`/admin/users/${user.id}/shadowban`, { value: !user.shadow_banned });
          toast('Статус обновлён', 'success');
          refresh();
        }
      }),
      button(user.is_verified ? 'Снять верификацию' : 'Верифицировать', {
        variant: 'btn-secondary btn-sm',
        onClick: async () => {
          await api.put(`/admin/users/${user.id}/verify`, { value: !user.is_verified });
          toast('Статус обновлён', 'success');
          refresh();
        }
      })
    );
    banCard.append(buttons);

    const noteLabel = el('label', { class: 'field', style: { marginTop: '8px' } });
    noteLabel.append(el('span', { class: 'field__label', text: 'Заметка владельца (видна только владельцу)' }));
    const note = el('textarea', { class: 'textarea', attrs: { rows: '3', maxlength: '1000' } });
    note.value = user.owner_note || '';
    noteLabel.append(note);
    const saveNote = button('Сохранить заметку', {
      variant: 'btn-secondary btn-sm',
      onClick: async () => {
        await api.put(`/admin/users/${user.id}/note`, { note: note.value });
        toast('Заметка сохранена', 'success');
      }
    });
    banCard.append(noteLabel, saveNote);
  }
  wrap.append(banCard);

  const reportsCard = el('div', { class: 'admin-panel' });
  reportsCard.append(el('h3', { class: 'admin-panel__title', text: 'Жалобы на пользователя' }));
  if (!(detail.reports || []).length) reportsCard.append(emptyState('Жалоб нет'));
  for (const report of detail.reports || []) {
    const row = el('div', { class: 'admin-kv-row' });
    row.append(el('span', { text: `#${report.id} · ${report.reason} · ${report.status}` }));
    row.append(el('span', { class: 'field__hint', text: `${fmtDateTime(report.created_at)} · от @${report.reporter_username}` }));
    reportsCard.append(row);
  }
  wrap.append(reportsCard);

  const bansCard = el('div', { class: 'admin-panel' });
  bansCard.append(el('h3', { class: 'admin-panel__title', text: 'История блокировок' }));
  if (!(detail.bans || []).length) bansCard.append(emptyState('Блокировок не было'));
  for (const ban of detail.bans || []) {
    bansCard.append(el('div', { class: 'admin-kv', text: `${ban.action} · ${fmtDateTime(ban.created_at)} · ${ban.ip || ''}` }));
  }
  wrap.append(bansCard);
  return wrap;
}

async function renderLogTab(user) {
  const data = await api.get(`/admin/log?q=${encodeURIComponent(`user:${user.id}`)}&limit=100`);
  const wrap = el('div', { class: 'col', style: { gap: '8px' } });
  if (!data.log.length) return emptyState('Действий по этому пользователю пока нет');
  for (const entry of data.log) {
    const row = el('div', { class: 'admin-log-row' });
    row.append(el('span', { class: 'admin-log-row__time', text: fmtDateTime(entry.created_at) }));
    row.append(el('strong', { text: entry.action }));
    row.append(el('span', { class: 'field__hint', text: `${entry.target || ''} · ${entry.ip || ''}` }));
    wrap.append(row);
  }
  return wrap;
}
