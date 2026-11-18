import { el, button, toast } from '../../ui.js?v=23';
import { icon } from '../../icons.js?v=23';
import { api } from '../../api.js?v=23';
import { navigate } from '../../router.js?v=23';
import { getState } from '../../state.js?v=23';
import overviewSection from './overview.js?v=23';
import usersSection from './users.js?v=23';
import universitiesSection from './universities.js?v=23';
import moderationSection from './moderation.js?v=23';
import systemSection from './system.js?v=23';
import adsSection from './ads/index.js?v=23';
import superlikesSection from './superlikes.js?v=23';
import cosmeticsSection from './cosmetics.js?v=23';
import securitySection from './security.js?v=23';

const SECTIONS = [
  { id: 'overview', label: 'Обзор', icon: 'chart' },
  { id: 'ads', label: 'Реклама', icon: 'image' },
  { id: 'superlikes', label: 'Суперлайки', icon: 'star' },
  { id: 'users', label: 'Пользователи', icon: 'users' },
  { id: 'cosmetics', label: 'Косметика', icon: 'gift' },
  { id: 'universities', label: 'Университеты', icon: 'graduation' },
  { id: 'content', label: 'Контент и жалобы', icon: 'file' },
  { id: 'settings', label: 'Настройки', icon: 'sliders' },
  { id: 'log', label: 'Журнал', icon: 'history' },
  { id: 'security', label: 'Безопасность', icon: 'lock' },
  { id: 'data', label: 'Данные', icon: 'grid' }
];

const SECTIONS_MAP = {
  overview: overviewSection,
  ads: adsSection,
  superlikes: superlikesSection,
  security: securitySection,
  users: usersSection,
  cosmetics: cosmeticsSection,
  universities: universitiesSection,
  content: moderationSection,
  reports: moderationSection,
  announcements: moderationSection,
  settings: systemSection,
  log: systemSection,
  data: systemSection
};

export default async function AdminPage(ctx) {
  const state = getState();
  if (!state.user || state.user.role !== 'owner') {
    navigate('/swipe', { replace: true });
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  let active = params.get('section') || 'overview';
  if (!SECTIONS_MAP[active]) active = 'overview';
  let userId = params.get('user') ? Number(params.get('user')) : null;

  const root = el('div', { class: 'admin' });
  const layout = el('div', { class: 'admin-shell' });

  const side = el('aside', { class: 'admin-nav' });
  const sideHead = el('div', { class: 'admin-nav__head' });
  sideHead.innerHTML = icon('shield', { size: 18 });
  sideHead.append(el('span', { text: 'Центр управления' }));
  side.append(sideHead);

  const navButtons = new Map();
  for (const item of SECTIONS) {
    const link = el('button', {
      class: `admin-nav__item ${active === item.id ? 'is-active' : ''}`,
      attrs: { type: 'button' }
    });
    link.innerHTML = icon(item.icon, { size: 18 });
    link.append(el('span', { text: item.label }));
    link.addEventListener('click', () => {
      active = item.id;
      userId = null;
      updateUrl();
      renderSection();
      navButtons.forEach((node, id) => node.classList.toggle('is-active', id === active));
    });
    navButtons.set(item.id, link);
    side.append(link);
  }

  // Badges with the number of new advertising and super like requests.
  function setNavBadge(sectionId, count) {
    const link = navButtons.get(sectionId);
    if (!link) return;
    let badge = link.querySelector('.admin-nav__badge');
    if (!count) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = el('span', { class: 'admin-nav__badge' });
      link.append(badge);
    }
    badge.textContent = String(count);
  }

  function refreshBadges() {
    api
      .get('/admin/ads/badge')
      .then((data) => setNavBadge('ads', data.new_requests))
      .catch(() => {});
    api
      .get('/admin/superlikes/badge')
      .then((data) => setNavBadge('superlikes', data.new_orders))
      .catch(() => {});
  }

  const sideFooter = el('div', { class: 'admin-nav__footer' });
  sideFooter.append(el('span', { class: 'field__hint', text: `@${state.user.username}` }));
  sideFooter.append(
    button('Выйти на сайт', {
      variant: 'btn-ghost btn-sm',
      onClick: () => navigate('/swipe')
    })
  );
  side.append(sideFooter);

  const main = el('div', { class: 'admin-main' });
  const content = el('div', { class: 'admin-content' });
  main.append(content);
  layout.append(side, main);
  root.append(layout);

  function updateUrl() {
    const query = new URLSearchParams();
    if (active !== 'overview') query.set('section', active);
    if (userId) query.set('user', String(userId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    window.history.replaceState({}, '', `/admin${suffix}`);
  }

  function showUser(id) {
    userId = id;
    active = 'users';
    navButtons.forEach((node, sectionId) => node.classList.toggle('is-active', sectionId === 'users'));
    updateUrl();
    renderSection();
  }

  function backToUsers() {
    userId = null;
    updateUrl();
    renderSection();
  }

  async function renderSection() {
    content.innerHTML = '';
    const skeleton = el('div', { class: 'col', style: { gap: '12px' } });
    for (let i = 0; i < 3; i += 1) skeleton.append(el('div', { class: 'skeleton', style: { height: '72px' } }));
    content.append(skeleton);
    try {
      const section = SECTIONS_MAP[active] || overviewSection;
      const node = await section({
        userId,
        active,
        showUser,
        backToUsers,
        refresh: renderSection
      });
      if (node) {
        content.innerHTML = '';
        content.append(node);
      }
      if (!userId) {
        content.scrollIntoView({ block: 'start' });
      } else {
        window.scrollTo({ top: 0 });
      }
      refreshBadges();
    } catch (err) {
      content.innerHTML = '';
      const box = el('div', { class: 'admin-empty' });
      box.append(el('p', { text: err.message || 'Не удалось загрузить раздел' }));
      box.append(button('Повторить', { variant: 'btn-secondary', onClick: () => renderSection() }));
      content.append(box);
      if (err.status === 404) toast('Раздел недоступен', 'error');
    }
  }

  renderSection();
  return root;
}
