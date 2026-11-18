import { api } from '../../api.js?v=25';
import { el, button, openModal, toast } from '../../ui.js?v=25';

const COURSE_LABELS = {
  '1': '1 курс',
  '2': '2 курс',
  '3': '3 курс',
  '4': '4 курс',
  '5': '5 курс',
  '6': '6 курс',
  master: 'Магистратура',
  graduate: 'Выпускник',
  phd: 'Аспирант'
};

export function courseLabel(value) {
  return value ? COURSE_LABELS[String(value)] || String(value) : '—';
}

export function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function sectionHead(title, subtitle, actions) {
  const head = el('div', { class: 'admin-head' });
  const text = el('div');
  text.append(el('h1', { text: title }));
  if (subtitle) text.append(el('p', { class: 'admin-head__sub', text: subtitle }));
  head.append(text);
  if (actions) {
    const wrap = el('div', { class: 'row' });
    if (Array.isArray(actions)) actions.forEach((action) => wrap.append(action));
    else wrap.append(actions);
    head.append(wrap);
  }
  return head;
}

export function emptyState(text, action) {
  const box = el('div', { class: 'admin-empty' });
  box.append(el('p', { text }));
  if (action) box.append(action);
  return box;
}

export function chip(text, variant = '') {
  return el('span', { class: `admin-chip ${variant ? `admin-chip--${variant}` : ''}`, text });
}

export function statusChips(user) {
  const wrap = el('div', { class: 'admin-chips' });
  if (user.role === 'owner') wrap.append(chip('Владелец', 'owner'));
  if (user.is_banned) wrap.append(chip('Бан', 'banned'));
  if (user.shadow_banned) wrap.append(chip('Теневой бан', 'banned'));
  if (user.is_verified) wrap.append(chip('Студент', 'verified'));
  if (user.is_demo) wrap.append(chip('DEMO', 'demo'));
  if (!user.is_banned && !user.shadow_banned) wrap.append(chip('Активен'));
  return wrap;
}

// Asks for the owner password once, then runs a sensitive request.
export function sudoConfirm({ title, description, submitLabel = 'Подтвердить', onConfirm }) {
  const body = el('div', { class: 'col', style: { gap: '12px' } });
  if (description) body.append(el('p', { class: 'field__hint', text: description }));
  body.append(
    el('p', { class: 'field__hint', text: 'Для безопасности подтвердите действие паролем владельца. Подтверждение действует 10 минут.' })
  );
  const password = el('input', {
    class: 'input',
    attrs: { type: 'password', placeholder: 'Пароль владельца', autocomplete: 'current-password' }
  });
  body.append(password);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: title || 'Подтверждение', body, footer });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
  const submit = button(submitLabel, {
    variant: 'btn-primary',
    onClick: async () => {
      if (!password.value) return;
      submit.disabled = true;
      try {
        await api.post('/admin/reauth', { password: password.value });
        const result = await onConfirm();
        modal.close();
        if (result !== false) toast('Готово', 'success');
      } catch (err) {
        toast(err.message || 'Не удалось выполнить действие', 'error');
        submit.disabled = false;
      }
    }
  });
  footer.append(submit);
  password.focus();
  return modal;
}

// Simple confirmation with optional text confirmation (username, ПЕРЕДАТЬ).
export function confirmDialog({ title, text, confirmLabel = 'Удалить', danger = false, expectedText, onConfirm }) {
  const body = el('div', { class: 'col', style: { gap: '12px' } });
  if (text) body.append(el('p', { text }));
  const input = expectedText
    ? el('input', { class: 'input', attrs: { placeholder: `Введите «${expectedText}»` } })
    : null;
  if (input) body.append(input);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: title || 'Подтверждение', body, footer });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
  const submit = button(confirmLabel, {
    variant: danger ? 'btn-danger' : 'btn-primary',
    onClick: async () => {
      if (input && input.value.trim() !== expectedText) {
        toast(`Введите «${expectedText}» для подтверждения`, 'error');
        return;
      }
      submit.disabled = true;
      try {
        await onConfirm();
        modal.close();
        toast('Готово', 'success');
      } catch (err) {
        toast(err.message || 'Не удалось выполнить действие', 'error');
        submit.disabled = false;
      }
    }
  });
  footer.append(submit);
  return modal;
}

export function textField(label, value, { type = 'text', placeholder = '', hint = '' } = {}) {
  const field = el('label', { class: 'field' });
  field.append(el('span', { class: 'field__label', text: label }));
  const input = el('input', { class: 'input', attrs: { type, placeholder } });
  input.value = value === null || value === undefined ? '' : String(value);
  field.append(input);
  if (hint) field.append(el('span', { class: 'field__hint', text: hint }));
  return { field, input };
}

export function textArea(label, value, maxlength = 500) {
  const field = el('label', { class: 'field' });
  field.append(el('span', { class: 'field__label', text: label }));
  const input = el('textarea', { class: 'textarea', attrs: { rows: '3', maxlength: String(maxlength) } });
  input.value = value || '';
  field.append(input);
  return { field, input };
}

export function selectField(label, value, options, hint = '') {
  const field = el('label', { class: 'field' });
  field.append(el('span', { class: 'field__label', text: label }));
  const select = el('select', { class: 'select' });
  for (const [optionValue, optionLabel] of options) {
    select.append(el('option', { text: optionLabel, attrs: { value: String(optionValue) } }));
  }
  select.value = value === null || value === undefined ? '' : String(value);
  field.append(select);
  if (hint) field.append(el('span', { class: 'field__hint', text: hint }));
  return { field, select };
}

export function switchField(label, checked, hint = '') {
  const row = el('label', { class: 'switch' });
  const text = el('div', { class: 'switch__text' });
  text.append(el('div', { class: 'switch__title', text: label }));
  if (hint) text.append(el('div', { class: 'switch__desc', text: hint }));
  const input = el('input', { attrs: { type: 'checkbox' } });
  input.checked = !!checked;
  row.append(text, input);
  return { row, input };
}

export function pager({ total, limit, offset, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const current = Math.floor(offset / limit) + 1;
  const wrap = el('div', { class: 'admin-pager' });
  wrap.append(el('span', { class: 'field__hint', text: `Всего: ${total}` }));
  const prev = button('Назад', {
    variant: 'btn-secondary btn-sm',
    onClick: () => onChange(Math.max(0, offset - limit))
  });
  prev.disabled = current <= 1;
  const next = button('Далее', {
    variant: 'btn-secondary btn-sm',
    onClick: () => onChange(Math.min((pages - 1) * limit, offset + limit))
  });
  next.disabled = current >= pages;
  wrap.append(el('span', { class: 'field__hint', text: `${current} / ${pages}` }), prev, next);
  return wrap;
}

export function table(headers, rows) {
  const wrap = el('div', { class: 'admin-table-wrap' });
  const tableEl = el('table', { class: 'admin-table' });
  const thead = el('thead');
  const headRow = el('tr');
  headers.forEach((header) => headRow.append(el('th', { text: header })));
  thead.append(headRow);
  const tbody = el('tbody');
  rows.forEach((row) => tbody.append(row));
  tableEl.append(thead, tbody);
  wrap.append(tableEl);
  return wrap;
}
