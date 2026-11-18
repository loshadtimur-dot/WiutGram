import { api } from '../../../api.js?v=24';
import { el, button, toast, openModal } from '../../../ui.js?v=24';
import {
  TASHKENT_OFFSET,
  tashkentParts,
  dayKeyOf,
  dayLabel,
  hourOf,
  hourLabel,
  formatSum,
  groupHours,
  groupLabel
} from '../../../ads-utils.js?v=24';
import { openCropModal } from './crop.js?v=24';

function dayStartUnix(dayKey) {
  return Math.floor(Date.parse(`${dayKey}T00:00:00.000Z`) / 1000) - TASHKENT_OFFSET;
}

function addDaysKey(dayKey, days) {
  const base = dayStartUnix(dayKey) + days * 86400;
  return tashkentParts(base + TASHKENT_OFFSET).dayKey;
}

function field(label, input, hint, full) {
  const wrap = el('label', { class: `field ${full ? 'field--full' : ''}` });
  wrap.append(el('span', { class: 'field__label', text: label }), input);
  if (hint) wrap.append(el('span', { class: 'field__hint', text: hint }));
  return wrap;
}

// Owner booking editor. Accepts prefilled hours, a campaign (edit) or a request.
export function openBookingModal({ hours = [], campaign = null, request = null, banners = [], pricePerHour = 15000, onSaved } = {}) {
  const isEdit = !!campaign;
  const selected = new Set(
    campaign ? campaign.hours.map(Number) : hours.map(Number).filter((value) => Number.isFinite(value))
  );
  let bannerList = banners.slice();
  let priceTouched = false;

  const body = el('div', { class: 'col', style: { gap: '14px' } });
  const form = el('div', { class: 'ads-form-grid' });

  const nameInput = el('input', {
    class: 'input',
    attrs: { maxlength: '120', placeholder: 'Название или имя' }
  });
  nameInput.value = campaign ? campaign.advertiser_name : request ? request.contact_name || '' : '';
  const telegramInput = el('input', {
    class: 'input',
    attrs: { maxlength: '40', placeholder: 'username без @' }
  });
  telegramInput.value = campaign ? campaign.advertiser_telegram || '' : '';
  form.append(
    field('Рекламодатель', nameInput),
    field('Telegram', telegramInput, 'Необязательно. Только username, без @ и ссылок.')
  );

  const noteInput = el('textarea', { class: 'textarea', attrs: { rows: '2', maxlength: '1000', placeholder: 'Приватная заметка' } });
  noteInput.value = campaign ? campaign.note || '' : '';
  form.append(field('Заметка владельца', noteInput, '', true));

  const placementsRow = el('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap' } });
  const swipeCheck = el('input', { attrs: { type: 'checkbox' } });
  const profileCheck = el('input', { attrs: { type: 'checkbox' } });
  const defaultPlacements = campaign
    ? campaign.placements
    : ['swipe', 'profile'];
  swipeCheck.checked = defaultPlacements.includes('swipe');
  profileCheck.checked = defaultPlacements.includes('profile');
  const swipeLabel = el('label', { class: 'switch', style: { padding: '0' } });
  const swipeText = el('div', { class: 'switch__text' });
  swipeText.append(el('div', { class: 'switch__title', text: 'Свайпы' }));
  swipeLabel.append(swipeText, swipeCheck);
  const profileLabel = el('label', { class: 'switch', style: { padding: '0' } });
  const profileText = el('div', { class: 'switch__text' });
  profileText.append(el('div', { class: 'switch__title', text: 'Профили' }));
  profileLabel.append(profileText, profileCheck);
  placementsRow.append(swipeLabel, profileLabel);
  const placementsField = el('div', { class: 'field field--full' });
  placementsField.append(el('span', { class: 'field__label', text: 'Места показа' }), placementsRow);
  form.append(placementsField);

  const priceInput = el('input', { class: 'input', attrs: { type: 'number', min: '0', step: '100' } });
  const paidSelect = el('select', { class: 'select' });
  [['unpaid', 'Не оплачено'], ['paid', 'Оплачено'], ['refunded', 'Возврат']].forEach(([value, label]) => {
    paidSelect.append(el('option', { text: label, attrs: { value } }));
  });
  paidSelect.value = campaign ? campaign.paid_status : 'unpaid';
  form.append(field('Сумма, сум', priceInput));
  form.append(field('Оплата', paidSelect));

  const linkInput = el('input', { class: 'input', attrs: { maxlength: '500', placeholder: 'https://example.com' } });
  linkInput.value = campaign ? campaign.link_url || '' : '';
  const altInput = el('input', { class: 'input', attrs: { maxlength: '200', placeholder: 'Например: Скидка 20% для студентов' } });
  altInput.value = campaign ? campaign.alt_text || '' : '';
  form.append(
    field('Ссылка при клике', linkInput, 'Необязательно. Только http:// или https://.'),
    field('Alt-текст', altInput, 'Короткое описание для доступности.')
  );

  body.append(form);

  /* ---------- Hours ---------- */

  const hoursCard = el('div', { class: 'admin-panel', style: { padding: '14px' } });
  const hoursHead = el('div', { class: 'row', style: { justifyContent: 'space-between' } });
  const hoursTitle = el('strong', { text: 'Выбранные часы' });
  const hoursCount = el('span', { class: 'field__hint', text: '0 ч' });
  hoursHead.append(hoursTitle, hoursCount);
  hoursCard.append(hoursHead);
  const hoursList = el('div', { class: 'ads-hours-chips' });
  hoursCard.append(hoursList);

  const repeatRow = el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', marginTop: '10px' } });
  const fromSelect = el('select', { class: 'select' });
  const toSelect = el('select', { class: 'select' });
  for (let hour = 0; hour < 24; hour += 1) {
    fromSelect.append(el('option', { text: `${String(hour).padStart(2, '0')}:00`, attrs: { value: String(hour) } }));
    toSelect.append(el('option', { text: `${String(hour + 1).padStart(2, '0')}:00`, attrs: { value: String(hour + 1) } }));
  }
  fromSelect.value = '20';
  toSelect.value = '22';
  const daysInput = el('input', { class: 'input', attrs: { type: 'number', min: '1', max: '30', value: '1' } });
  daysInput.style.width = '64px';
  const addRepeat = button('Добавить', { variant: 'btn-secondary btn-sm' });
  repeatRow.append(
    el('span', { class: 'field__hint', text: 'Каждый день с' }),
    fromSelect,
    el('span', { class: 'field__hint', text: 'до' }),
    toSelect,
    el('span', { class: 'field__hint', text: 'на' }),
    daysInput,
    el('span', { class: 'field__hint', text: 'дн.' }),
    addRepeat
  );
  hoursCard.append(repeatRow);
  body.append(hoursCard);

  function priceDefault() {
    return Math.round(selected.size * pricePerHour * 100) / 100;
  }

  function renderHours() {
    hoursList.innerHTML = '';
    const groups = groupHours([...selected]);
    if (!groups.length) {
      hoursList.append(el('span', { class: 'field__hint', text: 'Часы не выбраны' }));
    }
    for (const group of groups) {
      const chip = el('button', {
        class: 'ads-hour-chip is-selected',
        attrs: { type: 'button', title: 'Убрать' },
        text: `${groupLabel(group)} ×`
      });
      chip.addEventListener('click', () => {
        for (let hour = group.from; hour < group.to; hour += 3600) selected.delete(hour);
        renderHours();
      });
      hoursList.append(chip);
    }
    hoursCount.textContent = `${selected.size} ч`;
    if (!priceTouched) priceInput.value = String(priceDefault());
  }

  addRepeat.addEventListener('click', () => {
    const from = Number(fromSelect.value);
    const to = Number(toSelect.value);
    if (to <= from) {
      toast('Конец должен быть позже начала', 'error');
      return;
    }
    const days = Math.min(30, Math.max(1, Number(daysInput.value) || 1));
    const first = [...selected].sort((a, b) => a - b)[0];
    const baseDay = first ? dayKeyOf(first) : dayKeyOf(Math.floor(Date.now() / 1000));
    let added = 0;
    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const dayKey = addDaysKey(baseDay, dayIndex);
      const start = dayStartUnix(dayKey);
      for (let hour = from; hour < to; hour += 1) {
        selected.add(start + hour * 3600);
        added += 1;
      }
    }
    if (selected.size > 24 * 90) {
      toast('Слишком много часов', 'error');
      return;
    }
    toast(`Добавлено часов: ${added}`, 'success');
    renderHours();
  });

  priceInput.addEventListener('input', () => {
    priceTouched = true;
  });

  /* ---------- Banners ---------- */

  const bannersCard = el('div', { class: 'admin-panel', style: { padding: '14px' } });
  bannersCard.append(el('strong', { text: 'Баннеры' }));
  const bannerRow = el('div', { class: 'ads-form-grid', style: { marginTop: '10px' } });
  const swipeBannerSelect = el('select', { class: 'select' });
  const profileBannerSelect = el('select', { class: 'select' });
  bannerRow.append(field('Баннер для свайпов', swipeBannerSelect), field('Баннер для профилей', profileBannerSelect));
  bannersCard.append(bannerRow);

  function bannerOptions(select, value) {
    select.innerHTML = '';
    select.append(el('option', { text: 'Без баннера', attrs: { value: '' } }));
    for (const banner of bannerList) {
      select.append(
        el('option', {
          text: `${banner.original_name || 'Баннер'} · ${banner.width}×${banner.height}`,
          attrs: { value: String(banner.id) }
        })
      );
    }
    select.value = value ? String(value) : '';
  }

  bannerOptions(swipeBannerSelect, campaign ? campaign.banner_swipe_id : null);
  bannerOptions(profileBannerSelect, campaign ? campaign.banner_profile_id : null);

  const uploadRow = el('div', { class: 'row', style: { marginTop: '8px', gap: '8px', flexWrap: 'wrap' } });
  const uploadInput = el('input', { attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' } });
  uploadInput.style.display = 'none';
  const uploadBtn = button('Загрузить и обрезать баннер', {
    variant: 'btn-outline btn-sm',
    onClick: () => uploadInput.click()
  });
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;
    openCropModal(file, {
      onUploaded: (banner) => {
        bannerList.unshift(banner);
        bannerOptions(swipeBannerSelect, banner.id);
        if (!profileBannerSelect.value) bannerOptions(profileBannerSelect, banner.id);
        toast('Баннер выбран', 'success');
      }
    });
    uploadInput.value = '';
  });
  uploadRow.append(uploadBtn);
  uploadRow.append(el('span', { class: 'field__hint', text: 'JPG, PNG или WEBP, до 8 МБ. Результат — 1600×400.' }));
  bannersCard.append(uploadRow);
  body.append(bannersCard);

  function priceWithDiscount() {
    return Math.round((Number(priceInput.value) || 0) * 100) / 100;
  }

  /* ---------- Submit ---------- */

  const footer = el('div', { class: 'row' });
  const modal = openModal({
    title: isEdit ? 'Изменить бронь' : 'Новая бронь',
    body,
    footer,
    size: 'wide'
  });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));

  const save = button(isEdit ? 'Сохранить' : 'Создать бронь', {
    variant: 'btn-primary',
    onClick: async () => {
      if (!nameInput.value.trim()) {
        toast('Укажите рекламодателя', 'error');
        return;
      }
      const placements = [];
      if (swipeCheck.checked) placements.push('swipe');
      if (profileCheck.checked) placements.push('profile');
      if (!placements.length) {
        toast('Выберите хотя бы одно место показа', 'error');
        return;
      }
      if (!selected.size) {
        toast('Выберите часы', 'error');
        return;
      }
      const payload = {
        advertiser_name: nameInput.value.trim(),
        advertiser_telegram: telegramInput.value.trim(),
        note: noteInput.value.trim(),
        link_url: linkInput.value.trim(),
        alt_text: altInput.value.trim(),
        banner_swipe_id: swipeBannerSelect.value ? Number(swipeBannerSelect.value) : null,
        banner_profile_id: profileBannerSelect.value ? Number(profileBannerSelect.value) : null,
        price_total: priceTouched ? Number(priceInput.value) || 0 : priceDefault(),
        paid_status: paidSelect.value,
        placements,
        hours: [...selected].sort((a, b) => a - b),
        request_id: campaign ? campaign.request_id : request ? request.id : null
      };
      save.disabled = true;
      try {
        if (isEdit) await api.put(`/admin/ads/campaigns/${campaign.id}`, payload);
        else await api.post('/admin/ads/campaigns', payload);
        toast(isEdit ? 'Бронь обновлена' : 'Бронь создана', 'success');
        modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const conflicts = err.data && err.data.conflicts;
        if (conflicts && conflicts.length) {
          toast(`Занято часов: ${conflicts.length}. Они подсвечены в календаре.`, 'error');
        } else {
          toast(err.message || 'Не удалось сохранить бронь', 'error');
        }
        save.disabled = false;
      }
    }
  });
  footer.append(save);

  priceInput.value = String(campaign ? campaign.price_total : priceDefault());
  renderHours();
  if (campaign) priceInput.value = String(campaign.price_total);
  void formatSum;
  void hourOf;
  void hourLabel;
  void dayLabel;
  return modal;
}
