import { api } from './api.js?v=19';

const listeners = new Set();

export const state = {
  user: null,
  site: {
    site_name: 'UNI Lovers',
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
    applyTheme(user.theme || 'auto');
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

// Applies light/dark theme, resolving "auto" against the OS preference.
export function applyTheme(theme = 'auto') {
  const stored = theme || 'auto';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = stored === 'auto' ? (prefersDark ? 'dark' : 'light') : stored;
  document.documentElement.setAttribute('data-theme', resolved);
  state.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#111418' : '#FD267A');
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
