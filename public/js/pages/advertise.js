import { api } from '../api.js?v=24';
import { el, button, toast, openModal } from '../ui.js?v=24';
import { icon } from '../icons.js?v=24';
import {
  TASHKENT_OFFSET,
  tashkentParts,
  hourOf,
  hourLabel,
  hourRangeLabel,
  dayLabel,
  dayChipLabel,
  formatSum,
  priceForHours,
  groupHours,
  groupLabel,
  copyText
} from '../ads-utils.js?v=24';

const QUICK_RANGES = [
  { label: 'Утро 08–12', from: 8, to: 12 },
  { label: 'День 12–18', from: 12, to: 18 },
  { label: 'Вечер 18–24', from: 18, to: 24 },
  { label: 'Весь день', from: 0, to: 24 }
];

function mockups() {
  const wrap = el('div', { class: 'adv-places__grid', attrs: { 'aria-hidden': 'true' } });

  const phone = el('div', { class: 'adv-mock adv-mock--swipe' });
  phone.append(el('div', { class: 'adv-mock__line adv-mock__line--title' }));
  phone.append(el('div', { class: 'adv-mock__banner' }, [el('span', { text: 'Ваш баннер 4:1' })]));
  phone.append(
    el('div', { class: 'adv-mock__cards' }, [
      el('div', { class: 'adv-mock__card' }),
      el('div', { class: 'adv-mock__card' }),
      el('div', { class: 'adv-mock__card' })
    ])
  );
  phone.append(el('div', { class: 'adv-mock__row' }, [el('i'), el('i'), el('i'), el('i')]));

  const profile = el('div', { class: 'adv-mock adv-mock--profile' });
  profile.append(
    el('div', { class: 'adv-mock__profile-head' }, [
      el('div', { class: 'adv-mock__avatar' }),
      el('div', { class: 'adv-mock__profile-text' }, [
        el('span', { class: 'adv-mock__line adv-mock__line--name' }),
        el('span', { class: 'adv-mock__line adv-mock__line--short' })
      ]),
      el('div', { class: 'adv-mock__stats' }, [
        el('span', { text: '128' }),
        el('span', { text: '46' }),
        el('span', { text: '12' })
      ])
    ])
  );
  profile.append(el('div', { class: 'adv-mock__banner' }, [el('span', { text: 'Ваш баннер 4:1' })]));
  profile.append(
    el('div', { class: 'adv-mock__tabs' }, [el('i'), el('i'), el('i')])
  );
  profile.append(el('div', { class: 'adv-mock__photos' }, [el('div'), el('div'), el('div')]));

  wrap.append(
    el('figure', { class: 'adv-place' }, [phone, el('figcaption', { text: 'Экран свайпов — над колодой карточек' })]),
    el('figure', { class: 'adv-place' }, [profile, el('figcaption', { text: 'Профиль — под шапкой, над вкладками' })])
  );
  return wrap;
}

export default async function AdvertisePage() {
  let config = null;
  let availability = null;
  let selected = new Set();
  let activeDayIndex = 0;
  let view = 'day';
  let dragging = false;
  let dragMode = 'add';
  let submitting = false;

  const root = el('div', { class: 'advertise' });
  const loading = el('div', { class: 'adv-loading' });
  loading.append(el('div', { class: 'skeleton', style: { height: '120px', borderRadius: '20px' } }));
  loading.append(el('div', { class: 'skeleton', style: { height: '320px', borderRadius: '20px' } }));
  root.append(loading);

  try {
    const [configData, availabilityData] = await Promise.all([
      api.get('/ads/config'),
      api.get('/ads/availability')
    ]);
    config = configData;
    availability = availabilityData;
  } catch (err) {
    root.innerHTML = '';
    const empty = el('div', { class: 'empty' });
    empty.append(el('div', { class: 'empty__title', text: 'Страница рекламы недоступна' }));
    empty.append(el('p', { class: 'empty__text', text: 'Попробуйте обновить страницу позже.' }));
    root.append(empty);
    return root;
  }

  root.innerHTML = '';

  // Start on the first day that still has bookable hours (today may be over).
  const firstBookableDay = availability.days.findIndex((day) =>
    day.hours.some((hour) => hour.status === 'free')
  );
  if (firstBookableDay > 0) activeDayIndex = firstBookableDay;

  if (!config.enabled) {
    const empty = el('div', { class: 'empty' });
    empty.append(el('div', { class: 'empty__title', text: 'Реклама временно недоступна' }));
    empty.append(el('p', { class: 'empty__text', text: 'Мы скоро вернёмся. Спасибо за интерес к Wiutgram.' }));
    empty.append(button('На главную', { onClick: () => { window.location.href = '/'; } }));
    root.append(empty);
    return root;
  }

  function hoursOfDay(dayIndex) {
    return availability.days[dayIndex] ? availability.days[dayIndex].hours : [];
  }

  function dayHours(dayIndex) {
    return availability.days[dayIndex].day_key;
  }

  function isSelectable(hour) {
    return hour.status === 'free';
  }

  function toggleHour(hourStart, forceAdd) {
    const add = forceAdd === undefined ? !selected.has(hourStart) : forceAdd;
    if (add) {
      if (selected.size >= config.max_hours_per_request) {
        toast(`Можно выбрать не больше ${config.max_hours_per_request} часов за раз`, 'error');
        return;
      }
      selected.add(hourStart);
    } else {
      selected.delete(hourStart);
    }
    updateSelectionUi();
  }

  function applyQuickRange(range) {
    const day = hoursOfDay(activeDayIndex);
    const selectedBefore = selected.size;
    for (const hour of day) {
      const hourOfDay = hourOf(hour.hour_start);
      if (hourOfDay >= range.from && hourOfDay < range.to && hour.status === 'free') {
        if (selected.size >= config.max_hours_per_request) {
          toast(`Можно выбрать не больше ${config.max_hours_per_request} часов за раз`, 'error');
          break;
        }
        selected.add(hour.hour_start);
      }
    }
    if (selected.size === selectedBefore) {
      toast('В этом диапазоне нет свободных часов для выбранного дня', 'error');
    }
    updateSelectionUi();
  }

  function selectedHoursList() {
    return [...selected].sort((a, b) => a - b);
  }

  /* ---------- Header ---------- */

  const hero = el('section', { class: 'adv-hero' });
  hero.append(el('span', { class: 'adv-hero__eyebrow', text: 'Реклама' }));
  hero.append(el('h1', { class: 'adv-hero__title', text: 'Реклама на Wiutgram' }));
  hero.append(el('p', { class: 'adv-hero__subtitle', text: 'Показывайте рекламу студентам Ташкента' }));
  const heroRow = el('div', { class: 'adv-hero__row' });
  heroRow.append(el('span', { class: 'adv-hero__price', text: `От ${formatSum(config.price_per_hour)} за час` }));
  heroRow.append(el('span', { class: 'adv-hero__note', text: config.timezone_note }));
  hero.append(heroRow);
  const heroActions = el('div', { class: 'adv-hero__actions' });
  heroActions.append(
    el('a', { class: 'btn btn-primary', text: 'Выбрать часы', attrs: { href: '#hours' } }),
    el('a', { class: 'btn btn-secondary', text: 'Как это работает', attrs: { href: '#how' } })
  );
  hero.append(heroActions);
  root.append(hero);

  /* ---------- Steps ---------- */

  const steps = el('section', { class: 'adv-section', attrs: { id: 'how' } });
  steps.append(el('h2', { class: 'adv-section__title', text: 'Как это работает' }));
  const stepsGrid = el('div', { class: 'adv-steps' });
  [
    ['sliders', 'Выберите часы', 'Отметьте удобные часы в сетке — свободные видны сразу.'],
    ['chat', 'Напишите администратору', 'Пришлите заявку в Telegram и оплатите удобным способом.'],
    ['image', 'Мы разместим ваш баннер', 'Согласуем макет 1600×400 и покажем его в выбранные часы.']
  ].forEach(([iconName, title, text], index) => {
    const card = el('div', { class: 'adv-step' });
    const top = el('div', { class: 'adv-step__top' });
    const badge = el('span', { class: 'adv-step__icon' });
    badge.innerHTML = icon(iconName, { size: 18 });
    top.append(badge, el('span', { class: 'adv-step__num', text: `0${index + 1}` }));
    card.append(top, el('div', { class: 'adv-step__title', text: title }), el('p', { class: 'adv-step__text', text }));
    stepsGrid.append(card);
  });
  steps.append(stepsGrid);
  root.append(steps);

  /* ---------- Placements ---------- */

  const places = el('section', { class: 'adv-section' });
  places.append(el('h2', { class: 'adv-section__title', text: 'Где увидят вашу рекламу' }));
  places.append(
    el('p', {
      class: 'adv-section__sub',
      text: 'Один оплаченный час показывает один баннер сразу в двух местах. Формат 1600×400 px, JPG, PNG или WEBP.'
    })
  );
  places.append(mockups());
  root.append(places);

  /* ---------- Audience ---------- */

  const audience = availability.audience;
  if (config.show_audience_stats && audience && audience.has_data) {
    const box = el('section', { class: 'adv-audience' });
    const left = el('div');
    left.append(el('div', { class: 'adv-audience__label', text: 'Аудитория за последние 7 дней' }));
    left.append(el('div', { class: 'adv-audience__value', text: `В среднем ${audience.avg_per_hour} человек в час` }));
    box.append(left);
    if (audience.peak) {
      const right = el('div', { class: 'adv-audience__peak' });
      right.append(el('span', { class: 'adv-audience__label', text: 'Пик активности' }));
      right.append(el('strong', { text: audience.peak.label }));
      box.append(right);
    }
    root.append(box);
  }

  /* ---------- Hours ---------- */

  const hoursSection = el('section', { class: 'adv-section adv-hours', attrs: { id: 'hours' } });
  const hoursHead = el('div', { class: 'adv-hours__head' });
  const headText = el('div');
  headText.append(el('h2', { class: 'adv-section__title', text: 'Выберите часы' }));
  headText.append(el('p', { class: 'adv-section__sub', text: config.timezone_note }));
  hoursHead.append(headText);

  const viewToggle = el('div', { class: 'segmented', attrs: { role: 'tablist', 'aria-label': 'Вид календаря' } });
  for (const [id, label] of [['day', 'День'], ['week', 'Неделя']]) {
    const btn = el('button', {
      class: `segmented__item ${view === id ? 'is-active' : ''}`,
      attrs: { type: 'button', role: 'tab', 'aria-selected': view === id ? 'true' : 'false' },
      text: label
    });
    btn.addEventListener('click', () => {
      view = id;
      viewToggle.querySelectorAll('.segmented__item').forEach((node) => {
        const active = node === btn;
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderHours();
    });
    viewToggle.append(btn);
  }
  hoursHead.append(viewToggle);
  hoursSection.append(hoursHead);

  const daysStrip = el('div', { class: 'adv-days', attrs: { role: 'tablist', 'aria-label': 'Дата' } });
  availability.days.forEach((day, index) => {
    const chip = el('button', {
      class: `adv-day ${index === activeDayIndex ? 'is-active' : ''}`,
      attrs: { type: 'button', role: 'tab', 'aria-selected': index === activeDayIndex ? 'true' : 'false' },
      text: dayChipLabel(day.day_key, index)
    });
    chip.addEventListener('click', () => {
      activeDayIndex = index;
      daysStrip.querySelectorAll('.adv-day').forEach((node, i) => {
        node.classList.toggle('is-active', i === index);
        node.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
      renderHours();
      if (window.innerWidth < 640) chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    daysStrip.append(chip);
  });
  hoursSection.append(daysStrip);

  const quick = el('div', { class: 'adv-quick', attrs: { 'aria-label': 'Быстрый выбор' } });
  for (const range of QUICK_RANGES) {
    const chip = el('button', { class: 'adv-quick__chip', attrs: { type: 'button' }, text: range.label });
    chip.addEventListener('click', () => applyQuickRange(range));
    quick.append(chip);
  }
  hoursSection.append(quick);

  const hoursBody = el('div', { class: 'adv-hours__body' });
  hoursSection.append(hoursBody);

  const legend = el('div', { class: 'adv-legend' });
  [
    ['free', 'Свободно'],
    ['busy', 'Занято'],
    ['selected', 'Выбрано'],
    ['now', 'Сейчас']
  ].forEach(([kind, label]) => {
    const item = el('span', { class: 'adv-legend__item' });
    item.append(el('i', { class: `adv-legend__dot adv-legend__dot--${kind}` }), el('span', { text: label }));
    legend.append(item);
  });
  legend.append(
    el('span', { class: 'adv-legend__hint', text: 'Полоска под часом — активность: чем длиннее, тем больше людей онлайн' })
  );
  hoursSection.append(legend);
  root.append(hoursSection);

  /* ---------- Rules ---------- */

  const rules = el('section', { class: 'adv-section adv-rules' });
  rules.append(el('h2', { class: 'adv-section__title', text: 'Правила размещения' }));
  const rulesText = el('div', { class: 'adv-rules__text' });
  for (const sentence of String(config.rules_text || '').split(/(?<=\.)\s+/)) {
    if (!sentence.trim()) continue;
    rulesText.append(el('p', { text: sentence.trim() }));
  }
  rules.append(rulesText);
  if (config.telegram) {
    rules.append(
      el('a', {
        class: 'adv-rules__contact',
        text: `Связаться: @${config.telegram}`,
        attrs: { href: `https://t.me/${config.telegram}`, target: '_blank', rel: 'noopener noreferrer' }
      })
    );
  }
  root.append(rules);

  /* ---------- Sticky bar ---------- */

  const bar = el('div', { class: 'adv-bar', attrs: { role: 'region', 'aria-label': 'Выбранные часы' } });
  const barText = el('div', { class: 'adv-bar__text' });
  const barCount = el('strong', { text: 'Выбрано: 0 ч' });
  const barSum = el('span', { class: 'adv-bar__sum', text: formatSum(0) });
  barText.append(barCount, barSum);
  const barActions = el('div', { class: 'adv-bar__actions' });
  const resetBtn = button('Сбросить', {
    variant: 'btn-ghost',
    onClick: () => {
      selected.clear();
      updateSelectionUi();
    }
  });
  const buyBtn = button('Купить', { variant: 'btn-primary', icon: 'check' });
  barActions.append(resetBtn, buyBtn);
  bar.append(barText, barActions);
  root.append(bar);

  /* ---------- Rendering ---------- */

  function activityLevel(hourOfDay) {
    const levels = audience && audience.levels;
    if (!levels || !levels.length) return 0;
    return levels[hourOfDay] || 0;
  }

  function hourCell(hour, dayIndex) {
    const selectedNow = selected.has(hour.hour_start);
    const current = hour.current;
    const classes = ['adv-hour', `is-${hour.status}`];
    if (selectedNow) classes.push('is-selected');
    if (current) classes.push('is-current');
    const cell = el('button', {
      class: classes.join(' '),
      attrs: {
        type: 'button',
        role: 'gridcell',
        'aria-selected': selectedNow ? 'true' : 'false',
        'aria-pressed': selectedNow ? 'true' : 'false',
        'aria-label': `${hourRangeLabel(hour.hour_start)}, ${
          hour.status === 'busy' ? 'занято' : hour.status === 'past' ? 'недоступно' : 'свободно'
        }, ${selectedNow ? 'выбрано' : 'не выбрано'}`,
        'data-hour': String(hour.hour_start),
        'data-day': String(dayIndex),
        tabindex: hour.status === 'free' ? '0' : '-1',
        disabled: hour.status !== 'free' ? 'disabled' : null
      }
    });
    const digits = String(hourOf(hour.hour_start)).padStart(2, '0');
    const time = el('span', { class: 'adv-hour__time' });
    time.append(el('strong', { text: digits }), el('span', { class: 'adv-hour__end', text: '–00' }));
    const status = el('span', { class: 'adv-hour__status' });
    if (hour.status === 'busy') {
      status.innerHTML = icon('lock', { size: 12 });
      status.append(el('span', { text: 'занято' }));
    } else if (hour.status === 'past') {
      status.append(el('span', { text: 'недоступно' }));
    } else if (selectedNow) {
      const check = el('span', { class: 'adv-hour__check' });
      check.innerHTML = icon('check', { size: 13 });
      status.append(check, el('span', { text: 'выбрано' }));
    } else {
      status.append(el('span', { text: 'свободно' }));
    }
    if (current) cell.append(el('span', { class: 'adv-hour__now', attrs: { title: 'Сейчас' } }));
    cell.append(time, status);
    const level = activityLevel(hourOf(hour.hour_start));
    if (level > 0 && hour.status !== 'past') {
      const barNode = el('span', { class: 'adv-hour__activity', attrs: { 'aria-hidden': 'true' } });
      barNode.style.width = `${level * 33}%`;
      cell.append(barNode);
    }
    cell.dataset.status = hour.status;
    return cell;
  }

  function bindDrag(grid) {
    grid.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest('.adv-hour');
      if (!cell || cell.dataset.status !== 'free') return;
      event.preventDefault();
      dragging = true;
      dragMode = selected.has(Number(cell.dataset.hour)) ? 'remove' : 'add';
      toggleHour(Number(cell.dataset.hour), dragMode === 'add');
    });
    grid.addEventListener('pointerover', (event) => {
      if (!dragging) return;
      const cell = event.target.closest('.adv-hour');
      if (!cell || cell.dataset.status !== 'free') return;
      const hourStart = Number(cell.dataset.hour);
      if (dragMode === 'add' && !selected.has(hourStart)) toggleHour(hourStart, true);
      if (dragMode === 'remove' && selected.has(hourStart)) toggleHour(hourStart, false);
    });
    grid.addEventListener('click', (event) => {
      const cell = event.target.closest('.adv-hour');
      if (!cell || cell.dataset.status !== 'free') return;
      if (event.shiftKey) toggleHour(Number(cell.dataset.hour), true);
    });
    grid.addEventListener('keydown', (event) => {
      const cell = event.target.closest('.adv-hour');
      if (!cell) return;
      const cells = [...grid.querySelectorAll('.adv-hour')];
      const index = cells.indexOf(cell);
      const columns = view === 'day' ? 6 : 24;
      let next = null;
      if (event.key === 'ArrowRight') next = index + 1;
      if (event.key === 'ArrowLeft') next = index - 1;
      if (event.key === 'ArrowDown') next = index + columns;
      if (event.key === 'ArrowUp') next = index - columns;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = cells.length - 1;
      if (event.key === ' ' || event.key === 'Enter') {
        if (cell.dataset.status === 'free') {
          event.preventDefault();
          toggleHour(Number(cell.dataset.hour));
        }
        return;
      }
      if (next === null) return;
      const target = cells[Math.min(cells.length - 1, Math.max(0, next))];
      if (!target) return;
      event.preventDefault();
      target.focus();
    });
  }

  function renderDay() {
    const day = availability.days[activeDayIndex];
    const grid = el('div', {
      class: 'adv-grid',
      attrs: { role: 'grid', 'aria-label': `Часы на ${dayLabel(day.day_key)}` }
    });
    for (const hour of day.hours) grid.append(hourCell(hour, activeDayIndex));
    bindDrag(grid);
    return grid;
  }

  function renderWeek() {
    const start = activeDayIndex;
    const days = availability.days.slice(start, start + 7);
    const wrap = el('div', { class: 'adv-week' });
    const grid = el('div', {
      class: 'adv-week__grid',
      attrs: { role: 'grid', 'aria-label': 'Неделя: свободные и занятые часы', style: 'grid-template-columns: 64px repeat(7, minmax(28px, 1fr))' }
    });
    grid.append(el('div', { class: 'adv-week__corner', attrs: { role: 'columnheader' } }));
    for (const day of days) {
      grid.append(
        el('div', {
          class: `adv-week__day ${day.day_key === availability.days[activeDayIndex].day_key ? 'is-active' : ''}`,
          attrs: { role: 'columnheader', text: dayChipLabel(day.day_key, availability.days.indexOf(day)) }
        })
      );
    }
    for (let hour = 0; hour < 24; hour += 1) {
      grid.append(el('div', { class: 'adv-week__time', attrs: { role: 'rowheader', text: `${String(hour).padStart(2, '0')}:00` } }));
      for (const day of days) {
        const info = day.hours[hour];
        const classes = ['adv-week__cell', `is-${info.status}`];
        if (selected.has(info.hour_start)) classes.push('is-selected');
        if (info.current) classes.push('is-current');
        const cell = el('button', {
          class: classes.join(' '),
          attrs: {
            type: 'button',
            role: 'gridcell',
            'aria-label': `${dayChipLabel(day.day_key, availability.days.indexOf(day))}, ${hourRangeLabel(info.hour_start)}, ${
              info.status === 'busy' ? 'занято' : info.status === 'past' ? 'недоступно' : 'свободно'
            }`,
            disabled: info.status !== 'free' ? 'disabled' : null,
            title: `${dayLabel(day.day_key)}, ${hourRangeLabel(info.hour_start)}`
          }
        });
        cell.addEventListener('click', () => {
          activeDayIndex = availability.days.indexOf(day);
          daysStrip.querySelectorAll('.adv-day').forEach((node, i) => {
            node.classList.toggle('is-active', i === activeDayIndex);
            node.setAttribute('aria-selected', i === activeDayIndex ? 'true' : 'false');
          });
          view = 'day';
          viewToggle.querySelectorAll('.segmented__item').forEach((node, i) => {
            node.classList.toggle('is-active', i === 0);
            node.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
          });
          toggleHour(info.hour_start, true);
          renderHours();
        });
        grid.append(cell);
      }
    }
    wrap.append(grid);
    return wrap;
  }

  function renderHours() {
    hoursBody.innerHTML = '';
    if (view === 'week') {
      hoursBody.append(renderWeek());
    } else {
      hoursBody.append(renderDay());
    }
    updateSelectionUi();
  }

  function updateSelectionUi() {
    const hours = selectedHoursList();
    hoursBody.querySelectorAll('.adv-hour').forEach((cell) => {
      const hourStart = Number(cell.dataset.hour);
      const isSelected = selected.has(hourStart);
      cell.classList.toggle('is-selected', isSelected);
      cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      cell.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      if (cell.dataset.status === 'free') {
        const status = cell.querySelector('.adv-hour__status');
        if (status) {
          status.innerHTML = '';
          if (isSelected) {
            const check = el('span', { class: 'adv-hour__check' });
            check.innerHTML = icon('check', { size: 13 });
            status.append(check, el('span', { text: 'выбрано' }));
          } else {
            status.append(el('span', { text: 'свободно' }));
          }
        }
        const label = cell.getAttribute('aria-label') || '';
        cell.setAttribute(
          'aria-label',
          label.replace(/, выбрано$|, не выбрано$/, isSelected ? ', выбрано' : ', не выбрано')
        );
      }
    });
    hoursBody.querySelectorAll('.adv-week__cell').forEach((cell) => {
      const title = cell.getAttribute('title') || '';
      const hourStart = Number((title.match(/(\d+)/) || [])[1]);
      void hourStart;
    });
    const price = priceForHours(hours.length, config);
    barCount.textContent = `Выбрано: ${hours.length} ${hours.length === 1 ? 'час' : hours.length < 5 ? 'часа' : 'часов'}`;
    barSum.textContent = formatSum(price.total);
    bar.classList.toggle('is-visible', hours.length > 0);
    buyBtn.disabled = hours.length === 0 || submitting;
    resetBtn.disabled = hours.length === 0;
    const overLimit = hours.length > config.max_hours_per_request;
    barText.classList.toggle('is-error', overLimit);
    if (overLimit) {
      barSum.textContent = `Максимум ${config.max_hours_per_request} ч за раз`;
    } else if (price.percent > 0) {
      barSum.textContent = `${formatSum(price.total)} · скидка ${price.percent}%`;
    }
  }

  /* ---------- Purchase ---------- */

  function openInstructionModal(data) {
    const body = el('div', { class: 'adv-modal' });
    body.append(
      el('p', {
        class: 'adv-modal__lead',
        text: 'Напишите администратору в Telegram, чтобы согласовать и оплатить рекламу. Баннер пришлите фото в сообщении.'
      })
    );

    if (data.telegram) {
      const telegramRow = el('div', { class: 'adv-modal__telegram' });
      telegramRow.append(el('span', { class: 'adv-modal__at', text: `@${data.telegram}` }));
      const copyUser = button('Копировать', {
        variant: 'btn-secondary btn-sm',
        onClick: async () => {
          const ok = await copyText(`@${data.telegram}`);
          toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'success' : 'error');
        }
      });
      telegramRow.append(copyUser);
      body.append(telegramRow);
    } else {
      body.append(el('p', { class: 'adv-modal__missing', text: 'Контакт администратора пока не указан.' }));
    }

    const card = data.payment && data.payment.card;
    if (card) {
      const cardBox = el('div', { class: 'adv-modal__card' });
      cardBox.append(el('div', { class: 'adv-modal__label', text: 'Оплата переводом на карту' }));
      const numberRow = el('div', { class: 'adv-modal__card-number' });
      numberRow.append(el('strong', { text: card.number }));
      numberRow.append(
        button('Скопировать номер', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            const ok = await copyText(card.number);
            toast(ok ? 'Номер скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
          }
        })
      );
      cardBox.append(numberRow);
      const details = el('div', { class: 'adv-modal__card-details' });
      if (card.holder) details.append(el('span', { text: `Владелец: ${card.holder}` }));
      if (card.bank) details.append(el('span', { text: `Банк: ${card.bank}` }));
      if (details.childNodes.length) cardBox.append(details);
      if (card.note) cardBox.append(el('p', { class: 'adv-modal__card-note', text: card.note }));
      body.append(cardBox);
    }

    const summary = el('div', { class: 'adv-modal__summary' });
    summary.append(el('div', { class: 'adv-modal__label', text: 'Ваши часы' }));
    const list = el('ul', { class: 'adv-modal__list' });
    for (const group of groupHours(data.hours)) list.append(el('li', { text: groupLabel(group) }));
    summary.append(list);
    const totalRow = el('div', { class: 'adv-modal__total' });
    totalRow.append(el('span', { text: 'Сумма' }), el('strong', { text: formatSum(data.total) }));
    summary.append(totalRow);
    body.append(summary);

    const code = el('div', { class: 'adv-modal__code' });
    code.append(el('span', { text: 'Код заявки' }), el('strong', { text: data.code }));
    body.append(code);
    body.append(el('p', { class: 'adv-modal__note', text: 'Время указано по Ташкенту. Оплата и согласование проходят в Telegram.' }));

    const footer = el('div', { class: 'adv-modal__actions' });
    if (data.telegram) {
      const link = el('a', {
        class: 'btn btn-primary',
        text: 'Написать в Telegram',
        attrs: {
          href: `https://t.me/${data.telegram}?text=${encodeURIComponent(data.message)}`,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      });
      footer.append(link);
    }
    footer.append(
      button('Скопировать сообщение', {
        variant: 'btn-secondary',
        onClick: async () => {
          const ok = await copyText(data.message);
          toast(ok ? 'Сообщение скопировано' : 'Не удалось скопировать', ok ? 'success' : 'error');
        }
      })
    );
    body.append(footer);

    openModal({ title: 'Почти готово', body, size: 'wide' });
  }

  buyBtn.addEventListener('click', async () => {
    const hours = selectedHoursList();
    if (!hours.length || submitting) return;
    if (hours.length > config.max_hours_per_request) {
      toast(`Можно выбрать не больше ${config.max_hours_per_request} часов за раз`, 'error');
      return;
    }
    submitting = true;
    buyBtn.disabled = true;
    try {
      const data = await api.post('/ads/requests', { hours });
      selected.clear();
      await refreshAvailability();
      updateSelectionUi();
      openInstructionModal(data);
    } catch (err) {
      if (err.status === 409) {
        toast('Некоторые часы уже заняты, обновили сетку', 'error');
        selected.clear();
        await refreshAvailability();
        renderHours();
      } else {
        toast(err.message || 'Не удалось создать заявку', 'error');
      }
    } finally {
      submitting = false;
      updateSelectionUi();
    }
  });

  async function refreshAvailability() {
    try {
      const fresh = await api.get('/ads/availability');
      availability = fresh;
      // Drop selected hours that are no longer free.
      const freeHours = new Set();
      for (const day of availability.days) {
        for (const hour of day.hours) {
          if (hour.status === 'free') freeHours.add(hour.hour_start);
        }
      }
      selected = new Set([...selected].filter((hour) => freeHours.has(hour)));
      if (activeDayIndex >= availability.days.length) activeDayIndex = 0;
    } catch (err) {
      // Keep the current grid if the refresh fails.
    }
  }

  document.addEventListener('pointerup', () => {
    dragging = false;
  });

  renderHours();
  updateSelectionUi();
  return root;
}
