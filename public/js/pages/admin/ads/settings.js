import { api } from '../../../api.js?v=25';
import { el, button, toast } from '../../../ui.js?v=25';
import { icon } from '../../../icons.js?v=25';
import { sectionHead } from '../shared.js?v=25';

export default async function adsSettingsSection({ refresh }) {
  let data;
  try {
    data = await api.get('/admin/ads/settings');
  } catch (err) {
    return el('div', { class: 'admin-empty', text: err.message || 'Не удалось загрузить настройки' });
  }
  const settings = data.settings;

  const root = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(sectionHead('Настройки рекламы', 'Всё сохраняется сразу. Время — по Ташкенту.'));

  const panel = el('div', { class: 'admin-panel' });
  const form = el('div', { class: 'ads-form-grid' });
  const inputs = {};

  // The API exposes friendly names; form fields keep the ads_* setting keys.
  const VALUES = {
    ads_telegram: settings.telegram,
    ads_price_per_hour: settings.price_per_hour,
    ads_horizon_days: settings.horizon_days,
    ads_min_notice_hours: settings.min_notice_hours,
    ads_max_hours_per_request: settings.max_hours_per_request,
    ads_house_title: settings.house_title,
    ads_house_text: settings.house_text
  };
  const TOGGLES = {
    ads_enabled: settings.enabled,
    ads_swipe_enabled: settings.swipe_enabled,
    ads_profile_enabled: settings.profile_enabled,
    ads_show_audience_stats: settings.show_audience_stats
  };

  function textField(key, label, options = {}) {
    const field = el('label', { class: `field ${options.full ? 'field--full' : ''}` });
    field.append(el('span', { class: 'field__label', text: label }));
    const input = el('input', {
      class: 'input',
      attrs: {
        type: options.type || 'text',
        maxlength: options.maxlength || '200',
        min: options.min,
        max: options.max,
        placeholder: options.placeholder || ''
      }
    });
    input.value = options.value !== undefined ? options.value : VALUES[key] ?? '';
    inputs[key] = input;
    field.append(input);
    if (options.hint) field.append(el('span', { class: 'field__hint', text: options.hint }));
    form.append(field);
    return input;
  }

  function toggle(key, label, hint) {
    const row = el('label', { class: 'switch' });
    const text = el('div', { class: 'switch__text' });
    text.append(el('div', { class: 'switch__title', text: label }));
    text.append(el('div', { class: 'switch__desc', text: hint }));
    const input = el('input', { attrs: { type: 'checkbox' } });
    input.checked = !!TOGGLES[key];
    inputs[key] = input;
    row.append(text, input);
    form.append(row);
  }

  toggle('ads_enabled', 'Реклама включена', 'Главный выключатель. Выключение скрывает баннеры и страницу заявок.');
  toggle('ads_swipe_enabled', 'Баннеры на экране свайпов', 'Показывать рекламное место над колодой.');
  toggle('ads_profile_enabled', 'Баннеры в профилях', 'Показывать рекламное место под шапкой профиля.');
  toggle('ads_show_audience_stats', 'Показывать статистику аудитории', 'Средняя активность и пик на публичной странице.');

  const telegramInput = textField('ads_telegram', 'Telegram для рекламы', {
    placeholder: 'username без @',
    hint: 'Публично показывается как @username. Сайт не принимает оплату.'
  });
  const checkLink = el('div', { class: 'row', style: { marginTop: '6px' } });
  const checkBtn = button('Проверить ссылку', { variant: 'btn-outline btn-sm' });
  checkBtn.addEventListener('click', () => {
    const value = telegramInput.value.trim().replace(/^@+/, '');
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)) {
      toast('Неверный username: 5–32 символа, латиница, цифры и _', 'error');
      return;
    }
    window.open(`https://t.me/${value}`, '_blank', 'noopener');
  });
  checkLink.append(checkBtn);
  telegramInput.closest('.field').append(checkLink);

  textField('ads_price_per_hour', 'Цена за час, сум', { type: 'number', min: 0, hint: 'По умолчанию 15 000 сум.' });
  textField('ads_horizon_days', 'Горизонт бронирования, дней', { type: 'number', min: 1, max: 90 });
  textField('ads_min_notice_hours', 'Минимум часов до начала', { type: 'number', min: 0, max: 72 });
  textField('ads_max_hours_per_request', 'Максимум часов в заявке', { type: 'number', min: 1, max: 168 });

  const fallbackField = el('label', { class: 'field' });
  fallbackField.append(el('span', { class: 'field__label', text: 'Если час не продан' }));
  const fallbackSelect = el('select', { class: 'select' });
  [['house', 'Показывать свой блок «Здесь может быть ваша реклама»'], ['hidden', 'Скрывать место']].forEach(
    ([value, label]) => fallbackSelect.append(el('option', { text: label, attrs: { value } }))
  );
  fallbackSelect.value = settings.fallback_mode;
  inputs.ads_fallback_mode = fallbackSelect;
  fallbackField.append(fallbackSelect);
  form.append(fallbackField);

  textField('ads_house_title', 'Заголовок своего блока', { maxlength: 80, full: true });
  textField('ads_house_text', 'Текст своего блока', { maxlength: 140, full: true });

  panel.append(form);
  root.append(panel);

  /* ---------- Payment details (public on /advertise) ---------- */

  const payCard = el('div', { class: 'admin-panel' });
  payCard.append(el('strong', { text: 'Оплата и контакты' }));
  payCard.append(
    el('p', {
      class: 'field__hint',
      text: 'Эти реквизиты увидят все, кто нажмёт «Купить». Используйте карту, на которую готовы принимать переводы.'
    })
  );
  const payGrid = el('div', { class: 'ads-form-grid' });

  function payField(key, label, options = {}) {
    const field = el('label', { class: `field ${options.full ? 'field--full' : ''}` });
    field.append(el('span', { class: 'field__label', text: label }));
    const input = el('input', {
      class: 'input',
      attrs: {
        type: 'text',
        maxlength: options.maxlength || '80',
        inputmode: options.inputmode || null,
        placeholder: options.placeholder || ''
      }
    });
    input.value = options.value ?? '';
    inputs[key] = input;
    field.append(input);
    if (options.hint) field.append(el('span', { class: 'field__hint', text: options.hint }));
    payGrid.append(field);
    return input;
  }

  const cardInput = payField('ads_card_number', 'Номер карты', {
    placeholder: '8600 0000 0000 0000',
    inputmode: 'numeric',
    maxlength: '30',
    hint: 'Хранятся только цифры. Показывается группами по 4.'
  });
  const cardPreview = el('span', { class: 'field__hint' });
  cardInput.closest('.field').append(cardPreview);
  const renderCardPreview = () => {
    const digits = cardInput.value.replace(/\D/g, '').slice(0, 19);
    cardPreview.textContent = digits ? `На странице: ${digits.replace(/(\d{4})(?=\d)/g, '$1 ')}` : '';
  };
  cardInput.addEventListener('input', renderCardPreview);
  renderCardPreview();

  payField('ads_card_holder', 'Владелец карты', {
    maxlength: '80',
    placeholder: 'Как в банковском приложении'
  });
  payField('ads_card_bank', 'Банк', { maxlength: '60', placeholder: 'Например, Uzcard' });
  payField('ads_payment_note', 'Примечание к оплате', {
    full: true,
    maxlength: '300',
    placeholder: 'После оплаты пришлите чек в Telegram'
  });

  const showCardRow = el('label', { class: 'switch', style: { gridColumn: '1 / -1' } });
  const showCardText = el('div', { class: 'switch__text' });
  showCardText.append(el('div', { class: 'switch__title', text: 'Показывать карту в окне покупки' }));
  showCardText.append(
    el('div', {
      class: 'switch__desc',
      text: 'Пока выключено, номер и реквизиты не отдаются публичной странице вообще.'
    })
  );
  const showCardInput = el('input', { attrs: { type: 'checkbox' } });
  showCardInput.checked = !!settings.show_card;
  inputs.ads_show_card = showCardInput;
  showCardRow.append(showCardText, showCardInput);
  payGrid.append(showCardRow);

  payCard.append(payGrid);
  root.append(payCard);

  /* ---------- Discounts ---------- */

  const discountCard = el('div', { class: 'admin-panel' });
  discountCard.append(el('strong', { text: 'Скидки за объём' }));
  discountCard.append(el('p', { class: 'field__hint', text: 'Например: от 5 часов — 10%, от 12 часов — 20%.' }));
  const discounts = el('div', { class: 'ads-discounts' });
  discountCard.append(discounts);

  function addDiscountRow(minHours = '', percent = '') {
    const row = el('div', { class: 'ads-discount-row' });
    const minInput = el('input', { class: 'input', attrs: { type: 'number', min: '1', max: '500', placeholder: 'от часов' } });
    minInput.value = minHours;
    const percentInput = el('input', { class: 'input', attrs: { type: 'number', min: '1', max: '90', placeholder: '%' } });
    percentInput.value = percent;
    const remove = el('button', { class: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Удалить скидку' } });
    remove.innerHTML = icon('x', { size: 16 });
    remove.addEventListener('click', () => row.remove());
    row.append(minInput, percentInput, remove);
    row.dataset.min = '';
    discounts.append(row);
    return { row, minInput, percentInput };
  }

  for (const tier of settings.discounts || []) addDiscountRow(String(tier.min_hours), String(tier.percent));
  const addDiscount = button('Добавить скидку', { variant: 'btn-outline btn-sm', onClick: () => addDiscountRow() });
  discountCard.append(addDiscount);
  root.append(discountCard);

  /* ---------- Rules ---------- */

  const rulesCard = el('div', { class: 'admin-panel' });
  rulesCard.append(el('strong', { text: 'Правила размещения' }));
  rulesCard.append(el('p', { class: 'field__hint', text: 'Показываются на публичной странице /advertise.' }));
  const rulesInput = el('textarea', { class: 'textarea', attrs: { rows: '6', maxlength: '4000' } });
  rulesInput.value = settings.rules_text || '';
  rulesCard.append(rulesInput);
  root.append(rulesCard);

  const save = button('Сохранить настройки', {
    variant: 'btn-primary',
    onClick: async () => {
      save.disabled = true;
      try {
        const payload = {
          ads_enabled: inputs.ads_enabled.checked,
          ads_swipe_enabled: inputs.ads_swipe_enabled.checked,
          ads_profile_enabled: inputs.ads_profile_enabled.checked,
          ads_show_audience_stats: inputs.ads_show_audience_stats.checked,
          ads_show_card: inputs.ads_show_card.checked,
          ads_telegram: inputs.ads_telegram.value.trim(),
          ads_card_number: inputs.ads_card_number.value.trim(),
          ads_card_holder: inputs.ads_card_holder.value.trim(),
          ads_card_bank: inputs.ads_card_bank.value.trim(),
          ads_payment_note: inputs.ads_payment_note.value.trim(),
          ads_price_per_hour: Number(inputs.ads_price_per_hour.value) || 0,
          ads_horizon_days: Number(inputs.ads_horizon_days.value) || 30,
          ads_min_notice_hours: Number(inputs.ads_min_notice_hours.value) || 0,
          ads_max_hours_per_request: Number(inputs.ads_max_hours_per_request.value) || 24,
          ads_fallback_mode: inputs.ads_fallback_mode.value,
          ads_house_title: inputs.ads_house_title.value,
          ads_house_text: inputs.ads_house_text.value,
          ads_rules_text: rulesInput.value,
          ads_discounts_json: [...discounts.querySelectorAll('.ads-discount-row')]
            .map((row) => {
              const [minInput, percentInput] = row.querySelectorAll('input');
              return { min_hours: Number(minInput.value) || 0, percent: Number(percentInput.value) || 0 };
            })
            .filter((tier) => tier.min_hours > 0 && tier.percent > 0)
        };
        const saved = await api.put('/admin/ads/settings', payload);
        toast('Настройки рекламы сохранены', 'success');
        for (const warning of saved.warnings || []) toast(warning);
        if (refresh) refresh();
      } catch (err) {
        toast(err.message || 'Не удалось сохранить настройки', 'error');
      } finally {
        save.disabled = false;
      }
    }
  });
  root.append(save);
  return root;
}
