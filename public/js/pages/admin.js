import { api } from '../api.js?v=21';
import {
  el,
  button,
  toast,
  openModal,
  confirmDialog,
  avatarNode,
  formatNumber,
  timeAgo,
  loadingRow,
  emptyState,
  passwordField,
  ruleBadges
} from '../ui.js?v=21';
import { icon } from '../icons.js?v=21';
import { getState, isOwner, patchUser } from '../state.js?v=21';
import { lineChartNode, barChartNode } from '../components/charts.js?v=21';
import { openReportDialog } from '../components/report.js?v=21';
import { navigate } from '../router.js?v=21';

const TABS = [
  { id: 'dashboard', label: 'Дашборд', icon: 'chart' },
  { id: 'users', label: 'Пользователи', icon: 'users' },
  { id: 'content', label: 'Контент', icon: 'image' },
  { id: 'reports', label: 'Жалобы', icon: 'flag' },
  { id: 'settings', label: 'Настройки сайта', icon: 'sliders' },
  { id: 'demo', label: 'Демо-данные', icon: 'sparkles' },
  { id: 'log', label: 'Журнал', icon: 'history' },
  { id: 'transfer', label: 'Владение', icon: 'crown', ownerOnly: true }
];

export default async function AdminPage() {
  const me = getState().user;
  const root = el('div', { class: 'admin-page' });

  const head = el('div', { class: 'admin-head' });
  const headText = el('div');
  headText.append(el('h1', { class: 'admin-head__title', text: 'Админ-панель' }));
  headText.append(
    el('p', {
      class: 'section__subtitle',
      text: me.role === 'owner' ? 'Полный доступ владельца: пользователи, контент, жалобы и настройки сайта.' : 'Доступ администратора: модерация и пользователи.'
    })
  );
  head.append(headText);
  const refreshBtn = button('Обновить', {
    variant: 'btn-secondary',
    onClick: () => select(activeTab)
  });
  head.append(refreshBtn);
  root.append(head);

  const nav = el('div', { class: 'admin-nav' });
  const content = el('div');
  root.append(nav, content);

  let activeTab = 'dashboard';

  for (const tab of TABS) {
    if (tab.ownerOnly && !isOwner()) continue;
    const item = el('button', { class: 'admin-nav__item', attrs: { type: 'button' } });
    item.innerHTML = icon(tab.icon, { size: 16 });
    item.append(el('span', { text: tab.label }));
    item.dataset.tab = tab.id;
    item.addEventListener('click', () => select(tab.id));
    nav.append(item);
  }

  function select(tabId) {
    activeTab = tabId;
    nav.querySelectorAll('.admin-nav__item').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.tab === tabId);
    });
    content.innerHTML = '';
    content.append(loadingRow('Загружаем данные…'));
    const renderers = {
      dashboard: renderDashboard,
      users: renderUsers,
      content: renderContent,
      reports: renderReports,
      settings: renderSettings,
      demo: renderDemo,
      log: renderLog,
      transfer: renderTransfer
    };
    renderers[tabId]()
      .then((node) => {
        content.innerHTML = '';
        content.append(node);
      })
      .catch((err) => {
        content.innerHTML = '';
        content.append(
          emptyState('😕', 'Не удалось загрузить раздел', err.message || '', button('Повторить', {
            variant: 'btn-secondary',
            onClick: () => select(tabId)
          }))
        );
      });
  }

  /* ---------- Dashboard ---------- */
  async function renderDashboard() {
    const data = await api.get('/admin/stats');
    const wrap = el('div', { class: 'col', style: { gap: '16px' } });
    const kpis = el('div', { class: 'admin-kpis' });
    const kpi = (label, value) => {
      const node = el('div', { class: 'kpi' });
      node.append(el('div', { class: 'kpi__value', text: formatNumber(value) }));
      node.append(el('div', { class: 'kpi__label', text: label }));
      return node;
    };
    kpis.append(
      kpi('Всего пользователей', data.totals.users),
      kpi('Новых за 24 ч', data.totals.new_24h),
      kpi('Новых за 7 дней', data.totals.new_7d),
      kpi('Онлайн сейчас', data.totals.online),
      kpi('Матчей', data.totals.matches),
      kpi('Сообщений', data.totals.messages),
      kpi('Лайков', data.totals.likes),
      kpi('Постов', data.totals.posts)
    );
    wrap.append(kpis);

    const alertRow = el('div', { class: 'row' });
    if (data.totals.reports_new > 0) {
      const alert = el('div', { class: 'like-super-note' });
      alert.style.background = 'rgba(255,68,88,.1)';
      alert.style.color = 'var(--nope)';
      alert.innerHTML = icon('flag', { size: 16 });
      alert.append(el('span', { text: `Жалоб в очереди: ${data.totals.reports_new}` }));
      const openReports = button('Открыть', { variant: 'btn-danger', class: 'btn-sm', onClick: () => select('reports') });
      alert.append(openReports);
      alertRow.append(alert);
    }
    if (data.totals.demo_users) {
      alertRow.append(
        el('span', { class: 'tag', text: `Демо-профилей: ${data.totals.demo_users}` })
      );
    }
    wrap.append(alertRow);

    const chart = el('div', { class: 'chart-card' });
    const chartHead = el('div', { class: 'chart-card__head' });
    chartHead.append(el('div', { class: 'chart-card__title', text: 'Регистрации за 14 дней' }));
    chartHead.append(el('div', { class: 'chart-card__value', text: `Всего ${formatNumber(data.totals.users)}` }));
    chart.append(chartHead, lineChartNode(data.charts.registrations));
    wrap.append(chart);

    const twoCols = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' } });
    const messagesCard = el('div', { class: 'chart-card' });
    messagesCard.append(el('div', { class: 'chart-card__title', text: 'Сообщения по дням' }));
    messagesCard.append(barChartNode(data.charts.messages, { color: 'linear-gradient(180deg,#1BA8FF,#0d7fc4)' }));
    const swipesCard = el('div', { class: 'chart-card' });
    swipesCard.append(el('div', { class: 'chart-card__title', text: 'Свайпы по дням' }));
    swipesCard.append(barChartNode(data.charts.swipes));
    twoCols.append(messagesCard, swipesCard);
    wrap.append(twoCols);

    const recent = await api.get('/admin/log?limit=8').catch(() => ({ log: [] }));
    const recentCard = el('div', { class: 'admin-panel' });
    recentCard.append(el('div', { class: 'chart-card__title', text: 'Последние действия' }));
    const logList = el('div', { class: 'admin-log' });
    for (const row of recent.log) {
      const line = el('div', { class: 'admin-log__row' });
      line.append(el('span', { class: 'admin-log__time', text: timeAgo(row.created_at) }));
      line.append(el('span', { text: `${row.display_name || row.username || 'system'} — ${row.action} ${row.target || ''}` }));
      logList.append(line);
    }
    if (!recent.log.length) logList.append(el('div', { class: 'field__hint', text: 'Журнал пуст' }));
    recentCard.append(logList);
    wrap.append(recentCard);
    return wrap;
  }

  /* ---------- Users ---------- */
  async function renderUsers() {
    const wrap = el('div', { class: 'admin-panel' });
    const state = { q: '', role: '', banned: '', demo: '', sort: 'created_desc', offset: 0, limit: 25 };

    const toolbar = el('div', { class: 'admin-toolbar' });
    const searchInput = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Поиск: имя, username, email' } });
    const roleSelect = el('select', { class: 'select' });
    [['', 'Все роли'], ['owner', 'Владелец'], ['admin', 'Админ'], ['user', 'Пользователь']].forEach(([value, label]) =>
      roleSelect.append(el('option', { text: label, attrs: { value } }))
    );
    const statusSelect = el('select', { class: 'select' });
    [['', 'Все статусы'], ['0', 'Активные'], ['1', 'Забаненные']].forEach(([value, label]) =>
      statusSelect.append(el('option', { text: label, attrs: { value } }))
    );
    const demoSelect = el('select', { class: 'select' });
    [['', 'Все аккаунты'], ['0', 'Реальные'], ['1', 'Демо']].forEach(([value, label]) =>
      demoSelect.append(el('option', { text: label, attrs: { value } }))
    );
    const sortSelect = el('select', { class: 'select' });
    [
      ['created_desc', 'Новые сначала'],
      ['created_asc', 'Старые сначала'],
      ['name', 'По имени'],
      ['last_seen', 'По активности'],
      ['reports', 'По жалобам']
    ].forEach(([value, label]) => sortSelect.append(el('option', { text: label, attrs: { value } })));
    sortSelect.value = state.sort;
    toolbar.append(searchInput, roleSelect, statusSelect, demoSelect, sortSelect);
    wrap.append(toolbar);

    const tableWrap = el('div', { class: 'admin-table-wrap' });
    wrap.append(tableWrap);
    const pager = el('div', { class: 'pagination' });
    wrap.append(pager);

    const reload = async () => {
      tableWrap.innerHTML = '';
      tableWrap.append(loadingRow('Загружаем пользователей…'));
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(state.offset),
        sort: state.sort
      });
      if (state.q) params.set('q', state.q);
      if (state.role) params.set('role', state.role);
      if (state.banned) params.set('banned', state.banned);
      if (state.demo) params.set('demo', state.demo);

      let data;
      try {
        data = await api.get(`/admin/users?${params.toString()}`);
      } catch (err) {
        tableWrap.innerHTML = '';
        tableWrap.append(emptyState('😕', 'Не удалось загрузить', err.message || ''));
        return;
      }
      tableWrap.innerHTML = '';
      const table = el('table', { class: 'admin-table' });
      const thead = el('thead');
      const headRow = el('tr');
      ['Пользователь', 'Роль', 'Статус', 'Посты', 'Матчи', 'Жалобы', 'Регистрация', 'Действия'].forEach((title) =>
        headRow.append(el('th', { text: title }))
      );
      thead.append(headRow);
      table.append(thead);
      const tbody = el('tbody');

      for (const user of data.users) {
        const row = el('tr');
        const userCell = el('td');
        const userWrap = el('div', { class: 'admin-user' });
        userWrap.append(avatarNode(user, 'sm'));
        const info = el('div');
        const nameRow = el('div', { class: 'admin-user__name' });
        nameRow.append(el('span', { text: user.display_name }));
        nameRow.append(ruleBadges(user));
        info.append(nameRow);
        info.append(el('div', { class: 'admin-user__meta', text: `@${user.username} · ${user.email}` }));
        userWrap.append(info);
        userCell.append(userWrap);
        row.append(userCell);

        const roleCell = el('td');
        const roleChip = el('span', {
          class: `admin-chip ${user.role === 'owner' ? 'admin-chip--owner' : user.role === 'admin' ? 'admin-chip--admin' : ''}`,
          text: user.role === 'owner' ? 'Владелец' : user.role === 'admin' ? 'Админ' : 'Пользователь'
        });
        roleCell.append(roleChip);
        row.append(roleCell);

        const statusCell = el('td');
        const chips = el('div', { class: 'row', style: { gap: '4px' } });
        if (user.is_banned) chips.append(el('span', { class: 'admin-chip admin-chip--banned', text: 'Забанен' }));
        if (user.is_verified) chips.append(el('span', { class: 'admin-chip admin-chip--verified', text: 'Проверен' }));
        if (user.is_demo) chips.append(el('span', { class: 'admin-chip admin-chip--demo', text: 'DEMO' }));
        if (!user.is_banned && !user.is_verified && !user.is_demo) chips.append(el('span', { class: 'admin-chip', text: 'Активен' }));
        statusCell.append(chips);
        if (user.is_banned && user.ban_reason) {
          statusCell.append(el('div', { class: 'admin-user__meta', text: user.ban_reason }));
        }
        row.append(statusCell);

        row.append(el('td', { text: formatNumber(user.posts_count) }));
        row.append(el('td', { text: formatNumber(user.matches_count) }));
        row.append(
          el('td', {
            text: formatNumber(user.reports_count),
            style: { color: user.reports_count > 0 ? 'var(--nope)' : '', fontWeight: user.reports_count > 0 ? '700' : '' }
          })
        );
        row.append(el('td', { text: new Date(user.created_at).toLocaleDateString('ru-RU') }));

        const actionsCell = el('td');
        const actions = el('div', { class: 'admin-actions' });
        const actionBtn = (iconName, label, onClick, danger) => {
          const btn = el('button', {
            class: 'btn-icon',
            attrs: { type: 'button', 'aria-label': label, title: label },
            style: { width: '30px', height: '30px', color: danger ? 'var(--nope)' : '' }
          });
          btn.innerHTML = icon(iconName, { size: 14 });
          btn.addEventListener('click', onClick);
          return btn;
        };
        actions.append(
          actionBtn('user', 'Открыть профиль', () => window.open(`/u/${user.username}`, '_blank', 'noopener'))
        );
        const isProtected = user.role === 'owner' || (me.role !== 'owner' && user.role === 'admin');
        if (!isProtected) {
          actions.append(
            actionBtn(user.is_verified ? 'x' : 'verified', user.is_verified ? 'Снять верификацию' : 'Верифицировать', async () => {
              try {
                await api.put(`/admin/users/${user.id}/verify`, { verified: !user.is_verified });
                toast('Статус верификации обновлён', 'success');
                reload();
              } catch (err) {
                toast(err.message || 'Ошибка', 'error');
              }
            })
          );
          actions.append(
            actionBtn(user.is_banned ? 'check' : 'block', user.is_banned ? 'Разбанить' : 'Забанить', async () => {
              if (user.is_banned) {
                try {
                  await api.put(`/admin/users/${user.id}/unban`);
                  toast('Пользователь разбанен', 'success');
                  reload();
                } catch (err) {
                  toast(err.message || 'Ошибка', 'error');
                }
                return;
              }
              openBanModal(user, reload);
            }, !user.is_banned)
          );
          actions.append(
            actionBtn('lock', 'Сбросить пароль', () => openResetPassword(user), false)
          );
          if (isOwner() && !user.is_demo) {
            actions.append(
              actionBtn('shield', user.role === 'admin' ? 'Снять админа' : 'Сделать админом', async () => {
                const ok = await confirmDialog({
                  title: user.role === 'admin' ? 'Снять права админа?' : 'Выдать права админа?',
                  message: `${user.display_name} ${user.role === 'admin' ? 'потеряет' : 'получит'} доступ к админ-панели.`,
                  confirmText: 'Подтвердить'
                });
                if (!ok) return;
                try {
                  await api.put(`/admin/users/${user.id}/role`, { role: user.role === 'admin' ? 'user' : 'admin' });
                  toast('Роль обновлена', 'success');
                  reload();
                } catch (err) {
                  toast(err.message || 'Ошибка', 'error');
                }
              })
            );
          }
          actions.append(
            actionBtn('trash', 'Удалить аккаунт', async () => {
              const ok = await confirmDialog({
                title: 'Удалить аккаунт?',
                message: `Аккаунт ${user.display_name} (@${user.username}) и весь его контент будут удалены безвозвратно.`,
                confirmText: 'Удалить',
                danger: true
              });
              if (!ok) return;
              try {
                await api.delete(`/admin/users/${user.id}`);
                toast('Аккаунт удалён', 'success');
                reload();
              } catch (err) {
                toast(err.message || 'Ошибка', 'error');
              }
            }, true)
          );
        }
        actionsCell.append(actions);
        row.append(actionsCell);
        tbody.append(row);
      }
      table.append(tbody);
      tableWrap.append(table);
      if (!data.users.length) {
        tableWrap.innerHTML = '';
        tableWrap.append(emptyState('🔍', 'Никого не нашли', 'Измените фильтры поиска.'));
      }

      pager.innerHTML = '';
      pager.append(el('span', { text: `Всего: ${data.total} · показано ${Math.min(state.offset + data.users.length, data.total)}` }));
      const prev = button('Назад', {
        variant: 'btn-secondary',
        class: 'btn-sm',
        onClick: () => {
          state.offset = Math.max(0, state.offset - state.limit);
          reload();
        }
      });
      prev.disabled = state.offset === 0;
      const next = button('Вперёд', {
        variant: 'btn-secondary',
        class: 'btn-sm',
        onClick: () => {
          state.offset += state.limit;
          reload();
        }
      });
      next.disabled = state.offset + state.limit >= data.total;
      pager.append(prev, next);
    };

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.q = searchInput.value.trim();
        state.offset = 0;
        reload();
      }, 300);
    });
    roleSelect.addEventListener('change', () => {
      state.role = roleSelect.value;
      state.offset = 0;
      reload();
    });
    statusSelect.addEventListener('change', () => {
      state.banned = statusSelect.value;
      state.offset = 0;
      reload();
    });
    demoSelect.addEventListener('change', () => {
      state.demo = demoSelect.value;
      state.offset = 0;
      reload();
    });
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      state.offset = 0;
      reload();
    });

    reload();
    return wrap;
  }

  function openBanModal(user, onDone) {
    const body = el('div', { class: 'col' });
    body.append(el('p', { class: 'confirm-text', text: `Заблокировать ${user.display_name} (@${user.username})?` }));
    const reasonField = el('label', { class: 'field' });
    reasonField.append(el('span', { class: 'field__label', text: 'Причина блокировки' }));
    const reasonInput = el('input', {
      class: 'input',
      attrs: { placeholder: 'Например: оскорбления в чате', maxlength: '300' }
    });
    reasonField.append(reasonInput);
    const daysField = el('label', { class: 'field' });
    daysField.append(el('span', { class: 'field__label', text: 'Срок, дней (0 — навсегда)' }));
    const daysInput = el('input', { class: 'input', attrs: { type: 'number', min: '0', max: '3650', value: '0' } });
    daysField.append(daysInput);
    body.append(reasonField, daysField);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Блокировка пользователя', body, footer });
    footer.append(
      button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
      button('Забанить', {
        variant: 'btn-danger',
        onClick: async () => {
          try {
            await api.put(`/admin/users/${user.id}/ban`, {
              reason: reasonInput.value.trim() || 'Нарушение правил сообщества',
              days: Number(daysInput.value) || 0
            });
            toast('Пользователь заблокирован', 'success');
            modal.close();
            if (onDone) onDone();
          } catch (err) {
            toast(err.message || 'Не удалось забанить', 'error');
          }
        }
      })
    );
  }

  function openResetPassword(user) {
    const body = el('div', { class: 'col' });
    body.append(el('p', { class: 'confirm-text', text: `Новый пароль для ${user.display_name} (@${user.username}).` }));
    const pass = passwordField('Новый пароль', { autocomplete: 'new-password', hint: 'Минимум 8 символов' });
    body.append(pass.field);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Сброс пароля', body, footer });
    footer.append(
      button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
      button('Сбросить', {
        variant: 'btn-primary',
        onClick: async () => {
          try {
            await api.post(`/admin/users/${user.id}/reset-password`, { password: pass.input.value });
            toast('Пароль изменён', 'success');
            modal.close();
          } catch (err) {
            toast(err.message || 'Не удалось сбросить пароль', 'error');
          }
        }
      })
    );
  }

  /* ---------- Content ---------- */
  async function renderContent() {
    const wrap = el('div', { class: 'col', style: { gap: '16px' } });
    const postsPanel = el('div', { class: 'admin-panel' });
    postsPanel.append(el('div', { class: 'chart-card__title', text: 'Посты' }));
    wrap.append(postsPanel);
    const storiesPanel = el('div', { class: 'admin-panel' });
    storiesPanel.append(el('div', { class: 'chart-card__title', text: 'Активные истории' }));
    wrap.append(storiesPanel);

    const loadPosts = async () => {
      const gridHost = el('div');
      postsPanel.querySelectorAll('.content-grid').forEach((node) => node.remove());
      postsPanel.append(gridHost);
      gridHost.classList.add('content-grid');
      gridHost.append(loadingRow('Загружаем посты…'));
      try {
        const data = await api.get('/admin/posts?limit=24');
        gridHost.innerHTML = '';
        if (!data.posts.length) {
          gridHost.append(el('div', { class: 'field__hint', text: 'Постов нет' }));
        }
        const grid = el('div', { class: 'posts-grid' });
        for (const post of data.posts) {
          const tile = el('div', { class: 'post-tile' });
          tile.append(el('img', { attrs: { src: post.image_path, alt: '', loading: 'lazy' } }));
          const overlay = el('div', { class: 'post-tile__overlay', style: { flexDirection: 'column', gap: '6px' } });
          overlay.append(el('span', { text: post.author.display_name }));
          overlay.append(el('span', { class: 'field__hint', text: `${formatNumber(post.likes)} лайков · ${formatNumber(post.views_count)} просмотров` }));
          const del = el('button', { class: 'btn btn-danger btn-sm', text: 'Удалить', attrs: { type: 'button' } });
          del.addEventListener('click', async (event) => {
            event.stopPropagation();
            const ok = await confirmDialog({
              title: 'Удалить пост?',
              message: 'Пост, лайки и комментарии будут удалены.',
              confirmText: 'Удалить',
              danger: true
            });
            if (!ok) return;
            try {
              await api.delete(`/admin/posts/${post.id}`);
              toast('Пост удалён', 'success');
              loadPosts();
            } catch (err) {
              toast(err.message || 'Ошибка', 'error');
            }
          });
          overlay.append(del);
          tile.append(overlay);
          grid.append(tile);
        }
        gridHost.append(grid);
      } catch (err) {
        gridHost.innerHTML = '';
        gridHost.append(emptyState('😕', 'Не удалось загрузить посты', err.message || ''));
      }
    };

    const loadStories = async () => {
      const host = el('div');
      storiesPanel.querySelectorAll('.content-grid').forEach((node) => node.remove());
      storiesPanel.append(host);
      host.classList.add('content-grid');
      host.append(loadingRow('Загружаем истории…'));
      try {
        const data = await api.get('/admin/stories?limit=24');
        host.innerHTML = '';
        if (!data.stories.length) {
          host.append(el('div', { class: 'field__hint', text: 'Активных историй нет' }));
          return;
        }
        const grid = el('div', { class: 'likes-grid' });
        for (const story of data.stories) {
          const card = el('div', { class: 'like-card' });
          const media = el('div', { class: 'like-card__media' });
          media.append(el('img', { attrs: { src: story.media_path, alt: '', loading: 'lazy' } }));
          card.append(media);
          const actions = el('div', { class: 'like-card__actions' });
          const del = el('button', { class: 'like-action--nope', text: 'Удалить', attrs: { type: 'button' } });
          del.addEventListener('click', async () => {
            const ok = await confirmDialog({
              title: 'Удалить историю?',
              message: 'История исчезнет у всех.',
              confirmText: 'Удалить',
              danger: true
            });
            if (!ok) return;
            try {
              await api.delete(`/stories/${story.id}`);
              toast('История удалена', 'success');
              loadStories();
            } catch (err) {
              toast(err.message || 'Ошибка', 'error');
            }
          });
          actions.append(del);
          card.append(actions);
          const body = el('div', { class: 'like-card__meta', text: `${story.display_name} · ${story.views} просмотров`, style: { padding: '8px' } });
          card.append(body);
          grid.append(card);
        }
        host.append(grid);
      } catch (err) {
        host.innerHTML = '';
        host.append(emptyState('😕', 'Не удалось загрузить истории', err.message || ''));
      }
    };

    loadPosts();
    loadStories();
    return wrap;
  }

  /* ---------- Reports ---------- */
  async function renderReports() {
    const wrap = el('div', { class: 'admin-panel' });
    let status = 'new';
    const toolbar = el('div', { class: 'admin-toolbar' });
    [['new', 'Новые'], ['reviewed', 'Рассмотренные'], ['dismissed', 'Отклонённые'], ['all', 'Все']].forEach(([value, label]) => {
      const btn = el('button', {
        class: `chip ${status === value ? 'is-active' : ''}`,
        text: label,
        attrs: { type: 'button' }
      });
      btn.addEventListener('click', () => {
        status = value;
        toolbar.querySelectorAll('.chip').forEach((node) => node.classList.remove('is-active'));
        btn.classList.add('is-active');
        load();
      });
      toolbar.append(btn);
    });
    wrap.append(toolbar);
    const host = el('div');
    wrap.append(host);

    async function load() {
      host.innerHTML = '';
      host.append(loadingRow('Загружаем жалобы…'));
      try {
        const data = await api.get(`/admin/reports?status=${status}`);
        host.innerHTML = '';
        if (!data.reports.length) {
          host.append(emptyState('✅', 'Жалоб нет', 'Очередь пуста — отличная работа!'));
          return;
        }
        for (const report of data.reports) {
          const row = el('div', { class: 'report-row' });
          const body = el('div', { class: 'report-row__body' });
          const title = el('div', { class: 'report-row__title' });
          title.append(el('span', { text: `Жалоба на ${report.reported.display_name} ` }));
          title.append(el('span', { class: 'admin-chip', text: report.reason }));
          body.append(title);
          body.append(
            el('div', {
              class: 'report-row__meta',
              text: `От: ${report.reporter.display_name} (@${report.reporter.username}) · ${timeAgo(report.created_at)}`
            })
          );
          if (report.details) body.append(el('div', { class: 'report-row__meta', text: `«${report.details}»` }));
          if (report.reason === 'underage') {
            body.append(el('div', { class: 'report-row__meta', text: '⚠️ Проверьте профиль на 18+', style: { color: 'var(--nope)' } }));
          }
          const actions = el('div', { class: 'row' });
          actions.append(
            button('Открыть профиль', {
              variant: 'btn-ghost',
              class: 'btn-sm',
              onClick: () => window.open(`/u/${report.reported.username}`, '_blank', 'noopener')
            })
          );
          actions.append(
            button('Скрыть контент', {
              variant: 'btn-secondary',
              class: 'btn-sm',
              onClick: () => handle(report, 'hide_content')
            })
          );
          actions.append(
            button('Забанить', { variant: 'btn-danger', class: 'btn-sm', onClick: () => handle(report, 'ban') })
          );
          actions.append(
            button('Отклонить', { variant: 'btn-ghost', class: 'btn-sm', onClick: () => handle(report, 'dismiss') })
          );
          row.append(body, actions);
          if (report.post_image) {
            const img = el('img', { class: 'report-row__post', attrs: { src: report.post_image, alt: 'Пост' } });
            row.prepend(img);
          }
          host.append(row);
        }
      } catch (err) {
        host.innerHTML = '';
        host.append(emptyState('😕', 'Не удалось загрузить жалобы', err.message || ''));
      }
    }

    async function handle(report, action) {
      try {
        await api.put(`/admin/reports/${report.id}`, { action });
        toast('Решение применено', 'success');
        load();
      } catch (err) {
        toast(err.message || 'Ошибка', 'error');
      }
    }

    load();
    return wrap;
  }

  /* ---------- Site settings ---------- */
  async function renderSettings() {
    const data = await api.get('/admin/settings');
    const settings = data.settings;
    const wrap = el('div', { class: 'admin-panel' });
    wrap.append(el('div', { class: 'chart-card__title', text: 'Настройки сайта' }));

    const nameField = el('label', { class: 'field' });
    nameField.append(el('span', { class: 'field__label', text: 'Название сайта' }));
    const nameInput = el('input', { class: 'input', attrs: { maxlength: '40' } });
    nameInput.value = settings.site_name || 'Wiutgram';
    nameField.append(nameInput);
    wrap.append(nameField);

    const welcomeField = el('label', { class: 'field' });
    welcomeField.append(el('span', { class: 'field__label', text: 'Приветственное сообщение' }));
    const welcomeInput = el('textarea', { class: 'textarea', attrs: { maxlength: '300', rows: '3' } });
    welcomeInput.value = settings.welcome_message || '';
    welcomeField.append(welcomeInput);
    wrap.append(welcomeField);

    const ageField = el('label', { class: 'field' });
    ageField.append(el('span', { class: 'field__label', text: 'Минимальный возраст' }));
    const ageInput = el('input', { class: 'input', attrs: { type: 'number', min: '18', max: '99' } });
    ageInput.value = settings.min_age || '18';
    ageField.append(ageInput);
    wrap.append(ageField);

    const switches = el('div');
    const makeSwitch = (label, desc, key) => {
      const row = el('label', { class: 'switch' });
      const text = el('div', { class: 'switch__text' });
      text.append(el('div', { class: 'switch__title', text: label }));
      text.append(el('div', { class: 'switch__desc', text: desc }));
      const input = el('input', { attrs: { type: 'checkbox' } });
      input.checked = settings[key] === '1';
      input.dataset.key = key;
      row.append(text, input);
      return row;
    };
    switches.append(
      makeSwitch('Регистрация открыта', 'Новые пользователи могут создавать аккаунты', 'registration_open')
    );
    switches.append(
      makeSwitch('Режим обслуживания', 'Доступ останется только у владельца и админов', 'maintenance_mode')
    );
    wrap.append(switches);

    const footer = el('div', { class: 'row' });
    footer.append(
      button('Сохранить настройки', {
        variant: 'btn-primary',
        onClick: async () => {
          const payload = {
            site_name: nameInput.value.trim(),
            welcome_message: welcomeInput.value.trim(),
            min_age: Number(ageInput.value) || 18,
            registration_open: switches.querySelector('[data-key="registration_open"]').checked,
            maintenance_mode: switches.querySelector('[data-key="maintenance_mode"]').checked
          };
          try {
            const updated = await api.put('/admin/settings', payload);
            getState().site.site_name = updated.settings.site_name;
            getState().site.registration_open = updated.settings.registration_open === '1';
            getState().site.maintenance_mode = updated.settings.maintenance_mode === '1';
            document.title = `${updated.settings.site_name} — Админ-панель`;
            toast('Настройки сохранены', 'success');
          } catch (err) {
            toast(err.message || 'Не удалось сохранить настройки', 'error');
          }
        }
      })
    );
    wrap.append(footer);
    return wrap;
  }

  /* ---------- Demo data ---------- */
  async function renderDemo() {
    const wrap = el('div', { class: 'admin-panel' });
    wrap.append(el('div', { class: 'chart-card__title', text: 'Демо-данные' }));
    wrap.append(
      el('p', {
        class: 'field__hint',
        text: 'Демо-профили помечены бейджем DEMO, не считаются реальными пользователями и не влияют на назначение владельца. Они сразу лайкают первого реального пользователя, чтобы вкладка «Лайки» и матчи ожили.'
      })
    );
    const row = el('div', { class: 'row' });
    const seedBtn = button('Создать демо-профили (30)', {
      variant: 'btn-primary',
      icon: 'sparkles',
      onClick: async () => {
        seedBtn.disabled = true;
        seedBtn.textContent = 'Создаём профили…';
        try {
          const stats = await api.post('/admin/seed-demo', { count: 30 });
          toast(`Создано демо-профилей: ${stats.created}`, 'success', 5000);
        } catch (err) {
          toast(err.message || 'Не удалось создать демо-данные', 'error', 5000);
        } finally {
          seedBtn.disabled = false;
          seedBtn.textContent = 'Создать демо-профили (30)';
        }
      }
    });
    const removeBtn = button('Удалить все демо-профили', {
      variant: 'btn-danger',
      icon: 'trash',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Удалить демо-профили?',
          message: 'Все демо-аккаунты, их посты, истории и сообщения будут удалены.',
          confirmText: 'Удалить',
          danger: true
        });
        if (!ok) return;
        try {
          const stats = await api.delete('/admin/demo');
          toast(`Удалено профилей: ${stats.removed}`, 'success');
        } catch (err) {
          toast(err.message || 'Не удалось удалить демо-данные', 'error');
        }
      }
    });
    row.append(seedBtn, removeBtn);
    wrap.append(row);
    return wrap;
  }

  /* ---------- Action log ---------- */
  async function renderLog() {
    const wrap = el('div', { class: 'admin-panel' });
    wrap.append(el('div', { class: 'chart-card__title', text: 'Журнал действий' }));
    const data = await api.get('/admin/log?limit=100');
    const list = el('div', { class: 'admin-log' });
    for (const row of data.log) {
      const line = el('div', { class: 'admin-log__row' });
      line.append(el('span', { class: 'admin-log__time', text: new Date(row.created_at).toLocaleString('ru-RU') }));
      line.append(
        el('span', {
          text: `${row.display_name || row.username || 'system'} · ${row.action}${row.target ? ` · ${row.target}` : ''}${
            row.meta ? ` · ${row.meta}` : ''
          }`
        })
      );
      list.append(line);
    }
    if (!data.log.length) list.append(el('div', { class: 'field__hint', text: 'Журнал пуст' }));
    wrap.append(list);
    wrap.append(el('div', { class: 'field__hint', text: `Всего записей: ${data.total}` }));
    return wrap;
  }

  /* ---------- Ownership transfer ---------- */
  async function renderTransfer() {
    if (!isOwner()) {
      return emptyState('🔒', 'Только для владельца', 'Передача владения доступна только текущему владельцу.');
    }
    const wrap = el('div', { class: 'admin-panel' });
    wrap.append(el('div', { class: 'chart-card__title', text: 'Передача владения сайтом' }));
    wrap.append(
      el('p', {
        class: 'field__hint',
        text: 'Выберите пользователя и подтвердите паролем. Новый владелец получит полный доступ, а ваш аккаунт станет администратором. Владелец не может быть забанен или удалён.'
      })
    );
    const usernameField = el('label', { class: 'field' });
    usernameField.append(el('span', { class: 'field__label', text: 'Username нового владельца' }));
    const usernameInput = el('input', { class: 'input', attrs: { placeholder: 'например, bekzod', maxlength: '20' } });
    usernameField.append(usernameInput);
    const pass = passwordField('Ваш пароль', { autocomplete: 'current-password' });
    const card = el('div', { class: 'col' });
    card.append(usernameField, pass.field);
    wrap.append(card);
    wrap.append(
      button('Передать владение', {
        variant: 'btn-danger',
        onClick: async () => {
          const username = usernameInput.value.trim().replace(/^@/, '');
          if (!username) {
            toast('Укажите username', 'error');
            return;
          }
          const ok = await confirmDialog({
            title: 'Передать владение?',
            message: `Пользователь @${username} станет владельцем сайта. Это действие нельзя отменить без его согласия.`,
            confirmText: 'Передать',
            danger: true
          });
          if (!ok) return;
          try {
            const found = await api.get(`/users/${encodeURIComponent(username)}`).catch(() => null);
            if (!found) {
              toast('Пользователь не найден', 'error');
              return;
            }
            await api.post('/admin/transfer-owner', {
              user_id: found.user.id,
              password: pass.input.value
            });
            patchUser({ role: 'admin' });
            toast('Владение передано. Ваш аккаунт теперь администратор.', 'success', 6000);
            navigate('/admin');
          } catch (err) {
            toast(err.message || 'Не удалось передать владение', 'error');
          }
        }
      })
    );
    return wrap;
  }

  select('dashboard');
  return root;
}
