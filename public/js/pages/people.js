import { api } from '../api.js?v=25';
import { el, avatarNode, button, toast, loadingRow, emptyState } from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { navigate } from '../router.js?v=25';
import { glassSvg } from '../components/glass.js?v=25';

const COURSES = [
  ['', 'Любой курс'],
  ['1', '1 курс'],
  ['2', '2 курс'],
  ['3', '3 курс'],
  ['4', '4 курс'],
  ['master', 'Магистратура'],
  ['graduate', 'Выпускник']
];

export default function PeoplePage(ctx) {
  const root = el('div', { class: 'shop-page' });
  const head = el('div', { class: 'shop-head' });
  const text = el('div');
  text.append(el('h1', { text: 'Люди' }));
  text.append(el('p', { text: 'Найдите студентов по имени, университету, курсу и интересам. Группы — по названию и @username.' }));
  head.append(text);
  root.append(head);

  const tabs = el('div', { class: 'shop-tabs' });
  const peopleTab = el('button', { class: 'shop-tab is-active', text: 'Студенты', attrs: { type: 'button' } });
  const groupsTab = el('button', { class: 'shop-tab', text: 'Группы', attrs: { type: 'button' } });
  tabs.append(peopleTab, groupsTab);
  root.append(tabs);

  const searchRow = el('div', { class: 'shop-tools' });
  const search = el('input', {
    class: 'input',
    attrs: { type: 'search', placeholder: 'Имя, @username, интересы', value: ctx.query.q || '' }
  });
  searchRow.append(search);
  root.append(searchRow);

  const filters = el('div', { class: 'people-filters' });
  const course = el('select', { class: 'input' });
  for (const [value, label] of COURSES) course.append(el('option', { text: label, attrs: { value } }));
  const onlineRow = el('label', { class: 'check-row' });
  const online = el('input', { attrs: { type: 'checkbox' } });
  onlineRow.append(online, el('span', { text: 'Только онлайн' }));
  const ageMin = el('input', { class: 'input', attrs: { type: 'number', min: '16', max: '60', placeholder: 'Возраст от' } });
  const ageMax = el('input', { class: 'input', attrs: { type: 'number', min: '16', max: '60', placeholder: 'Возраст до' } });
  filters.append(course, ageMin, ageMax, onlineRow);
  root.append(filters);

  const results = el('div');
  root.append(results);
  const moreWrap = el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } });
  root.append(moreWrap);

  let mode = 'people';
  let offset = 0;
  let hasMore = false;
  let loading = false;
  let timer = null;

  function statusNode(person) {
    if (!person.status) return null;
    const bubble = el('span', { class: 'status-bubble' });
    bubble.innerHTML = glassSvg(person.status.emoji, 16);
    bubble.append(el('span', { text: person.status.text || person.status.name }));
    return bubble;
  }

  function personCard(person) {
    const card = el('div', { class: 'people-card' });
    const top = el('div', { class: 'people-card__top' });
    top.append(avatarNode(person, 'md'));
    const names = el('div', { style: { minWidth: '0' } });
    const name = el('div', { class: 'people-card__name' });
    name.append(el('span', { text: person.display_name }));
    if (person.is_verified) {
      const badge = el('span', { class: 'verified' });
      badge.innerHTML = icon('verified', { size: 14, fill: true });
      name.append(badge);
    }
    names.append(name);
    const status = statusNode(person);
    if (status) names.append(status);
    names.append(el('div', { class: 'people-card__meta', text: `@${person.username}` }));
    top.append(names);
    card.append(top);

    const body = el('div', { class: 'people-card__body' });
    const bits = [];
    if (person.university_short_name || person.university) {
      bits.push(person.university_short_name || (person.university && person.university.short_name) || '');
    }
    if (person.course) bits.push(`${person.course} курс`);
    if (person.age) bits.push(`${person.age} лет`);
    if (person.is_online) bits.push('в сети');
    body.append(el('div', { class: 'people-card__meta', text: bits.filter(Boolean).join(' · ') || 'Студент WIUT' }));
    card.append(body);

    const actions = el('div', { class: 'people-card__actions' });
    actions.append(
      button('Профиль', { variant: 'btn-ghost btn-sm', onClick: () => navigate(`/u/${person.username}`) }),
      button('Лайк', {
        variant: 'btn-secondary btn-sm',
        icon: 'heart',
        onClick: async () => {
          try {
            const data = await api.post('/swipes', { to_id: person.id, action: 'like' });
            toast(data.match ? 'Это взаимно! Матч создан' : 'Лайк отправлен', 'success');
            if (data.match) {
              const dm = await api.post('/conversations/dm', { username: person.username });
              navigate(`/chat/${dm.conversation.id}`);
            }
          } catch (err) {
            toast(err.message || 'Не удалось поставить лайк', 'error');
          }
        }
      })
    );
    actions.append(
      button('Написать', {
        variant: 'btn-ghost btn-sm',
        icon: 'chat',
        onClick: async () => {
          try {
            const data = await api.post('/conversations/dm', { username: person.username });
            navigate(`/chat/${data.conversation.id}`);
          } catch (err) {
            toast(err.message || 'Не удалось открыть чат', 'error');
          }
        }
      }),
      button('Подарить', {
        variant: 'btn-ghost btn-sm',
        icon: 'gift',
        onClick: () => navigate(`/shop?tab=gift&to=${encodeURIComponent(person.username)}`)
      })
    );
    card.append(actions);
    return card;
  }

  function groupCard(group) {
    const card = el('div', { class: 'group-card', style: { marginBottom: '8px' } });
    const avatar = el('div', { class: 'group-card__avatar', text: (group.title || 'Г').slice(0, 1).toUpperCase() });
    card.append(avatar);
    const info = el('div', { style: { flex: '1', minWidth: '0' } });
    info.append(el('div', { class: 'people-card__name', text: group.title }));
    info.append(
      el('div', {
        class: 'people-card__meta',
        text: `${group.members_count} участников${group.username ? ` · @${group.username}` : ''}`
      })
    );
    if (group.description) info.append(el('div', { class: 'people-card__meta', text: group.description }));
    card.append(info);
    if (group.is_member) {
      card.append(button('Открыть', { variant: 'btn-secondary btn-sm', onClick: () => navigate(`/chat/${group.id}`) }));
    } else {
      card.append(
        button(group.join_mode === 'invite_only' ? 'По приглашению' : 'Вступить', {
          variant: 'btn-primary btn-sm',
          disabled: group.join_mode === 'invite_only',
          onClick: async () => {
            try {
              const data = await api.post(`/conversations/${group.id}/join`);
              if (data.pending) toast('Заявка отправлена — ждите одобрения');
              else {
                toast('Вы вступили в группу', 'success');
                navigate(`/chat/${group.id}`);
              }
            } catch (err) {
              toast(err.message || 'Не удалось вступить', 'error');
            }
          }
        })
      );
    }
    return card;
  }

  async function load(reset = false) {
    if (loading) return;
    loading = true;
    if (reset) {
      offset = 0;
      results.innerHTML = '';
    }
    const loader = loadingRow('Ищем…');
    results.append(loader);
    moreWrap.innerHTML = '';
    try {
      const params = new URLSearchParams();
      if (search.value.trim()) params.set('q', search.value.trim());
      if (mode === 'people') {
        params.set('offset', String(offset));
        params.set('limit', '24');
        if (course.value) params.set('course', course.value);
        if (online.checked) params.set('online', '1');
        if (ageMin.value) params.set('age_min', ageMin.value);
        if (ageMax.value) params.set('age_max', ageMax.value);
        const data = await api.get(`/people?${params.toString()}`);
        loader.remove();
        if (reset) results.innerHTML = '';
        const list = data.users || [];
        if (!list.length && reset) {
          results.append(emptyState('🔍', 'Никого не нашли', 'Попробуйте изменить запрос или фильтры.'));
        }
        const grid = reset || !results.querySelector('.people-grid') ? el('div', { class: 'people-grid' }) : results.querySelector('.people-grid');
        for (const person of list) grid.append(personCard(person));
        if (!grid.parentNode) results.append(grid);
        hasMore = !!data.has_more;
        offset = data.next_offset || offset + list.length;
      } else {
        const data = await api.get(`/people/groups?${params.toString()}`);
        loader.remove();
        if (reset) results.innerHTML = '';
        if (!data.groups.length && reset) results.append(emptyState('👥', 'Групп не нашли', 'Попробуйте другое название.'));
        for (const group of data.groups) results.append(groupCard(group));
        hasMore = false;
      }
      if (hasMore) {
        moreWrap.append(button('Показать ещё', { variant: 'btn-secondary', onClick: () => load(false) }));
      }
    } catch (err) {
      loader.remove();
      results.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось выполнить поиск' }));
    } finally {
      loading = false;
    }
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(true), 350);
  });
  for (const node of [course, online, ageMin, ageMax]) node.addEventListener('change', () => load(true));

  function switchMode(next) {
    mode = next;
    peopleTab.classList.toggle('is-active', next === 'people');
    groupsTab.classList.toggle('is-active', next === 'groups');
    filters.style.display = next === 'people' ? '' : 'none';
    results.innerHTML = '';
    load(true);
  }
  peopleTab.addEventListener('click', () => switchMode('people'));
  groupsTab.addEventListener('click', () => switchMode('groups'));

  load(true);

  return {
    el: root,
    cleanup() {
      clearTimeout(timer);
    }
  };
}

