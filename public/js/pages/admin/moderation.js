import { api } from '../../api.js?v=23';
import { el, button, toast, openModal } from '../../ui.js?v=23';
import { sectionHead, emptyState, fmtDateTime, chip } from './shared.js?v=23';

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

    const toolbar = el('div', { class: 'admin-toolbar' });
    const search = el('input', { class: 'input', attrs: { type: 'search', placeholder: 'Поиск по автору или тексту' } });
    const uniSelect = el('select', { class: 'select' });
    uniSelect.append(el('option', { text: 'Все университеты', attrs: { value: '' } }));
    universities.forEach((university) =>
      uniSelect.append(el('option', { text: university.short_name, attrs: { value: String(university.id) } }))
    );
    toolbar.append(search, uniSelect);
    wrap.append(toolbar);

    const list = el('div', { class: 'col', style: { gap: '8px' } });
    wrap.append(list);
    let offset = 0;

    async function load(reset = true) {
      if (reset) offset = 0;
      list.innerHTML = '';
      list.append(el('div', { class: 'skeleton', style: { height: '120px' } }));
      const query = new URLSearchParams({ limit: '24', offset: String(offset) });
      if (search.value.trim()) query.set('q', search.value.trim());
      if (uniSelect.value) query.set('university_id', uniSelect.value);
      try {
        const data = await api.get(`/admin/content/${contentTab}?${query.toString()}`);
        list.innerHTML = '';
        const items = contentTab === 'posts' ? data.posts : contentTab === 'stories' ? data.stories : data.comments;
        if (!items || !items.length) {
          list.append(emptyState('Ничего не найдено'));
          return;
        }
        for (const item of items) {
          const row = el('div', { class: 'admin-content-row' });
          const preview = el('div', { class: 'admin-content-row__preview' });
          if (contentTab === 'posts') {
            preview.append(el('img', { attrs: { src: item.image_path, alt: '', loading: 'lazy' } }));
          } else if (contentTab === 'stories') {
            preview.append(el('img', { attrs: { src: item.media_path, alt: '', loading: 'lazy' } }));
          } else {
            preview.append(el('span', { class: 'admin-content-row__letter', text: '#' }));
          }
          row.append(preview);
          const text = el('div', { class: 'admin-content-row__text' });
          const author = item.author_name || item.display_name || item.username || item.author_username || 'Автор';
          text.append(el('strong', { text: author }));
          const caption = item.caption || item.body || item.media_path || '';
          text.append(el('p', { class: 'field__hint', text: String(caption).slice(0, 180) }));
          text.append(
            el('span', {
              class: 'field__hint',
              text: `${fmtDateTime(item.created_at)}${item.author_university ? ` · ${item.author_university}` : ''}`
            })
          );
          row.append(text);
          const actions = el('div', { class: 'admin-inline' });
          actions.append(
            button('Удалить', {
              variant: 'btn-danger btn-sm',
              onClick: async () => {
                if (!window.confirm('Удалить безвозвратно?')) return;
                try {
                  await api.delete(`/admin/content/${contentTab}/${item.id}`);
                  toast('Удалено', 'success');
                  load(false);
                } catch (err) {
                  toast(err.message || 'Не удалось удалить', 'error');
                }
              }
            })
          );
          row.append(actions);
          list.append(row);
        }
        const footer = el('div', { class: 'row' });
        footer.append(
          button('Показать ещё', {
            variant: 'btn-secondary btn-sm',
            onClick: () => {
              offset += 24;
              load(false);
            }
          })
        );
        if (offset === 0) footer.firstChild.disabled = (data.total || 0) <= 24;
        list.append(footer);
      } catch (err) {
        list.innerHTML = '';
        list.append(emptyState(err.message || 'Не удалось загрузить контент'));
      }
    }

    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') load();
    });
    uniSelect.addEventListener('change', () => load());
    requestAnimationFrame(() => load());
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
          const card = el('div', { class: 'admin-panel' });
          const head = el('div', { class: 'row', style: { justifyContent: 'space-between' } });
          head.append(el('strong', { text: `#${report.id} · ${report.reason}` }));
          head.append(chip(report.status, report.status === 'new' ? 'banned' : 'demo'));
          card.append(head);
          card.append(
            el('p', {
              class: 'field__hint',
              text: `На @${report.reported_username} от @${report.reporter_username} · ${fmtDateTime(report.created_at)}`
            })
          );
          if (report.details) card.append(el('p', { text: report.details }));
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
    const form = el('div', { class: 'col', style: { gap: '8px', marginTop: '8px' } });
    const action = el('select', { class: 'select' });
    [
      ['dismiss', 'Отклонить жалобу'],
      ['hide_post', 'Скрыть пост'],
      ['warn', 'Предупредить пользователя'],
      ['ban', 'Забанить пользователя']
    ].forEach(([value, label]) => action.append(el('option', { text: label, attrs: { value } })));
    const note = el('input', { class: 'input', attrs: { placeholder: 'Заметка к решению', maxlength: '300' } });
    const days = el('select', { class: 'select' });
    [['0', 'Навсегда'], ['1', '1 день'], ['7', '7 дней'], ['30', '30 дней']].forEach(([value, label]) =>
      days.append(el('option', { text: label, attrs: { value } }))
    );
    const row = el('div', { class: 'row', style: { alignItems: 'flex-end' } });
    row.append(action, note, days);
    row.append(
      button('Применить', {
        variant: 'btn-primary btn-sm',
        onClick: async (event) => {
          event.target.disabled = true;
          try {
            await api.post(`/admin/reports/${report.id}/resolve`, {
              action: action.value,
              note: note.value,
              ban_days: action.value === 'ban' ? Number(days.value) : 0
            });
            toast('Решение сохранено', 'success');
            reload();
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
        if (!window.confirm('Отправить уведомление выбранной аудитории?')) return;
        send.disabled = true;
        try {
          const result = await api.post('/admin/announcements', {
            title: title.value.trim(),
            body: text.value.trim(),
            target_university_id: target.value ? Number(target.value) : null
          });
          toast(`Отправлено: ${result.recipients} получателей`, 'success');
          title.value = '';
          text.value = '';
          loadHistory();
        } catch (err) {
          toast(err.message || 'Не удалось отправить', 'error');
        } finally {
          send.disabled = false;
        }
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
