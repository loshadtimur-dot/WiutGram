import { api } from '../api.js?v=25';
import {
  el,
  avatarNode,
  button,
  toast,
  formatNumber,
  emptyState,
  loadingRow,
  initials,
  gradientFor,
  timeAgo,
  svgIcon
} from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { getState } from '../state.js?v=25';
import { navigate } from '../router.js?v=25';
import { createStoryRail } from '../components/storyViewer.js?v=25';
import { openStoryCreate } from '../components/postCreate.js?v=25';
import { createPostCard } from '../components/postCard.js?v=25';
import { openPostModal } from '../components/postModal.js?v=25';

const INTERESTS = [
  ['travel', 'Путешествия'], ['music', 'Музыка'], ['movies', 'Кино'], ['sport', 'Спорт'],
  ['games', 'Игры'], ['coffee', 'Кофе'], ['books', 'Книги'], ['photo', 'Фото'],
  ['it', 'IT'], ['dance', 'Танцы'], ['cooking', 'Кулинария'], ['yoga', 'Йога'],
  ['anime', 'Аниме'], ['dogs', 'Собаки'], ['cats', 'Коты'], ['fashion', 'Мода'],
  ['cars', 'Автомобили'], ['art', 'Искусство'], ['business', 'Бизнес']
];

export default async function ExplorePage() {
  const me = getState().user;
  const root = el('div', { class: 'explore' });

  const filters = { university_id: '', interest: '', min_age: 18, max_age: 99, q: '' };
  let mode = 'grid';
  let posts = [];
  let people = [];
  let offset = 0;
  let hasMore = true;
  let loading = false;
  let searchResults = null;
  let searchTimer = null;

  /* Stories */
  const storiesWrap = el('div');
  root.append(storiesWrap);

  async function loadStories() {
    storiesWrap.innerHTML = '';
    try {
      const data = await api.get('/stories');
      const feeds = data.feeds || [];
      const rail = createStoryRail(feeds, {
        allowAdd: true,
        onAdd: () => openStoryCreate(() => loadStories())
      });
      if (!feeds.length) {
        storiesWrap.append(rail);
      } else {
        storiesWrap.append(rail);
      }
    } catch (err) {
      storiesWrap.style.display = 'none';
    }
  }
  loadStories();

  /* Search */
  const searchWrap = el('div', { class: 'explore-search' });
  const searchIcon = el('span', { class: 'explore-search__icon' });
  searchIcon.innerHTML = icon('search', { size: 18 });
  const searchInput = el('input', {
    class: 'input',
    attrs: { type: 'search', placeholder: 'Поиск людей, университетов и интересов', 'aria-label': 'Поиск' }
  });
  const suggestions = el('div', { class: 'search-suggest hidden' });
  searchWrap.append(searchIcon, searchInput, suggestions);
  root.append(searchWrap);

  function hideSuggestions() {
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    filters.q = query;
    clearTimeout(searchTimer);
    if (!query) {
      hideSuggestions();
      if (searchResults) {
        searchResults = null;
        renderContent(true);
      }
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const data = await api.get(`/search/suggest?q=${encodeURIComponent(query)}`);
        suggestions.innerHTML = '';
        if (!data.suggestions.length) {
          hideSuggestions();
          return;
        }
        for (const item of data.suggestions) {
          const row = el('button', { class: 'search-suggest__item', attrs: { type: 'button' } });
          if (item.type === 'user') {
            row.append(avatarNode({ display_name: item.display_name, avatar_path: item.avatar_path }, 'sm'));
            const body = el('div');
            body.append(el('div', { text: item.display_name }));
            body.append(
              el('div', {
                class: 'field__hint',
                text: `@${item.username}${
                  item.university ? ` · ${item.university.short_name || item.university}` : ''
                }${item.district ? ` · ${item.district}` : ''}`
              })
            );
            row.append(body);
            row.addEventListener('click', () => {
              hideSuggestions();
              navigate(`/u/${item.username}`);
            });
          } else {
            row.append(el('span', { text: item.emoji || '✨' }));
            row.append(el('span', { text: `Интерес: ${item.label}` }));
            row.addEventListener('click', () => {
              filters.interest = item.id;
              interestSelect.value = item.id;
              searchInput.value = '';
              hideSuggestions();
              searchResults = null;
              renderContent(true);
            });
          }
          suggestions.append(row);
        }
        suggestions.classList.remove('hidden');
      } catch (err) {
        hideSuggestions();
      }
    }, 260);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      hideSuggestions();
      runSearch();
    }
  });

  async function runSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchResults = null;
      renderContent(true);
      return;
    }
    hideSuggestions();
    content.innerHTML = '';
    content.append(loadingRow('Ищем людей…'));
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(query)}&limit=30`);
      searchResults = data.users || [];
      renderSearchResults();
    } catch (err) {
      content.innerHTML = '';
      content.append(emptyState('😕', 'Поиск недоступен', err.message || ''));
    }
  }

  function renderSearchResults() {
    content.innerHTML = '';
    const headRow = el('div', { class: 'explore-toolbar' });
    const title = el('div', { class: 'section__title', text: `Результаты поиска: ${searchResults.length}` });
    const clear = button('Сбросить поиск', {
      variant: 'btn-ghost',
      onClick: () => {
        searchInput.value = '';
        searchResults = null;
        renderContent(true);
      }
    });
    headRow.append(title, clear);
    content.append(headRow);
    if (!searchResults.length) {
      content.append(emptyState('🔍', 'Никого не нашли', 'Попробуйте другое имя, университет или интерес.'));
      return;
    }
    const grid = el('div', { class: 'likes-grid' });
    for (const user of searchResults) grid.append(peopleCard(user));
    content.append(grid);
  }

  /* Toolbar */
  const toolbar = el('div', { class: 'explore-toolbar' });
  const segmented = el('div', { class: 'segmented' });
  const feedTab = el('button', { class: 'segmented__item', text: 'Лента', attrs: { type: 'button' } });
  const gridTab = el('button', { class: 'segmented__item is-active', text: 'Сетка', attrs: { type: 'button' } });
  segmented.append(feedTab, gridTab);
  toolbar.append(segmented);

  const filtersRow = el('div', { class: 'filter-bar' });
  const universitySelect = el('select', { class: 'select', attrs: { 'aria-label': 'Университет' }, style: { minWidth: '170px' } });
  universitySelect.append(el('option', { text: 'Все университеты', attrs: { value: '' } }));
  universitySelect.addEventListener('change', () => {
    filters.university_id = universitySelect.value;
    renderContent(true);
  });
  api
    .get('/universities')
    .then((list) => {
      for (const university of list.universities || []) {
        universitySelect.append(
          el('option', { text: `${university.short_name} — ${university.name}`, attrs: { value: String(university.id) } })
        );
      }
    })
    .catch(() => {});

  const interestSelect = el('select', { class: 'select', attrs: { 'aria-label': 'Интерес' }, style: { minWidth: '150px' } });
  interestSelect.append(el('option', { text: 'Любые интересы', attrs: { value: '' } }));
  INTERESTS.forEach(([value, label]) => interestSelect.append(el('option', { text: label, attrs: { value } })));
  interestSelect.addEventListener('change', () => {
    filters.interest = interestSelect.value;
    renderContent(true);
  });

  const ageSelect = el('select', { class: 'select', attrs: { 'aria-label': 'Возраст от' }, style: { minWidth: '110px' } });
  for (let age = 18; age <= 60; age += 1) ageSelect.append(el('option', { text: `от ${age}`, attrs: { value: String(age) } }));
  ageSelect.value = '18';
  const ageToSelect = el('select', { class: 'select', attrs: { 'aria-label': 'Возраст до' }, style: { minWidth: '110px' } });
  for (let age = 18; age <= 99; age += 1) ageToSelect.append(el('option', { text: `до ${age}`, attrs: { value: String(age) } }));
  ageToSelect.value = '99';
  const applyAge = () => {
    filters.min_age = Number(ageSelect.value);
    filters.max_age = Number(ageToSelect.value);
    if (filters.min_age > filters.max_age) {
      const tmp = filters.min_age;
      filters.min_age = filters.max_age;
      filters.max_age = tmp;
      ageSelect.value = String(filters.min_age);
      ageToSelect.value = String(filters.max_age);
    }
    renderContent(true);
  };
  ageSelect.addEventListener('change', applyAge);
  ageToSelect.addEventListener('change', applyAge);

  filtersRow.append(universitySelect, interestSelect, ageSelect, ageToSelect);
  toolbar.append(filtersRow);
  root.append(toolbar);

  const content = el('div');
  root.append(content);

  feedTab.addEventListener('click', () => {
    mode = 'feed';
    feedTab.classList.add('is-active');
    gridTab.classList.remove('is-active');
    renderContent(true);
  });
  gridTab.addEventListener('click', () => {
    mode = 'grid';
    gridTab.classList.add('is-active');
    feedTab.classList.remove('is-active');
    renderContent(true);
  });

  function peopleCard(user) {
    const card = el('div', { class: 'people-card' });
    const photo = el('div', { class: 'people-card__photo' });
    const avatar = el('div', { class: 'avatar', style: { width: '100%', height: '100%', borderRadius: '0' } });
    avatar.style.background = gradientFor(user.display_name);
    if (user.avatar_path) {
      const img = el('img', { attrs: { src: user.avatar_path, alt: user.display_name, loading: 'lazy' } });
      img.addEventListener('error', () => {
        avatar.textContent = initials(user.display_name);
      });
      avatar.append(img);
    } else {
      avatar.textContent = initials(user.display_name);
    }
    photo.append(avatar);
    if (user.online) {
      const dot = el('span', { class: 'online-status' });
      photo.append(dot);
    }
    card.append(photo);
    const body = el('div', { class: 'people-card__body' });
    body.append(el('div', { class: 'people-card__name', text: user.display_name }));
    body.append(
      el('div', {
        class: 'people-card__meta',
        text: [
          user.age ? `${user.age}` : null,
          user.university ? user.university.short_name || user.university : null,
          user.district || null
        ].filter(Boolean).join(' · ')
      })
    );
    card.append(body);
    card.addEventListener('click', () => navigate(`/u/${user.username}`));
    return card;
  }

  function queryString(extra = '') {
    const params = new URLSearchParams();
    if (filters.university_id) params.set('university_id', filters.university_id);
    if (filters.interest) params.set('interest', filters.interest);
    if (filters.q) params.set('q', filters.q);
    if (filters.min_age > 18) params.set('min_age', String(filters.min_age));
    if (filters.max_age < 99) params.set('max_age', String(filters.max_age));
    const base = params.toString();
    return `${base ? `${base}&` : ''}${extra}`;
  }

  async function renderContent(reset = false) {
    if (searchResults) {
      renderSearchResults();
      return;
    }
    if (loading && !reset) return;
    if (reset) {
      offset = 0;
      posts = [];
      people = [];
      hasMore = true;
    }
    if (!hasMore && !reset) return;
    loading = true;
    if (reset) {
      content.innerHTML = '';
      content.append(loadingRow('Собираем моменты…'));
    }
    try {
      if (mode === 'feed') {
        const data = await api.get(`/feed?limit=8&offset=${offset}&${queryString()}`);
        const newPosts = data.posts || [];
        posts = posts.concat(newPosts);
        hasMore = !!data.has_more;
        offset += newPosts.length;
        if (reset) content.innerHTML = '';
        const feed = content.querySelector('.feed') || el('div', { class: 'feed' });
        if (!content.contains(feed)) content.append(feed);
        for (const post of newPosts) {
          feed.append(
            createPostCard(post, {
              onDeleted: (deleted) => {
                posts = posts.filter((item) => item.id !== deleted.id);
                renderContent(true);
              }
            })
          );
        }
        if (!posts.length) {
          content.innerHTML = '';
          content.append(emptyState('📷', 'В ленте пока пусто', 'Измените фильтры или загляните позже.', null));
        }
        if (hasMore) attachSentinel();
      } else {
        const data = await api.get(`/discover/explore?limit=24&offset=${offset}&${queryString()}`);
        const newPosts = data.posts || [];
        posts = posts.concat(newPosts);
        people = data.people || [];
        hasMore = !!data.has_more;
        offset += newPosts.length;
        content.innerHTML = '';

        if (people.length) {
          const peopleHead = el('div', { class: 'section__head' });
          peopleHead.append(el('div', { class: 'section__title', text: 'Люди, которых стоит увидеть' }));
          peopleHead.append(
            button('Все свайпы', { variant: 'btn-ghost', class: 'btn-sm', onClick: () => navigate('/swipe') })
          );
          content.append(peopleHead);
          const rail = el('div', { class: 'explore-people' });
          for (const person of people) rail.append(peopleCard(person));
          content.append(rail);
        }

        if (!posts.length) {
          content.append(emptyState('🖼️', 'Постов не найдено', 'Попробуйте изменить фильтры — университет или интересы.'));
        } else {
          const grid = el('div', { class: 'explore-grid' });
          posts.forEach((post, index) => {
            const tile = el('div', { class: `explore-tile ${index % 7 === 3 ? 'explore-tile--wide' : ''}` });
            const img = el('img', { attrs: { src: post.image_path, alt: post.caption || 'Пост', loading: 'lazy' } });
            tile.append(img);
            const overlay = el('div', { class: 'explore-tile__overlay' });
            const likes = el('span');
            likes.innerHTML = icon('heart', { size: 15, fill: true });
            likes.append(el('span', { text: formatNumber(post.likes) }));
            const comments = el('span');
            comments.innerHTML = icon('comment', { size: 15, fill: true });
            comments.append(el('span', { text: formatNumber(post.comments) }));
            overlay.append(likes, comments);
            tile.append(overlay);
            tile.addEventListener('click', () => {
              openPostModal(post, {
                onDeleted: () => {
                  posts = posts.filter((item) => item.id !== post.id);
                  renderContent(true);
                }
              });
            });
            grid.append(tile);
          });
          content.append(grid);
        }
        if (hasMore) attachSentinel();
      }
    } catch (err) {
      if (reset) {
        content.innerHTML = '';
        content.append(
          emptyState('😕', 'Не удалось загрузить', err.message || 'Попробуйте позже', button('Повторить', {
            variant: 'btn-secondary',
            onClick: () => renderContent(true)
          }))
        );
      }
    } finally {
      loading = false;
    }
  }

  let observer = null;
  function attachSentinel() {
    if (observer) observer.disconnect();
    const sentinel = el('div', { style: { height: '20px' } });
    content.append(sentinel);
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && hasMore && !loading) renderContent(false);
      }
    }, { rootMargin: '400px' });
    observer.observe(sentinel);
  }

  renderContent(true);

  return {
    el: root,
    cleanup() {
      if (observer) observer.disconnect();
      clearTimeout(searchTimer);
    }
  };
}
