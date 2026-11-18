import { api } from '../api.js?v=18';
import { el, button, openModal, toast } from '../ui.js?v=18';
import { patchUser, getState } from '../state.js?v=18';

const COURSE_OPTIONS = [
  ['1', '1 курс'],
  ['2', '2 курс'],
  ['3', '3 курс'],
  ['4', '4 курс'],
  ['5', '5 курс'],
  ['6', '6 курс'],
  ['master', 'Магистратура'],
  ['graduate', 'Выпускник'],
  ['phd', 'Аспирант']
];

function dualRange(min, max, minLimit, maxLimit, onChange) {
  const wrap = el('div', { class: 'range-wrap' });
  const track = el('div', { class: 'range-track' });
  const fill = el('div', { class: 'range-fill' });
  const low = el('input', { attrs: { type: 'range', min: minLimit, max: maxLimit, value: min, 'aria-label': 'Минимум' } });
  const high = el('input', { attrs: { type: 'range', min: minLimit, max: maxLimit, value: max, 'aria-label': 'Максимум' } });
  wrap.append(track, fill, low, high);

  const paint = () => {
    const total = maxLimit - minLimit;
    const left = ((Number(low.value) - minLimit) / total) * 100;
    const right = ((Number(high.value) - minLimit) / total) * 100;
    fill.style.left = `${left}%`;
    fill.style.width = `${Math.max(0, right - left)}%`;
  };

  const sync = (source) => {
    let a = Number(low.value);
    let b = Number(high.value);
    if (a > b) {
      if (source === 'low') b = a;
      else a = b;
      low.value = String(a);
      high.value = String(b);
    }
    paint();
    onChange(a, b);
  };
  low.addEventListener('input', () => sync('low'));
  high.addEventListener('input', () => sync('high'));
  paint();
  return { wrap, low, high, set(a, b) { low.value = String(a); high.value = String(b); paint(); } };
}

export async function openFiltersModal(filters, onSaved) {
  const state = getState();
  const body = el('div', { class: 'col', style: { gap: '18px' } });

  const ageLabel = el('div', { class: 'field__label' });
  ageLabel.append(el('span', { text: 'Возраст' }));
  const ageValue = el('span', { class: 'field__hint' });
  ageLabel.append(ageValue);
  const ageRange = dualRange(
    Number(filters.age_min) || 18,
    Number(filters.age_max) || 99,
    18,
    99,
    (a, b) => {
      ageValue.textContent = `${a} – ${b} лет`;
    }
  );
  ageValue.textContent = `${ageRange.low.value} – ${ageRange.high.value} лет`;
  body.append(ageLabel, ageRange.wrap);

  const showLabel = el('div', { class: 'field__label', text: 'Показывать' });
  const segmented = el('div', { class: 'segmented' });
  let interestedIn = filters.interested_in || state.user?.interested_in || 'everyone';
  const options = [
    ['male', 'Мужчин'],
    ['female', 'Женщин'],
    ['everyone', 'Всех']
  ];
  options.forEach(([value, label]) => {
    const item = el('button', {
      class: `segmented__item ${interestedIn === value ? 'is-active' : ''}`,
      text: label,
      attrs: { type: 'button' }
    });
    item.addEventListener('click', () => {
      interestedIn = value;
      segmented.querySelectorAll('.segmented__item').forEach((node) => node.classList.remove('is-active'));
      item.classList.add('is-active');
    });
    segmented.append(item);
  });
  body.append(showLabel, segmented);
  body.append(el('div', { class: 'divider' }));

  const universityLabel = el('div', { class: 'field__label', text: 'Университет' });
  const universitySelect = el('select', { class: 'select' });
  universitySelect.append(el('option', { text: 'Все университеты', attrs: { value: '' } }));
  try {
    const data = await api.get('/universities');
    for (const university of data.universities || []) {
      universitySelect.append(
        el('option', { text: `${university.short_name} — ${university.name}`, attrs: { value: String(university.id) } })
      );
    }
  } catch (err) {
    // The list is optional in the filter dialog.
  }
  universitySelect.value = filters.filter_university_id ? String(filters.filter_university_id) : '';
  body.append(universityLabel, universitySelect);

  const courseLabel = el('div', { class: 'field__label', text: 'Курс' });
  const courseSelect = el('select', { class: 'select' });
  courseSelect.append(el('option', { text: 'Любой курс', attrs: { value: '' } }));
  for (const [value, label] of COURSE_OPTIONS) {
    courseSelect.append(el('option', { text: label, attrs: { value } }));
  }
  courseSelect.value = filters.filter_course || '';
  body.append(courseLabel, courseSelect);

  const preferRow = el('label', { class: 'switch-row' });
  const preferInput = el('input', { attrs: { type: 'checkbox' } });
  preferInput.checked = filters.prefer_my_university === undefined ? true : !!filters.prefer_my_university;
  preferRow.append(preferInput, el('span', { text: 'Сначала показывать студентов моего университета' }));
  body.append(preferRow);

  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Фильтры поиска', body, footer });

  const reset = button('Сбросить', {
    variant: 'btn-ghost',
    onClick: () => {
      ageRange.set(18, 99);
      ageValue.textContent = '18 – 99 лет';
      interestedIn = 'everyone';
      segmented.querySelectorAll('.segmented__item').forEach((node, index) => {
        node.classList.toggle('is-active', index === 2);
      });
      universitySelect.value = '';
      courseSelect.value = '';
      preferInput.checked = true;
    }
  });

  const save = button('Применить', {
    variant: 'btn-primary',
    onClick: async () => {
      save.disabled = true;
      try {
        const data = await api.put('/users/me/settings', {
          filter_age_min: Number(ageRange.low.value),
          filter_age_max: Number(ageRange.high.value),
          filter_university_id: universitySelect.value ? Number(universitySelect.value) : null,
          filter_course: courseSelect.value || null,
          prefer_my_university: preferInput.checked,
          interested_in: interestedIn
        });
        patchUser({
          filter_age_min: data.user.filter_age_min,
          filter_age_max: data.user.filter_age_max,
          filter_university_id: data.user.filter_university_id,
          filter_course: data.user.filter_course,
          prefer_my_university: data.user.prefer_my_university,
          interested_in: data.user.interested_in
        });
        toast('Фильтры сохранены', 'success');
        modal.close();
        if (onSaved) onSaved(data.user);
      } catch (err) {
        toast(err.message || 'Не удалось сохранить фильтры', 'error');
      } finally {
        save.disabled = false;
      }
    }
  });
  footer.append(reset, save);
  return modal;
}
