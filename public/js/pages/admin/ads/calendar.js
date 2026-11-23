import { api } from '../../../api.js?v=31';
import { el, button, toast } from '../../../ui.js?v=31';
import { dayLabel, dayChipLabel, formatSum } from '../../../ads-utils.js?v=31';
import { sectionHead, emptyState } from '../shared.js?v=31';
import { campaignColor, openCampaignDetail, paymentChip, groupHoursText, openPreviewModal } from './shared.js?v=31';
import { openBookingModal } from './booking.js?v=31';

function hourKey(dayKey, hour) {
  return `${dayKey}:${hour}`;
}

export default async function calendarSection({ refresh, settings }) {
  let range = 7;
  let offsetDays = 0;
  let view = 'calendar';
  let selected = new Map();
  let data = null;
  let campaignsList = [];
  let dragging = false;

  const root = el('div', { class: 'col', style: { gap: '14px' } });

  const head = sectionHead(
    'Календарь рекламы',
    'Время указано по Ташкенту. Нажмите свободный час или протяните несколько.',
    button('Создать бронь', {
      variant: 'btn-primary',
      onClick: () => openBooking({ hours: [...selected.values()] })
    })
  );
  root.append(head);

  const toolbar = el('div', { class: 'ads-toolbar' });
  const prev = button('←', { variant: 'btn-secondary btn-sm', onClick: () => shift(-range) });
  const next = button('→', { variant: 'btn-secondary btn-sm', onClick: () => shift(range) });
  const today = button('Сегодня', {
    variant: 'btn-outline btn-sm',
    onClick: () => {
      offsetDays = 0;
      load();
    }
  });
  const rangeSelect = el('select', { class: 'select' });
  [['7', 'Неделя'], ['14', '2 недели']].forEach(([value, label]) => {
    rangeSelect.append(el('option', { text: label, attrs: { value } }));
  });
  rangeSelect.value = String(range);
  rangeSelect.addEventListener('change', () => {
    range = Number(rangeSelect.value);
    load();
  });
  const viewToggle = el('div', { class: 'segmented' });
  [['calendar', 'Сетка'], ['list', 'Список']].forEach(([value, label]) => {
    const btn = el('button', {
      class: `segmented__item ${view === value ? 'is-active' : ''}`,
      attrs: { type: 'button' },
      text: label
    });
    btn.addEventListener('click', () => {
      view = value;
      viewToggle.querySelectorAll('.segmented__item').forEach((node) => node.classList.toggle('is-active', node === btn));
      render();
    });
    viewToggle.append(btn);
  });
  toolbar.append(prev, next, today, rangeSelect, viewToggle);
  const selectionInfo = el('span', { class: 'field__hint', text: '' });
  toolbar.append(selectionInfo);
  root.append(toolbar);

  const body = el('div');
  root.append(body);

  function shift(days) {
    offsetDays += days;
    load();
  }

  async function load() {
    body.innerHTML = '';
    body.append(el('div', { class: 'skeleton', style: { height: '260px' } }));
    try {
      const query = new URLSearchParams({ days: String(range), from: dayKeyOfOffset(offsetDays) });
      data = await api.get(`/admin/ads/calendar?${query.toString()}`);
      if (view === 'list') {
        const list = await api.get('/admin/ads/campaigns?state=active&limit=100');
        campaignsList = list.campaigns || [];
      }
      render();
    } catch (err) {
      body.innerHTML = '';
      body.append(emptyState(err.message || 'Не удалось загрузить календарь'));
    }
  }

  function dayKeyOfOffset(days) {
    const now = new Date();
    const tashkent = new Date(now.getTime() + 5 * 3600 * 1000);
    tashkent.setUTCDate(tashkent.getUTCDate() + days);
    return tashkent.toISOString().slice(0, 10);
  }

  function campaignAt(dayKey, hour) {
    const stamp = Math.floor(Date.parse(`${dayKey}T00:00:00.000Z`) / 1000) - 5 * 3600 + hour * 3600;
    return (data.campaigns || []).find((campaign) => campaign.hours.includes(stamp));
  }

  function toggle(hourStart, dayKey, add) {
    if (add) selected.set(hourStart, hourStart);
    else selected.delete(hourStart);
    updateSelection();
    void dayKey;
  }

  function updateSelection() {
    body.querySelectorAll('.ads-cell, .ads-day-chip.is-free').forEach((cell) => {
      const hour = Number(cell.dataset.hour);
      cell.classList.toggle('is-selected', selected.has(hour));
    });
    selectionInfo.textContent = selected.size ? `Выбрано: ${selected.size} ч` : '';
    const createBtn = head.querySelector('.btn-primary');
    if (createBtn) createBtn.textContent = selected.size ? `Создать бронь (${selected.size} ч)` : 'Создать бронь';
  }

  function renderCalendar() {
    const wrap = el('div', { class: 'ads-calendar' });
    const table = el('table', { class: 'ads-cal' });
    const thead = el('thead');
    const headRow = el('tr');
    headRow.append(el('th', { text: 'День' }));
    for (let hour = 0; hour < 24; hour += 1) {
      headRow.append(el('th', { text: String(hour).padStart(2, '0') }));
    }
    thead.append(headRow);
    const tbody = el('tbody');
    const nowHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    data.days.forEach((dayKey, index) => {
      const row = el('tr');
      const dayCell = el('td', { class: `ads-cal__day ${index === 0 ? 'is-today' : ''}`, text: dayChipLabel(dayKey, index) });
      dayCell.title = dayLabel(dayKey);
      row.append(dayCell);
      for (let hour = 0; hour < 24; hour += 1) {
        const hourStart = Math.floor(Date.parse(`${dayKey}T00:00:00.000Z`) / 1000) - 5 * 3600 + hour * 3600;
        const campaign = campaignAt(dayKey, hour);
        const cell = el('button', {
          class: 'ads-cell',
          attrs: {
            type: 'button',
            'aria-label': `${dayLabel(dayKey)} ${String(hour).padStart(2, '0')}:00 — ${
              campaign ? campaign.advertiser_name : 'свободно'
            }`
          }
        });
        cell.dataset.hour = String(hourStart);
        cell.dataset.day = dayKey;
        if (hourStart < nowHour) cell.classList.add('is-past');
        if (!campaign) {
          cell.classList.add('is-free');
          cell.addEventListener('pointerdown', (event) => {
            if (hourStart < nowHour) return;
            event.preventDefault();
            dragging = true;
            toggle(hourStart, dayKey, !selected.has(hourStart));
          });
          cell.addEventListener('pointerenter', () => {
            if (!dragging || hourStart < nowHour) return;
            toggle(hourStart, dayKey, true);
          });
        } else {
          cell.style.background = campaignColor(campaign.id);
          cell.style.opacity = campaign.status === 'cancelled' ? '0.45' : '0.9';
          cell.title = `${campaign.advertiser_name}${campaign.paid_status !== 'paid' ? ' · не оплачено' : ''}`;
          if (campaign.missing_banner && hourStart - nowHour < 24 * 3600) cell.classList.add('has-warning');
          cell.addEventListener('click', () => {
            openDetail(campaign.id);
          });
        }
        row.append(el('td', {}, [cell]));
      }
      tbody.append(row);
    });
    table.append(thead, tbody);
    wrap.append(table);
    body.append(wrap);

    const legend = el('div', { class: 'ads-legend' });
    const item = el('span', { class: 'ads-legend__item' });
    const dot = el('span', { class: 'ads-legend__swatch' });
    dot.style.background = 'var(--surface)';
    dot.style.border = '1px solid var(--border)';
    item.append(dot, el('span', { text: 'Свободно' }));
    legend.append(item);
    for (const campaign of data.campaigns || []) {
      const entry = el('span', { class: 'ads-legend__item' });
      const swatch = el('span', { class: 'ads-legend__swatch' });
      swatch.style.background = campaignColor(campaign.id);
      entry.append(swatch, el('span', { text: campaign.advertiser_name }));
      legend.append(entry);
    }
    body.append(legend);
    updateSelection();
  }

  function renderList() {
    if (!campaignsList.length) {
      body.append(emptyState('Активных броней пока нет', button('Создать бронь', { variant: 'btn-primary', onClick: () => openBooking({ hours: [] }) })));
      return;
    }
    const list = el('div', { class: 'ads-list' });
    const sorted = campaignsList.slice().sort((a, b) => (a.starts_at || 0) - (b.starts_at || 0));
    for (const campaign of sorted) {
      const row = el('div', { class: 'ads-list__row' });
      const color = el('span', { class: 'ads-legend__swatch' });
      color.style.background = campaignColor(campaign.id);
      color.style.flex = 'none';
      const main = el('div', { class: 'ads-list__main' });
      main.append(el('div', { class: 'ads-list__title', text: campaign.advertiser_name }));
      main.append(el('div', { class: 'ads-list__meta', text: groupHoursText(campaign.hours) }));
      main.append(el('div', { class: 'ads-list__meta', text: `${campaign.placement_labels.join(', ')} · ${campaign.slot_count} ч` }));
      const actions = el('div', { class: 'ads-list__actions' });
      actions.append(paymentChip(campaign.paid_status));
      actions.append(button('Открыть', { variant: 'btn-secondary btn-sm', onClick: () => openDetail(campaign.id) }));
      row.append(color, main, actions);
      list.append(row);
    }
    body.append(list);
  }

  function render() {
    body.innerHTML = '';
    if (!data) return;
    selected = new Map([...selected].filter(([hour]) => hour >= Math.floor(Date.now() / 1000 / 3600) * 3600));
    if (view === 'list') renderList();
    else if (window.innerWidth < 720) renderMobileDays();
    else renderCalendar();
  }

  // On phones the calendar becomes a compact list of days with hour chips.
  function renderMobileDays() {
    const wrap = el('div', { class: 'ads-days' });
    const nowStamp = Math.floor(Date.now() / 1000 / 3600) * 3600;
    data.days.forEach((dayKey, index) => {
      const card = el('div', { class: 'ads-day-card' });
      let booked = 0;
      let free = 0;
      const chips = el('div', { class: 'ads-day-chips' });
      for (let hour = 0; hour < 24; hour += 1) {
        const hourStart = Math.floor(Date.parse(`${dayKey}T00:00:00.000Z`) / 1000) - 5 * 3600 + hour * 3600;
        const campaign = campaignAt(dayKey, hour);
        const past = hourStart < nowStamp;
        const chip = el('button', {
          class: 'ads-day-chip',
          attrs: {
            type: 'button',
            'aria-label': `${dayLabel(dayKey)} ${String(hour).padStart(2, '0')}:00 ${
              campaign ? campaign.advertiser_name : past ? 'недоступно' : 'свободно'
            }`
          },
          text: String(hour).padStart(2, '0')
        });
        if (campaign) {
          booked += 1;
          chip.classList.add('is-busy');
          chip.style.background = campaignColor(campaign.id);
          chip.title = `${campaign.advertiser_name} · ${formatSum(campaign.price_total)}`;
          chip.addEventListener('click', () => openDetail(campaign.id));
        } else if (past) {
          chip.classList.add('is-past');
          chip.disabled = true;
        } else {
          free += 1;
          chip.classList.add('is-free');
          if (selected.has(hourStart)) chip.classList.add('is-selected');
          chip.addEventListener('click', () => {
            toggle(hourStart, dayKey, !selected.has(hourStart));
            chip.classList.toggle('is-selected', selected.has(hourStart));
          });
        }
        chip.dataset.hour = String(hourStart);
        chips.append(chip);
      }
      const head = el('div', { class: 'ads-day-card__head' });
      head.append(el('span', { class: `ads-day-card__title ${index === 0 ? 'is-today' : ''}`, text: dayChipLabel(dayKey, index) }));
      head.append(el('span', { class: 'ads-day-card__meta', text: `${free} свободно · ${booked} занято` }));
      card.append(head, chips);
      wrap.append(card);
    });
    body.append(wrap);
    updateSelection();
  }

  async function openDetail(id) {
    try {
      const response = await api.get(`/admin/ads/campaigns/${id}`);
      openCampaignDetail(response.campaign, {
        onEdit: (campaign) => openBooking({ campaign }),
        onRefresh: load,
        showPreview: (campaign) => openPreviewModal(campaign)
      });
    } catch (err) {
      toast(err.message || 'Не удалось открыть бронь', 'error');
    }
  }

  function openBooking({ hours, campaign }) {
    openBookingModal({
      hours,
      campaign,
      pricePerHour: settings.price_per_hour,
      onSaved: () => {
        selected = new Map();
        refresh();
      }
    });
  }

  document.addEventListener('pointerup', () => {
    dragging = false;
  });

  await load();
  return root;
}
