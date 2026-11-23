import { api } from '../../api.js?v=31';
import { el, button, toast, openModal, avatarNode, loadingRow, formatNumber } from '../../ui.js?v=31';
import { sectionHead, emptyState, fmtDateTime, chip, confirmDialog, reportReason } from './shared.js?v=31';

const REPORT_STATUS = {
  new: 'Новая',
  in_progress: 'В работе',
  closed: 'Закрытая'
};

const REPORT_ACTIONS = [
  ['dismiss', 'Отклонить жалобу'],
  ['hide_post', 'Скрыть пост'],
  ['warn', 'Предупредить пользователя'],
  ['ban', 'Забанить пользователя']
];

export default async function moderationSection({ active }) {
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  let tab = active === 'announcements' ? 'announcements' : 'content';
  let contentTab = 'posts';
  let reportStatus = 'new';
  let universities = [];
  try {
    universities = (await api.get('/admin/universities')).universities || [];
  } catch (err) {
    universities = [];
  }

  root.append(sectionHead('Контент и жалобы', 'Посты, истории, комментарии и обращения пользователей'));
  const tabs = el('div', { class: 'admin-tabs' });
  const tabsMap = new Map();
  for (const [id, label] of [['content', 'Контент'], ['reports', 'Жалобы'], ['announcements', 'Объявления']]) {
    const buttonEl = el('button', { class: `admin-tabs__item ${tab === id ? 'is-active' : ''}`, text: label, attrs: { type: 'button' } });
    buttonEl.addEventListener('click', () => {
      tab = id;
      tabsMap.forEach((node, key) => node.classList.toggle('is-active', key === id));
      render();
    });
    tabsMap.set(id, buttonEl);
    tabs.append(buttonEl);
  }
  root.append(tabs);
  const body = el('div');
  root.append(body);

  function render() {
    body.innerHTML = '';
    if (tab === 'content') body.append(renderContent());
    if (tab === 'reports') body.append(renderReports());
    if (tab === 'announcements') body.append(renderAnnouncements());
  }

  function renderContent() {
    const wrap = el('div', { class: 'col', style: { gap: '12px' } });
    const subTabs = el('div', { class: 'segmented' });
    const subMap = new Map();
    for (const [id, label] of [['posts', 'Посты'], ['stories', 'Истории'], ['comments', 'Комментарии']]) {
      const item = el('button', { class: `segmented__item ${contentTab === id ? 'is-active' : ''}`, text: label, attrs: { type: 'button' } });
      item.addEventListener('click', () => {
        contentTab = id;
        subMap.forEach((node, key) => node.classList.toggle('is-active', key === id));
        render();
      });
      subMap.set(id, item);
      subTabs.append(item);
    }
    wrap.append(subTabs);

    const toolbar = el('div', { class: 'admin-toolbar admin-toolbar--compact' });
    const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Поиск по автору или тексту' } });
    const uniSelect = el('select', { class: 'select' });
    uniSelect.append(el('option', { text: 'Все университеты', attrs: { value: '' } }));
    universities.forEach((university) =>
      uniSelect.append(el('option', { text: university.short_name, attrs: { value: String(university.id) } }))
    );
    toolbar.append(search);
    if (contentTab !== 'comments') toolbar.append(uniSelect);
    wrap.append(toolbar);

    const list = el('div', { class: 'col', style: { gap: '8px' } });
    const pagerRow = el('div', { class: 'admin-pager' });
    wrap.append(list, pagerRow);
    let offset = 0;
    let total = 0;
    let busy = false;

    async function load(more = false) {
      if (busy) return;
      busy = true;
      if (!more) {
        offset = 0;
        total = 0;
        list.innerHTML = '';
      }
      const loader = loadingRow('Загружаем…');
      list.append(loader);
      const query = new URLSearchParams({ limit: '24', offset: String(offset) });
      if (search.value.trim()) query.set('q', search.value.trim());
      if (uniSelect.value) query.set('university_id', uniSelect.value);
      try {
        const data = await api.get(`/admin/content/${contentTab}?${query.toString()}`);
        loader.remove();
        const items = contentTab === 'posts' ? data.posts : contentTab === 'stories' ? data.stories : data.comments;
        total = Number(data.total) || (items ? items.length : 0);
        if (!items || !items.length) {
          if (!more) list.append(emptyState('Ничего не найдено'));
          pagerRow.innerHTML = '';
          return;
        }
        for (const item of items) list.append(contentRow(item));
        offset += items.length;
        pagerRow.innerHTML = '';
        pagerRow.append(el('span', { class: 'field__hint', text: `Показано ${Math.min(offset, total)} из ${total}` }));
        if (offset < total) {
          pagerRow.append(
            button('Показать ещё', {
              variant: 'btn-secondary btn-sm',
              onClick: () => load(true)
            })
          );
        }
      } catch (err) {
        loader.remove();
        if (!more) list.append(emptyState(err.message || 'Не удалось загрузить контент'));
      } finally {
        busy = false;
      }
    }

    function contentRow(item) {
      const author = item.author || {};
      const username = author.username || item.username || '';
      const name = author.display_name || item.display_name || item.author_name || username || 'Автор';
      const row = el('div', { class: 'admin-content-row' });
      const preview = el('div', { class: 'admin-content-row__preview' });
      if (contentTab === 'posts' && item.kind === 'video') {
        preview.append(
          el('video', {
            class: 'admin-content-row__video',
            attrs: { src: item.image_path, muted: 'muted', playsinline: 'playsinline', preload: 'metadata' }
          })
        );
      } else if (contentTab === 'posts' || contentTab === 'stories') {
        preview.append(el('img', { attrs: { src: item.image_path || item.media_path, alt: '', loading: 'lazy' } }));
      } else {
        preview.append(el('span', { class: 'admin-content-row__letter', text: '#' }));
      }
      row.append(preview);

      const text = el('div', { class: 'admin-content-row__text' });
      const authorRow = el('div', { class: 'admin-content-row__author' });
      authorRow.append(
        avatarNode({ display_name: name, username, avatar_path: author.avatar_path || item.avatar_path }, 'xs')
      );
      const authorName = el('span', { class: 'admin-content-row__name', text: name });
      authorRow.append(authorName);
      if (username) authorRow.append(el('span', { class: 'field__hint', text: `@${username}` }));
      if (item.author_university || item.university_short_name) {
        authorRow.append(el('span', { class: 'admin-chip', text: item.author_university || item.university_short_name }));
      }
      if (contentTab === 'posts' && item.kind === 'video') authorRow.append(el('span', { class: 'admin-chip', text: 'Видео' }));
      if (contentTab === 'posts' && item.is_hidden) authorRow.append(chip('Скрыт', 'banned'));
      text.append(authorRow);

      const caption = contentTab === 'comments' ? item.body : item.caption;
      if (caption) text.append(el('p', { class: 'admin-content-row__caption', text: String(caption).slice(0, 180) }));
      const stats = [];
      if (contentTab === 'posts') {
        stats.push(`${formatNumber(item.likes)} лайков`);
        stats.push(`${formatNumber(item.comments)} комментариев`);
        stats.push(`${formatNumber(item.views_count)} просмотров`);
      }
      if (contentTab === 'stories') stats.push(`${formatNumber(item.views)} просмотров`);
      if (contentTab === 'comments' && item.post_id) stats.push(`Пост #${item.post_id}`);
      stats.push(fmtDateTime(item.created_at));
      text.append(el('span', { class: 'field__hint', text: stats.join(' · ') }));
      row.append(text);

      const actions = el('div', { class: 'admin-inline' });
      if (username) {
        actions.append(
          button('Профиль', {
            variant: 'btn-ghost btn-sm',
            onClick: () => window.open(`/u/${encodeURIComponent(username)}`, '_blank', 'noopener')
          })
        );
      }
      actions.append(
        button('Удалить', {
          variant: 'btn-danger btn-sm',
          onClick: async () => {
            confirmDialog({
              title: 'Удалить запись?',
              text: 'Запись будет удалена безвозвратно вместе с вложениями.',
              confirmLabel: 'Удалить',
              danger: true,
              onConfirm: async () => {
                await api.delete(`/admin/content/${contentTab}/${item.id}`);
                toast('Удалено', 'success');
                await load(false);
              }
            });
          }
        })
      );
      row.append(actions);
      return row;
    }

    const submitSearch = () => load(false);
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitSearch();
    });
    search.addEventListener('input', () => {
      clearTimeout(search._timer);
      search._timer = setTimeout(submitSearch, 420);
    });
    uniSelect.addEventListener('change', submitSearch);
    requestAnimationFrame(() => load(false));
    return wrap;
  }

  function renderReports() {
    const wrap = el('div', { class: 'col', style: { gap: '12px' } });
    const statuses = el('div', { class: 'segmented' });
    const map = new Map();
    for (const [value, label] of [['new', 'Новые'], ['closed', 'Закрытые'], ['in_progress', 'В работе']]) {
      const item = el('button', {
        class: `segmented__item ${reportStatus === value ? 'is-active' : ''}`,
        text: label,
        attrs: { type: 'button' }
      });
      item.addEventListener('click', () => {
        reportStatus = value;
        map.forEach((node, key) => node.classList.toggle('is-active', key === value));
        load();
      });
      map.set(value, item);
      statuses.append(item);
    }
    wrap.append(statuses);
    const list = el('div', { class: 'col', style: { gap: '10px' } });
    wrap.append(list);

    async function load() {
      list.innerHTML = '';
      list.append(el('div', { class: 'skeleton', style: { height: '100px' } }));
      try {
        const data = await api.get(`/admin/reports?status=${reportStatus}`);
        list.innerHTML = '';
        if (!data.reports || !data.reports.length) {
          list.append(emptyState('Жалоб в этом статусе нет'));
          return;
        }
        for (const report of data.reports) {
          const card = el('div', { class: 'admin-panel admin-report-card' });
          const head = el('div', { class: 'admin-report-card__head' });
          head.append(el('strong', { text: `#${report.id} · ${reportReason(report.reason)}` }));
          head.append(
            chip(
              REPORT_STATUS[report.status] || report.status,
              report.status === 'new' ? 'banned' : 'verified'
            )
          );
          card.append(head);
          card.append(
            el('p', {
              class: 'field__hint',
              text: `На @${report.reported_username} от @${report.reporter_username} · ${fmtDateTime(report.created_at)}`
            })
          );
          if (report.details) card.append(el('p', { class: 'admin-report-card__details', text: report.details }));
          const profileRow = el('div', { class: 'row' });
          profileRow.append(
            button('Профиль нарушителя', {
              variant: 'btn-ghost btn-sm',
              onClick: () => window.open(`/u/${encodeURIComponent(report.reported_username)}`, '_blank', 'noopener')
            }),
            button('Профиль автора жалобы', {
              variant: 'btn-ghost btn-sm',
              onClick: () => window.open(`/u/${encodeURIComponent(report.reporter_username)}`, '_blank', 'noopener')
            })
          );
          card.append(profileRow);
          if (report.status === 'new') card.append(resolveForm(report, load));
          list.append(card);
        }
      } catch (err) {
        list.innerHTML = '';
        list.append(emptyState(err.message || 'Не удалось загрузить жалобы'));
      }
    }

    load();
    return wrap;
  }

  function resolveForm(report, reload) {
    const form = el('div', { class: 'admin-report-form' });
    const action = el('select', { class: 'select' });
    for (const [value, label] of REPORT_ACTIONS) {
      if (value === 'hide_post' && !report.post_id) continue;
      action.append(el('option', { text: label, attrs: { value } }));
    }
    const note = el('input', { class: 'input', attrs: { placeholder: 'Заметка к решению', maxlength: '300' } });
    const daysField = el('label', { class: 'field admin-report-form__days hidden' });
    daysField.append(el('span', { class: 'field__label', text: 'Срок блокировки' }));
    const days = el('select', { class: 'select' });
    [['0', 'Навсегда'], ['1', '1 день'], ['7', '7 дней'], ['30', '30 дней']].forEach(([value, label]) =>
      days.append(el('option', { text: label, attrs: { value } }))
    );
    daysField.append(days);
    action.addEventListener('change', () => {
      daysField.classList.toggle('hidden', action.value !== 'ban');
    });
    const row = el('div', { class: 'admin-report-form__row' });
    row.append(action, note, daysField);
    row.append(
      button('Применить', {
        variant: 'btn-primary btn-sm',
        onClick: async (event) => {
          const submit = async () => {
            await api.post(`/admin/reports/${report.id}/resolve`, {
              action: action.value,
              note: note.value,
              ban_days: action.value === 'ban' ? Number(days.value) : 0
            });
            reload();
          };
          if (action.value === 'ban' || action.value === 'hide_post') {
            confirmDialog({
              title: action.value === 'ban' ? 'Забанить пользователя?' : 'Скрыть пост?',
              text:
                action.value === 'ban'
                  ? `@${report.reported_username} потеряет доступ к сайту.`
                  : 'Пост исчезнет из лент, профиля и поиска. Его можно вернуть только из базы.',
              confirmLabel: 'Применить',
              danger: true,
              onConfirm: submit
            });
            return;
          }
          event.target.disabled = true;
          try {
            await submit();
            toast('Решение сохранено', 'success');
          } catch (err) {
            toast(err.message || 'Ошибка', 'error');
            event.target.disabled = false;
          }
        }
      })
    );
    form.append(row);
    return form;
  }

  function renderAnnouncements() {
    const wrap = el('div', { class: 'col', style: { gap: '16px' } });
    const form = el('div', { class: 'admin-panel' });
    form.append(el('h3', { class: 'admin-panel__title', text: 'Новое объявление' }));
    const title = el('input', { class: 'input', attrs: { placeholder: 'Заголовок', maxlength: '120' } });
    const text = el('textarea', { class: 'textarea', attrs: { rows: '4', placeholder: 'Текст уведомления', maxlength: '2000' } });
    const target = el('select', { class: 'select' });
    target.append(el('option', { text: 'Все пользователи', attrs: { value: '' } }));
    universities.forEach((university) =>
      target.append(el('option', { text: `Только ${university.short_name}`, attrs: { value: String(university.id) } }))
    );
    const send = button('Отправить', {
      variant: 'btn-primary',
      onClick: async () => {
        if (title.value.trim().length < 2 || text.value.trim().length < 2) {
          return toast('Заполните заголовок и текст', 'error');
        }
        const ok = await confirmDialog({
          title: 'Отправить объявление?',
          text: 'Уведомление получат выбранные пользователи.',
          confirmLabel: 'Отправить',
          onConfirm: async () => {
            const result = await api.post('/admin/announcements', {
              title: title.value.trim(),
              body: text.value.trim(),
              target_university_id: target.value ? Number(target.value) : null
            });
            toast(`Отправлено: ${result.recipients} получателей`, 'success');
            title.value = '';
            text.value = '';
            loadHistory();
          }
        });
        void ok;
      }
    });
    form.append(title, text, target, send);
    wrap.append(form);

    const history = el('div', { class: 'admin-panel' });
    history.append(el('h3', { class: 'admin-panel__title', text: 'История объявлений' }));
    wrap.append(history);

    async function loadHistory() {
      history.querySelectorAll('.admin-kv-row').forEach((node) => node.remove());
      const data = await api.get('/admin/announcements');
      if (!data.announcements.length) return history.append(emptyState('Объявлений пока не было'));
      for (const item of data.announcements) {
        const row = el('div', { class: 'admin-kv-row' });
        row.append(el('span', { text: `${item.title} · ${item.recipients || 0} получателей` }));
        row.append(
          el('span', {
            class: 'field__hint',
            text: `${fmtDateTime(item.created_at)}${item.university_short_name ? ` · ${item.university_short_name}` : ''}`
          })
        );
        history.append(row);
      }
    }
    loadHistory();
    return wrap;
  }

  render();
  return root;
}
