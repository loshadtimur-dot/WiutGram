import { icon } from './icons.js?v=18';

// Element factory: el('div', 'class', {attrs}) or el('button', {class, text, onclick})
export function el(tag, options = null, children = null) {
  const node = document.createElement(tag);
  if (typeof options === 'string') {
    node.className = options;
  } else if (options && typeof options === 'object') {
    if (options.class) node.className = options.class;
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.html !== undefined) node.innerHTML = options.html;
    if (options.attrs) {
      for (const [key, value] of Object.entries(options.attrs)) {
        if (value === null || value === undefined || value === false) continue;
        node.setAttribute(key, String(value));
      }
    }
    if (options.style) Object.assign(node.style, options.style);
    if (options.on) {
      for (const [event, handler] of Object.entries(options.on)) node.addEventListener(event, handler);
    }
  }
  if (children) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function svgIcon(name, options = {}) {
  const span = el('span', { class: 'role-icon' });
  span.innerHTML = icon(name, options);
  return span;
}

export function button(text, options = {}) {
  const node = el('button', {
    class: `btn ${options.variant || 'btn-primary'} ${options.class || ''}`,
    attrs: { type: options.type || 'button', ...(options.attrs || {}) }
  });
  if (options.icon) node.append(svgIcon(options.icon, { size: options.iconSize || 18 }));
  if (text) node.append(el('span', { text }));
  if (options.onClick) node.addEventListener('click', options.onClick);
  if (options.disabled) node.disabled = true;
  return node;
}

export function iconButton(name, options = {}) {
  const node = el('button', {
    class: `btn-icon ${options.class || ''}`,
    attrs: { type: 'button', 'aria-label': options.label || name, title: options.label || '' }
  });
  node.innerHTML = icon(name, { size: options.size || 20 });
  if (options.onClick) node.addEventListener('click', options.onClick);
  return node;
}

export function formatNumber(value) {
  const num = Number(value) || 0;
  if (num >= 1000000) return `${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1).replace('.0', '')}M`;
  if (num >= 1000) {
    const short = (num / 1000).toFixed(num >= 10000 || num % 1000 === 0 ? 0 : 1);
    return `${short.replace('.0', '')}K`;
  }
  return String(num);
}

export function plural(count, one, few, many) {
  const n = Math.abs(Number(count) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} ${plural(mins, 'минуту', 'минуты', 'минут')} назад`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`;
  }
  if (diff < 86400 * 7) {
    const days = Math.floor(diff / 86400);
    return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortTimeAgo(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'сейчас';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} д`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric' });
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Сегодня';
  if (same(date, yesterday)) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function lastSeenLabel(online, lastSeen) {
  if (online) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';
  return `был(а) ${timeAgo(lastSeen)}`;
}

export function initials(name) {
  if (!name) return '?';
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

const PALETTE = [
  ['#4C5FD7', '#8A98E8'],
  ['#2E9E6B', '#7CC4A4'],
  ['#7C5CD6', '#B3A2EC'],
  ['#5B6C8F', '#9AA9C6'],
  ['#8B7355', '#C3B099'],
  ['#3C7A89', '#86B4BF']
];

export function colorFor(value) {
  let hash = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 100000;
  return PALETTE[hash % PALETTE.length];
}

export function gradientFor(value) {
  const [from, to] = colorFor(value);
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function avatarNode(user, size = 'md', options = {}) {
  const node = el('span', { class: `avatar avatar--${size} ${options.class || ''}` });
  const name = user && (user.display_name || user.username);
  node.style.background = gradientFor(name || 'uni');
  const img = el('img', {
    attrs: {
      alt: name ? `Фото ${name}` : 'Фото профиля',
      loading: 'lazy',
      src: user && user.avatar_path ? user.avatar_path : ''
    }
  });
  if (!user || !user.avatar_path) {
    node.textContent = initials(name);
    return node;
  }
  img.addEventListener('error', () => {
    img.remove();
    node.textContent = initials(name);
  });
  node.append(img);
  return node;
}

export function emptyState(emoji, title, text, action) {
  const wrap = el('div', { class: 'empty' });
  wrap.append(el('div', { class: 'empty__emoji', text: emoji }));
  wrap.append(el('div', { class: 'empty__title', text: title }));
  if (text) wrap.append(el('div', { class: 'empty__text', text }));
  if (action) wrap.append(action);
  return wrap;
}

export function loadingRow(label = 'Загружаем…') {
  const row = el('div', { class: 'loading-row' });
  row.append(el('div', { class: 'spinner spinner--sm' }));
  row.append(el('span', { text: label }));
  return row;
}

export function skeletonGrid(count = 6) {
  const grid = el('div', { class: 'likes-grid' });
  for (let i = 0; i < count; i += 1) grid.append(el('div', { class: 'skeleton skeleton-card' }));
  return grid;
}

/* Toasts */
export function toast(message, type = 'default', duration = 3200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = el('div', { class: `toast ${type !== 'default' ? `toast--${type}` : ''}` });
  if (type === 'success') node.append(svgIcon('check', { size: 17 }));
  if (type === 'error') node.append(svgIcon('alert', { size: 17 }));
  node.append(el('span', { text: message }));
  root.append(node);
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  }, duration);
}

/* Modals */
let openModals = 0;

export function openModal(options = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', {
    class: `modal ${options.size === 'wide' ? 'modal--wide' : ''} ${
      options.size === 'full' ? 'modal--full' : ''
    } ${options.class || ''}`,
    attrs: { role: 'dialog', 'aria-modal': 'true' }
  });

  if (options.title !== undefined || options.headExtra) {
    const head = el('div', { class: 'modal__head' });
    head.append(el('div', { class: 'modal__title', text: options.title || '' }));
    if (options.headExtra) head.append(options.headExtra);
    const closeBtn = el('button', { class: 'modal__close', attrs: { type: 'button', 'aria-label': 'Закрыть' } });
    closeBtn.innerHTML = icon('x', { size: 18 });
    closeBtn.addEventListener('click', () => close());
    head.append(closeBtn);
    modal.append(head);
  }

  const body = el('div', { class: `modal__body ${options.flush ? 'modal__body--flush' : ''}` });
  if (options.body instanceof Node) body.append(options.body);
  else if (typeof options.body === 'string') body.innerHTML = options.body;
  modal.append(body);

  if (options.footer) {
    const foot = el('div', { class: 'modal__foot' });
    if (options.footer instanceof Node) foot.append(options.footer);
    else foot.innerHTML = options.footer;
    modal.append(foot);
  }

  backdrop.append(modal);
  root.append(backdrop);
  openModals += 1;
  document.body.style.overflow = 'hidden';

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    openModals = Math.max(0, openModals - 1);
    backdrop.remove();
    if (openModals === 0) document.body.style.overflow = '';
    if (options.onClose) options.onClose();
  }

  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop && options.dismissible !== false) close();
  });
  const onKey = (event) => {
    if (event.key === 'Escape' && options.dismissible !== false) {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  return { close, modal, body, backdrop };
}

export function confirmDialog(options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const wrap = el('div', { class: 'col' });
    wrap.append(el('p', { class: 'confirm-text', text: options.message || 'Вы уверены?' }));
    if (options.extra) wrap.append(options.extra);

    const footer = el('div', { class: 'row' });
    const cancel = button(options.cancelText || 'Отмена', {
      variant: 'btn-secondary',
      onClick: () => {
        settled = true;
        modal.close();
        resolve(false);
      }
    });
    const confirm = button(options.confirmText || 'Подтвердить', {
      variant: options.danger ? 'btn-danger' : 'btn-primary',
      onClick: () => {
        settled = true;
        modal.close();
        resolve(true);
      }
    });
    footer.append(cancel, confirm);
    const modal = openModal({
      title: options.title || 'Подтверждение',
      body: wrap,
      footer,
      dismissible: options.dismissible !== false,
      onClose: () => {
        if (!settled) resolve(false);
      }
    });
    setTimeout(() => confirm.focus(), 60);
  });
}

/* Password input with a visibility toggle */
export function passwordField(label, options = {}) {
  const field = el('label', { class: 'field' });
  const labelRow = el('span', { class: 'field__label' });
  labelRow.append(el('span', { text: label }));
  field.append(labelRow);

  const group = el('div', { class: 'input-group' });
  const input = el('input', {
    class: 'input',
    attrs: {
      type: 'password',
      name: options.name || 'password',
      autocomplete: options.autocomplete || 'current-password',
      placeholder: options.placeholder || '••••••••',
      required: options.required ? 'required' : null
    }
  });
  const toggle = el('button', {
    class: 'input-group__action',
    attrs: { type: 'button', 'aria-label': 'Показать пароль' }
  });
  toggle.innerHTML = icon('eye', { size: 18 });
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });
  group.append(input, toggle);
  field.append(group);
  if (options.hint) field.append(el('span', { class: 'field__hint', text: options.hint }));
  return { field, input };
}

export function dispatchRipple(event) {
  const target = event.currentTarget;
  if (!target || !target.classList || target.classList.contains('btn-icon')) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = el('span', { class: 'ripple' });
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.append(ripple);
  setTimeout(() => ripple.remove(), 650);
}

export function attachRipples(root = document) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('.btn, .action-btn, .chat-send');
    if (target) dispatchRipple({ currentTarget: target, clientX: event.clientX, clientY: event.clientY });
  });
}

export function looksForLabel(value) {
  return (
    {
      relationship: 'Отношения',
      dating: 'Свидания',
      friends: 'Дружба',
      chat: 'Просто общение',
      not_sure: 'Пока не знаю'
    }[value] || 'Пока не знаю'
  );
}

export function genderLabel(value) {
  return { male: 'Мужчина', female: 'Женщина', other: 'Другое' }[value] || 'Другое';
}

export function interestedLabel(value) {
  return { male: 'Мужчин', female: 'Женщин', everyone: 'Всех' }[value] || 'Всех';
}

export function ruleBadges(user) {
  const wrap = el('span', { class: 'profile-name-badges' });
  if (user.role === 'owner') {
    const badge = el('span', { class: 'owner-chip', attrs: { title: 'Владелец сайта' } });
    badge.innerHTML = icon('crown', { size: 11 });
    badge.append(el('span', { text: 'Владелец' }));
    wrap.append(badge);
  }
  if (user.is_verified) {
    const badge = el('span', { class: 'verified', attrs: { title: 'Проверенный профиль' } });
    badge.innerHTML = icon('verified', { size: 17, fill: true, stroke: 0 });
    wrap.append(badge);
  }
  if (user.is_demo) wrap.append(el('span', { class: 'badge badge--demo', text: 'DEMO' }));
  return wrap;
}
