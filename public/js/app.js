import { api, setToken, clearToken } from './api.js?v=24';
import { storageGet } from './storage.js?v=24';
import { icon } from './icons.js?v=24';
import {
  getState,
  setUser,
  setCounts,
  incrementCount,
  setOnline,
  setSite,
  subscribe,
  applyTheme,
  watchSystemTheme,
  isOwner
} from './state.js?v=24';
import { defineRoutes, setRenderer, startRouter, navigate } from './router.js?v=24';
import { el, avatarNode, toast, loadingRow, button, attachRipples, openModal } from './ui.js?v=24';
import { initSocket, onSocket, disconnectSocket } from './socket.js?v=24';
import { showMatchScreen } from './components/match.js?v=24';

import Landing from './pages/landing.js?v=24';
import LoginPage from './pages/login.js?v=24';
import RegisterPage from './pages/register.js?v=24';
import WelcomePage from './pages/welcome.js?v=24';
import SwipePage from './pages/swipe.js?v=24';
import LikesPage from './pages/likes.js?v=24';
import ChatsPage from './pages/chats.js?v=24';
import ChatPage from './pages/chat.js?v=24';
import ProfilePage from './pages/profile.js?v=24';
import EditProfilePage from './pages/edit-profile.js?v=24';
import ExplorePage from './pages/explore.js?v=24';
import NotificationsPage from './pages/notifications.js?v=24';
import SettingsPage from './pages/settings.js?v=24';
import SuperlikesPage from './pages/superlikes.js?v=24';
import LegalPage from './pages/legal.js?v=24';
import AdvertisePage from './pages/advertise.js?v=24';
import AdReportPage from './pages/ad-report.js?v=24';
import AuraPage from './pages/aura.js?v=24';

const NAV_ITEMS = [
  { path: '/swipe', label: 'Свайпы', icon: 'layers' },
  { path: '/explore', label: 'Обзор', icon: 'compass' },
  { path: '/likes', label: 'Лайки', icon: 'heart', badge: 'likes' },
  { path: '/chats', label: 'Чаты', icon: 'chat', badge: 'messages' },
  { path: '/aura', label: 'Aura', icon: 'star' },
  { path: '/profile', label: 'Профиль', icon: 'user' }
];

const ROUTES = [
  { path: '/', page: Landing, layout: 'public', guestOnly: true, title: 'Сообщество студентов WIUT' },
  { path: '/login', page: LoginPage, layout: 'public', guestOnly: true, title: 'Вход' },
  { path: '/register', page: RegisterPage, layout: 'public', guestOnly: true, title: 'Регистрация' },
  { path: '/welcome', page: WelcomePage, auth: true },
  { path: '/swipe', page: SwipePage, auth: true, title: 'Свайпы' },
  { path: '/likes', page: LikesPage, auth: true, title: 'Лайки' },
  { path: '/chats', page: ChatsPage, auth: true, title: 'Чаты' },
  { path: '/chat/:id', page: ChatPage, auth: true, title: 'Чат' },
  { path: '/profile', page: ProfilePage, auth: true, title: 'Профиль' },
  { path: '/profile/edit', page: EditProfilePage, auth: true, title: 'Редактирование профиля' },
  { path: '/u/:username', page: ProfilePage, auth: true, title: 'Профиль' },
  { path: '/explore', page: ExplorePage, auth: true, title: 'Обзор' },
  { path: '/aura', page: AuraPage, auth: true, title: 'Aura Table' },
  { path: '/notifications', page: NotificationsPage, auth: true, title: 'Уведомления' },
  { path: '/settings', page: SettingsPage, auth: true, title: 'Настройки' },
  { path: '/superlikes', page: SuperlikesPage, auth: true, title: 'Суперлайки' },
  {
    path: '/admin',
    page: async (ctx) => {
      const module = await import('./pages/admin/index.js?v=24');
      return module.default(ctx);
    },
    auth: true,
    staff: true,
    title: 'Центр управления'
  },
  { path: '/advertise', page: AdvertisePage, layout: 'public', title: 'Реклама на сайте' },
  { path: '/ad-report/:token', page: AdReportPage, layout: 'public', title: 'Отчёт о рекламе' },
  { path: '/rules', page: LegalPage, layout: 'public', pageProps: { kind: 'rules' }, title: 'Правила сообщества' },
  { path: '/privacy', page: LegalPage, layout: 'public', pageProps: { kind: 'privacy' }, title: 'Политика конфиденциальности' }
];

const appRoot = () => document.getElementById('app');
let layout = null;
let sidebarLoaded = false;
let soundContext = null;
let impersonation = null;
let lastActivity = Date.now();

/* ---------- Shell ---------- */
function publicShell() {
  const app = appRoot();
  const user = getState().user;
  // Signed-in visitors must never be offered "Войти" / "Создать аккаунт" again.
  const authLinks = user
    ? `<a class="landing__link" href="/swipe" data-link>Свайпы</a>
       <a class="landing__link" href="/profile" data-link>Профиль</a>
       ${isOwner() ? '<a class="landing__link" href="/admin" data-link>Админ-панель</a>' : ''}`
    : `<a class="landing__link" href="/login" data-link>Войти</a>
       <a class="btn btn-primary btn-sm" href="/register" data-link>Создать аккаунт</a>`;
  app.className = 'app layout-public';
  app.innerHTML = `
    <div class="public-topbar">
      <a class="landing__brand" href="/" data-link>
        <img src="/img/logo.svg" alt="" width="36" height="36" />
        <span class="sidebar__brand-text">Wiut<span>gram</span></span>
      </a>
      <div class="public-topbar__spacer"></div>
      <a class="landing__link" href="/advertise" data-link>Реклама</a>
      <a class="landing__link" href="/rules" data-link>Правила</a>
      <a class="landing__link" href="/privacy" data-link>Политика</a>
      ${authLinks}
    </div>
    <div class="public-view" id="view"></div>
  `;
  document.body.style.background = '';
}

function appShell() {
  const app = appRoot();
  const state = getState();
  app.className = 'app layout-app';
  app.innerHTML = `
    <aside class="sidebar">
      <a class="sidebar__brand" href="/swipe" data-link>
        <img src="/img/logo.svg" alt="Wiutgram" width="38" height="38" />
        <span class="sidebar__brand-text">Wiut<span>gram</span></span>
      </a>
      <a class="sidebar__profile" href="/profile" data-link>
        <span id="sidebar-avatar"></span>
        <span class="sidebar__profile-info">
          <span class="sidebar__profile-name" id="sidebar-name"></span>
          <span class="sidebar__profile-meta" id="sidebar-meta"></span>
        </span>
      </a>
      <nav class="sidebar__nav" id="sidebar-nav" aria-label="Основная навигация"></nav>
      <div class="sidebar__chats">
        <div class="sidebar__chats-head"><span>Сообщения</span><a href="/chats" data-link class="icon-btn-plain" aria-label="Все чаты">${icon(
          'chevronRight',
          { size: 16 }
        )}</a></div>
        <div class="sidebar__chat-list" id="sidebar-chats"></div>
      </div>
      <div class="sidebar__footer">
        <span>${icon('sparkles', { size: 14 })} ${state.site.site_name || 'Wiutgram'}</span>
        <span style="flex:1"></span>
        <a href="/settings" data-link class="icon-btn-plain" aria-label="Настройки">${icon('sliders', { size: 17 })}</a>
        ${isOwner() ? `<a href="/admin" data-link class="icon-btn-plain" aria-label="Центр управления">${icon('shield', { size: 17 })}</a>` : ''}
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="topbar__brand" href="/swipe" data-link>
          <img src="/img/logo.svg" alt="" /><span>Wiutgram</span>
        </a>
        <span class="topbar__title" id="topbar-title"></span>
        <div class="topbar__spacer"></div>
        <div class="topbar__actions">
          <a class="btn-icon" id="notification-btn" href="/notifications" data-link aria-label="Уведомления">
            ${icon('bell', { size: 20 })}<span class="tabbar__badge hidden" id="bell-badge"></span>
          </a>
          <a class="topbar__avatar" href="/profile" data-link aria-label="Мой профиль"><span id="topbar-avatar"></span></a>
        </div>
      </header>
      <main class="view" id="view"></main>
    </div>
    <nav class="tabbar" id="tabbar" aria-label="Нижняя навигация"></nav>
  `;
  renderNav();
  renderSidebarProfile();
  updateBadges();
}

function ensureLayout(kind) {
  if (layout === kind) return;
  layout = kind;
  if (kind === 'public') publicShell();
  else appShell();
}

function renderSidebarProfile() {
  const state = getState();
  const user = state.user;
  if (!user) return;
  const holder = document.getElementById('sidebar-avatar');
  if (holder) {
    holder.innerHTML = '';
    holder.append(avatarNode(user, 'md'));
  }
  const name = document.getElementById('sidebar-name');
  if (name) name.textContent = user.display_name || user.username;
  const meta = document.getElementById('sidebar-meta');
  if (meta) {
    meta.innerHTML = '';
    if (user.role === 'owner') {
      const crown = el('span', { class: 'role-icon role-icon--owner' });
      crown.innerHTML = icon('crown', { size: 14, fill: true });
      meta.append(crown);
      meta.append(el('span', { text: 'Владелец' }));
    } else if (user.role === 'admin') {
      const shield = el('span', { class: 'role-icon role-icon--admin' });
      shield.innerHTML = icon('shield', { size: 13 });
      meta.append(shield);
      meta.append(el('span', { text: 'Админ' }));
    } else {
      meta.append(el('span', { text: `@${user.username}` }));
    }
  }
  const topAvatar = document.getElementById('topbar-avatar');
  if (topAvatar) {
    topAvatar.innerHTML = '';
    topAvatar.append(avatarNode(user, 'sm'));
  }
}

function badgeValue(kind) {
  const state = getState();
  if (kind === 'likes') return state.counts.likes || 0;
  if (kind === 'messages') return state.counts.unread_messages || 0;
  return 0;
}

function renderNav() {
  const nav = document.getElementById('sidebar-nav');
  if (nav) {
    nav.innerHTML = '';
    for (const item of NAV_ITEMS) {
      const link = el('a', { class: 'nav-link', attrs: { href: item.path, 'data-path': item.path } });
      link.innerHTML = icon(item.icon, { size: 21 });
      link.append(el('span', { text: item.label }));
      if (item.badge) {
        const badge = el('span', { class: 'badge hidden', attrs: { 'data-badge': item.badge } });
        link.append(badge);
      }
      nav.append(link);
    }
    if (isOwner()) {
      const admin = el('a', { class: 'nav-link', attrs: { href: '/admin', 'data-path': '/admin' } });
      admin.innerHTML = icon('shield', { size: 20 });
      admin.append(el('span', { text: 'Центр управления' }));
      nav.append(admin);
    }
  }

  const tabbar = document.getElementById('tabbar');
  if (tabbar) {
    tabbar.innerHTML = '';
    for (const item of NAV_ITEMS) {
      const link = el('a', { class: 'tabbar__item', attrs: { href: item.path, 'data-path': item.path } });
      const iconWrap = el('span', { class: 'tabbar__icon' });
      iconWrap.innerHTML = icon(item.icon, { size: 23 });
      if (item.badge) {
        const badge = el('span', {
          class: `tabbar__badge ${badgeValue(item.badge) ? '' : 'hidden'}`,
          attrs: { 'data-tab-badge': item.badge }
        });
        iconWrap.append(badge);
      }
      link.append(iconWrap);
      link.append(el('span', { text: item.label }));
      tabbar.append(link);
    }
  }
  const topTitle = document.getElementById('topbar-title');
  if (topTitle) topTitle.textContent = '';
  setActiveNav(window.location.pathname);
}

function setActiveNav(pathname) {
  const matchPath = (path) => pathname === path || (path !== '/profile' && pathname.startsWith(`${path}/`));
  document.querySelectorAll('[data-path]').forEach((link) => {
    const path = link.getAttribute('data-path');
    const active = path === '/chats' ? pathname.startsWith('/chat') : matchPath(path);
    link.classList.toggle('is-active', active);
  });
  const title = document.getElementById('topbar-title');
  if (title) {
    const found = NAV_ITEMS.find((item) => matchPath(item.path));
    title.textContent = found ? found.label : '';
  }
}

function updateBadges() {
  const state = getState();
  document.querySelectorAll('[data-badge]').forEach((node) => {
    const value = badgeValue(node.getAttribute('data-badge'));
    node.textContent = value > 0 ? String(value > 99 ? '99+' : value) : '';
    node.classList.toggle('hidden', value <= 0);
  });
  document.querySelectorAll('[data-tab-badge]').forEach((node) => {
    const value = badgeValue(node.getAttribute('data-tab-badge'));
    node.textContent = value > 0 ? String(value > 99 ? '99+' : value) : '';
    node.classList.toggle('hidden', value <= 0);
  });
  const bell = document.getElementById('bell-badge');
  const unread = state.counts.unread_notifications || 0;
  if (bell) {
    bell.textContent = unread > 99 ? '99+' : String(unread || '');
    bell.classList.toggle('hidden', unread <= 0);
  }
}

/* ---------- Sidebar chat previews ---------- */
function chatPreview(match) {
  const last = match.last_message;
  if (!last) return 'Новый матч';
  if (last.deleted) return 'Сообщение удалено';
  if (last.type === 'image') return '📷 Фото';
  if (last.type === 'system') return 'Вы лайкнули друг друга';
  return last.body || '';
}

async function loadSidebarChats() {
  const holder = document.getElementById('sidebar-chats');
  if (!holder) return;
  if (!getState().user) return;
  try {
    const data = await api.get('/matches');
    holder.innerHTML = '';
    const matches = data.matches.slice(0, 8);
    sidebarLoaded = true;
    if (!matches.length) {
      holder.append(
        el('div', {
          class: 'sidebar__chat-preview',
          text: 'Пока нет матчей — свайпайте и находите взаимность',
          style: { padding: '10px 8px', whiteSpace: 'normal' }
        })
      );
      return;
    }
    for (const match of matches) {
      const row = el('a', {
        class: `sidebar__chat ${match.unread ? 'is-unread' : ''}`,
        attrs: { href: `/chat/${match.id}` }
      });
      row.append(avatarNode(match.user, 'sm'));
      const body = el('div', { class: 'sidebar__chat-body' });
      const nameRow = el('div', { class: 'sidebar__chat-name' });
      nameRow.append(el('span', { text: match.user.display_name }));
      if (getState().online.get(match.user.id)) nameRow.append(el('span', { class: 'online-dot' }));
      body.append(nameRow);
      body.append(el('div', { class: 'sidebar__chat-preview', text: chatPreview(match) }));
      row.append(body);
      if (match.unread) row.append(el('span', { class: 'sidebar__chat-dot' }));
      holder.append(row);
    }
  } catch (err) {
    holder.innerHTML = '';
  }
}

/* ---------- Page rendering ---------- */
function notFoundView() {
  const wrap = el('div', { class: 'empty' });
  wrap.style.minHeight = '50vh';
  wrap.append(el('div', { class: 'empty__emoji', text: '🧭' }));
  wrap.append(el('div', { class: 'empty__title', text: 'Страница не найдена' }));
  wrap.append(el('div', { class: 'empty__text', text: 'Возможно, ссылка устарела или страница переехала.' }));
  wrap.append(button('На главную', { onClick: () => navigate(getState().user ? '/swipe' : '/') }));
  return wrap;
}

/* ---------- Owner tools and impersonation ---------- */
function renderImpersonationBanner() {
  const existing = document.getElementById('impersonation-banner');
  if (existing) existing.remove();
  if (!impersonation) return;
  const banner = el('div', { class: 'impersonation-banner', attrs: { id: 'impersonation-banner' } });
  banner.append(
    el('span', {
      text: `Режим владельца: вы вошли как @${getState().user?.username || 'пользователь'}${
        impersonation.read_only ? ' · только просмотр' : ' · полный доступ'
      }`
    })
  );
  const stop = button('Выйти', {
    variant: 'btn-secondary btn-sm',
    onClick: async () => {
      try {
        const data = await api.post('/impersonation/stop');
        if (data.token) setToken(data.token);
        window.location.href = data.logged_out ? '/login' : '/admin';
      } catch (err) {
        toast(err.message || 'Не удалось выйти из режима', 'error');
      }
    }
  });
  banner.append(stop);
  if (impersonation.read_only) {
    const write = button('Включить изменения', {
      variant: 'btn-primary btn-sm',
      onClick: () => openOwnerPassword({
        title: 'Полный доступ к аккаунту',
        submitLabel: 'Включить',
        onSubmit: async (password) => {
          await api.post('/impersonation/enable-write', { password });
          impersonation.read_only = false;
          renderImpersonationBanner();
          toast('Изменения включены', 'success');
        }
      })
    });
    banner.append(write);
  }
  document.body.append(banner);
}

function openOwnerPassword({ title, submitLabel, onSubmit }) {
  const body = el('div', { class: 'col', style: { gap: '12px' } });
  body.append(el('p', { class: 'field__hint', text: 'Подтвердите действие паролем владельца.' }));
  const input = el('input', {
    class: 'input',
    attrs: { type: 'password', autocomplete: 'current-password', placeholder: 'Пароль владельца' }
  });
  body.append(input);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: title || 'Подтверждение', body, footer });
  const cancel = button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() });
  const submit = button(submitLabel || 'Подтвердить', {
    variant: 'btn-primary',
    onClick: async () => {
      if (!input.value) return;
      submit.disabled = true;
      try {
        await onSubmit(input.value);
        modal.close();
      } catch (err) {
        toast(err.message || 'Не удалось подтвердить', 'error');
      } finally {
        submit.disabled = false;
      }
    }
  });
  footer.append(cancel, submit);
  input.focus();
  return modal;
}

function openForcePassword() {
  if (document.getElementById('force-password')) return;
  const body = el('div', { class: 'col', style: { gap: '12px' }, attrs: { id: 'force-password' } });
  body.append(el('p', { class: 'field__hint', text: 'Владелец задал временный пароль. Смените его, чтобы продолжить.' }));
  const current = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Текущий пароль', autocomplete: 'current-password' } });
  const next = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Новый пароль', autocomplete: 'new-password' } });
  const repeat = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Повторите новый пароль', autocomplete: 'new-password' } });
  body.append(current, next, repeat);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Смена пароля', body, footer });
  const submit = button('Сохранить', {
    variant: 'btn-primary',
    onClick: async () => {
      if (next.value.length < 8) return toast('Пароль должен быть не короче 8 символов', 'error');
      if (next.value !== repeat.value) return toast('Пароли не совпадают', 'error');
      submit.disabled = true;
      try {
        const updated = await api.put('/auth/password', { current_password: current.value, new_password: next.value });
        setToken(updated.token);
        const me = await api.get('/auth/me');
        setUser(me.user);
        modal.close();
        toast('Пароль обновлён', 'success');
      } catch (err) {
        toast(err.message || 'Не удалось сменить пароль', 'error');
      } finally {
        submit.disabled = false;
      }
    }
  });
  footer.append(submit);
}

function startIdleWatch() {
  const mark = () => { lastActivity = Date.now(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((event) => window.addEventListener(event, mark, { passive: true }));
  setInterval(() => {
    if (!getState().user) return;
    if (Date.now() - lastActivity < 30 * 60 * 1000) return;
    lastActivity = Date.now();
    api.post('/auth/logout').catch(() => {});
    clearToken();
    disconnectSocket();
    setUser(null);
    toast('Вы вышли из-за неактивности', 'error');
    navigate('/login');
  }, 60 * 1000);
}

function forbiddenView() {
  const wrap = el('div', { class: 'empty' });
  wrap.style.minHeight = '50vh';
  wrap.append(el('div', { class: 'empty__emoji', text: '🔒' }));
  wrap.append(el('div', { class: 'empty__title', text: 'Страница не найдена' }));
  wrap.append(el('div', { class: 'empty__text', text: 'Возможно, ссылка устарела.' }));
  wrap.append(button('На свайпы', { onClick: () => navigate('/swipe') }));
  return wrap;
}

function errorView(error) {
  const wrap = el('div', { class: 'empty' });
  wrap.style.minHeight = '45vh';
  wrap.append(el('div', { class: 'empty__emoji', text: '😕' }));
  wrap.append(el('div', { class: 'empty__title', text: 'Не удалось загрузить страницу' }));
  wrap.append(el('div', { class: 'empty__text', text: error.message || 'Попробуйте обновить страницу.' }));
  wrap.append(button('Повторить', { onClick: () => window.location.reload() }));
  return wrap;
}

async function render(matched) {
  const { route, params, query, pathname } = matched;
  const state = getState();

  if (route.notFound) {
    ensureLayout(state.user ? 'app' : 'public');
    const view = document.getElementById('view');
    if (view) {
      view.innerHTML = '';
      view.append(notFoundView());
    }
    return null;
  }

  if (route.auth && !state.user) {
    navigate(`/login?next=${encodeURIComponent(pathname + window.location.search)}`, { replace: true });
    return null;
  }
  if (route.guestOnly && state.user) {
    navigate('/swipe', { replace: true });
    return null;
  }
  if (route.staff && !isOwner()) {
    ensureLayout('app');
    const view = document.getElementById('view');
    if (view) {
      view.innerHTML = '';
      view.append(forbiddenView());
    }
    return null;
  }

  ensureLayout(route.layout === 'public' ? 'public' : 'app');
  if (route.layout !== 'public') renderImpersonationBanner();
  setActiveNav(pathname);
  const view = document.getElementById('view');
  if (!view) return null;
  view.innerHTML = '';
  view.append(loadingRow());
  // Every page starts at the top; otherwise a long profile keeps the previous scroll.
  window.scrollTo({ top: 0, left: 0 });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  const ctx = {
    params,
    query,
    pathname,
    navigate,
    props: route.pageProps || {}
  };

  try {
    const result = await route.page(ctx);
    const node = result && result.el ? result.el : result;
    if (!document.body.contains(view)) return result;
    view.innerHTML = '';
    if (node) view.append(node);
    const site = getState().site.site_name || 'Wiutgram';
    // Avoid titles like "Wiutgram — Wiutgram" when a page has no own heading.
    document.title = !route.title || route.title === site ? site : `${route.title} — ${site}`;
    if (route.layout !== 'public') loadSidebarChats();
    return result;
  } catch (err) {
    if (err && err.status === 401) return null;
    console.error(err);
    view.innerHTML = '';
    view.append(errorView(err));
    return null;
  }
}

/* ---------- Sound and browser notifications ---------- */
function playMessageSound() {
  if (storageGet('uni:sound') === '0') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!soundContext) soundContext = new AudioCtx();
    const ctx = soundContext;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    gain.connect(ctx.destination);
    [660, 880].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + index * 0.11);
      osc.stop(now + 0.35);
    });
  } catch (err) {
    // Sound is optional; ignore browser restrictions.
  }
}

function browserNotify(title, body) {
  if (storageGet('uni:push') !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    new Notification(title, { body, icon: '/img/logo.svg', tag: `uni-${Date.now()}` });
  } catch (err) {
    // Notification failures are not fatal.
  }
}

function notificationLabel(notification) {
  const actor = notification.actor ? notification.actor.display_name : 'Кто-то';
  switch (notification.type) {
    case 'like':
      return `${actor} лайкнул(а) ваш профиль`;
    case 'super_like':
      return `${actor} отправил(а) суперлайк ⭐`;
    case 'match':
      return `Новый матч с ${actor}`;
    case 'message':
      return `${actor}: ${notification.text || 'Новое сообщение'}`;
    case 'comment':
      return `${actor} ${notification.text ? notification.text.toLowerCase() : 'оставил(а) комментарий'}`;
    case 'post_like':
      return `${actor} лайкнул(а) ваш пост`;
    case 'profile_view':
      return `${actor} посмотрел(а) ваш профиль`;
    case 'story_view':
      return `${actor} посмотрел(а) вашу историю`;
    default:
      return notification.text || 'Новое уведомление';
  }
}

function activeMatchId() {
  return Number(getState().activeMatchId) || 0;
}

function registerRealtime() {
  onSocket('notification:new', (notification) => {
    incrementCount('unread_notifications');
    const isCurrentChat = notification.type === 'message' && Number(notification.ref_id) === activeMatchId();
    if (!isCurrentChat) {
      toast(notificationLabel(notification));
      playMessageSound();
    }
    browserNotify('Wiutgram', notificationLabel(notification));
  });
  onSocket('notification:count', ({ unread }) => setCounts({ unread_notifications: unread || 0 }));
  onSocket('message:new', ({ message, match_id }) => {
    const state = getState();
    if (!state.user || !message) return;
    if (message.sender_id !== state.user.id && Number(match_id) !== activeMatchId()) {
      incrementCount('unread_messages');
      if (document.visibilityState !== 'visible') loadSidebarChats();
    }
  });
  onSocket('message:read', () => {
    loadSidebarChats();
  });
  onSocket('match:removed', () => {
    toast('Матч завершён. Диалог удалён.');
    loadSidebarChats();
  });
  onSocket('match:new', ({ match }) => {
    loadSidebarChats();
    showMatchScreen(match, { me: getState().user });
    if (document.visibilityState !== 'visible') browserNotify('Это взаимно!', `У вас новый матч: ${match.user.display_name}`);
  });
  onSocket('likes:count', ({ likes }) => setCounts({ likes: Number(likes) || 0 }));
  onSocket('presence:update', ({ user_id, online }) => setOnline(user_id, online));
  onSocket('account:banned', ({ reason }) => {
    toast(reason || 'Аккаунт заблокирован', 'error', 6000);
    setUser(null);
    navigate('/login');
  });
}

/* ---------- Global listeners ---------- */
function registerGlobalEvents() {
  window.addEventListener('uni:unauthorized', () => {
    const state = getState();
    if (!state.user) return;
    setUser(null);
    disconnectSocket();
    toast('Сессия истекла, войдите снова', 'error');
    navigate('/login');
  });
  window.addEventListener('uni:banned', (event) => {
    toast(event.detail?.ban_reason || 'Аккаунт заблокирован', 'error', 6000);
    clearToken();
    setUser(null);
    navigate('/login');
  });
  window.addEventListener('uni:maintenance', () => {
    toast('Сайт на техническом обслуживании', 'error');
  });
  window.addEventListener('uni:auth-changed', () => {
    // Rebuild either shell so the public topbar reflects the new auth state.
    layout = null;
    const state = getState();
    if (state.user) {
      initSocket();
      sidebarLoaded = false;
      renderSidebarProfile();
      renderNav();
      updateBadges();
      loadSidebarChats();
    } else {
      disconnectSocket();
      renderNav();
    }
  });
  subscribe((state, meta) => {
    updateBadges();
    if (meta && meta.type === 'user') {
      renderSidebarProfile();
      if (layout === 'app') renderNav();
      loadSidebarChats();
    }
    if (meta && meta.type === 'counts') updateBadges();
  });
  attachRipples(document);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

async function boot() {
  watchSystemTheme();
  applyTheme('auto');
  registerGlobalEvents();
  registerRealtime();

  try {
    const site = await api.get('/settings/site');
    setSite(site);
    applyTheme(getState().user ? getState().user.theme : 'auto');
  } catch (err) {
    // Site settings are non fatal.
  }

  try {
    const data = await api.get('/auth/me');
    setUser(data.user);
    setCounts(data.counts || {});
  } catch (err) {
    setUser(null);
  }
  if (getState().user) {
    applyTheme(getState().user.theme || 'auto');
    initSocket();
  }
  try {
    const me = await api.get('/auth/me');
    impersonation = me.impersonation || null;
    if (me.user && me.user.force_password_change) openForcePassword();
  } catch (err) {
    impersonation = null;
  }
  startIdleWatch();

  defineRoutes(ROUTES);
  setRenderer(render);
  startRouter();
  registerServiceWorker();
}

boot();
