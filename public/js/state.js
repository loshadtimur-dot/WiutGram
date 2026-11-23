import { api } from './api.js?v=31';

const listeners = new Set();

export const state = {
  user: null,
  site: {
    site_name: 'Wiutgram',
    registration_open: true,
    maintenance_mode: false,
    welcome_message: ''
  },
  counts: {
    unread_notifications: 0,
    likes: 0,
    unread_messages: 0
  },
  online: new Map(),
  typing: new Map(),
  theme: 'light',
  unreadByMatch: new Map(),
  ready: false
};

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyState(meta = {}) {
  for (const fn of listeners) {
    try {
      fn(state, meta);
    } catch (err) {
      console.error('state listener failed', err);
    }
  }
}

export function setSite(site) {
  state.site = { ...state.site, ...(site || {}) };
  notifyState({ type: 'site' });
}

export function setUser(user) {
  state.user = user;
  if (user) {
    state.online.set(user.id, true);
    applyTheme(user.theme && user.theme !== 'auto' ? user.theme : storedTheme() || 'auto');
  }
  notifyState({ type: 'user' });
}

export function patchUser(patch) {
  if (!state.user) return;
  state.user = { ...state.user, ...patch };
  if (patch.theme) applyTheme(patch.theme);
  notifyState({ type: 'user' });
}

export function setCounts(patch) {
  state.counts = { ...state.counts, ...patch };
  notifyState({ type: 'counts' });
}

export function incrementCount(key, delta = 1) {
  state.counts[key] = Math.max(0, (state.counts[key] || 0) + delta);
  notifyState({ type: 'counts' });
}

export function setOnline(userId, online, lastSeen = null) {
  if (!userId) return;
  state.online.set(Number(userId), !!online);
  if (lastSeen && state.user && Number(userId) !== state.user.id) {
    // Last seen is refreshed through API responses when needed.
  }
  notifyState({ type: 'presence', userId: Number(userId), online: !!online });
}

export function isStaff() {
  return isOwner();
}

export function isOwner() {
  return !!state.user && state.user.role === 'owner';
}

export async function refreshMe() {
  try {
    const data = await api.get('/auth/me');
    setUser(data.user);
    setCounts(data.counts || {});
    return data.user;
  } catch (err) {
    return null;
  }
}

const THEME_KEY = 'wg_theme';

// A guest theme choice survives reloads; a saved account theme still wins.
export function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (err) {
    return null;
  }
}

export function setTheme(theme) {
  try {
    if (theme === 'light' || theme === 'dark') localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch (err) {
    // Private mode can block localStorage; the theme still applies for this page.
  }
  applyTheme(theme);
}

// Applies light/dark theme, resolving "auto" against the OS preference.
export function applyTheme(theme = 'auto') {
  const stored = theme || 'auto';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = stored === 'auto' ? (prefersDark ? 'dark' : 'light') : stored;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  state.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#111418' : '#FD267A');
  document.dispatchEvent(new CustomEvent('wg:theme', { detail: { theme: resolved } }));
}

export function watchSystemTheme() {
  if (!window.matchMedia) return;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if ((state.user && state.user.theme === 'auto') || (!state.user && state.themePref === 'auto')) {
      applyTheme('auto');
    }
  };
  if (query.addEventListener) query.addEventListener('change', handler);
}

export function setUnreadForMatch(matchId, count) {
  if (!matchId) return;
  if (count > 0) state.unreadByMatch.set(Number(matchId), count);
  else state.unreadByMatch.delete(Number(matchId));
  notifyState({ type: 'unread-match' });
}
