import { api } from '../../../api.js?v=25';
import { el, button, toast, openModal } from '../../../ui.js?v=25';
import { formatSum } from '../../../ads-utils.js?v=25';
import { sectionHead, emptyState } from '../shared.js?v=25';
import { PAYMENT_LABELS, paymentChip, openCampaignDetail, openPreviewModal, groupHoursText } from './shared.js?v=25';
import { openBookingModal } from './booking.js?v=25';

// Password confirmation for dangerous owner actions.
export function withSudo({ title, description, reason, actionLabel = 'Подтвердить', onConfirm }) {
  const body = el('div', { class: 'col', style: { gap: '10px' } });
  if (description) body.append(el('p', { class: 'field__hint', text: description }));
  body.append(el('p', { class: 'field__hint', text: 'Подтверждение действует 10 минут.' }));
  const password = el('input', {
    class: 'input',
    attrs: { type: 'password', autocomplete: 'current-password', placeholder: 'Пароль владельца' }
  });
  body.append(password);
  let reasonInput = null;
  if (reason) {
    reasonInput = el('textarea', { class: 'textarea', attrs: { rows: '2', maxlength: '500', placeholder: reason } });
    body.append(reasonInput);
  }
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: title || 'Подтверждение', body, footer });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
  const submit = button(actionLabel, {
    variant: 'btn-danger',
    onClick: async () => {
      if (!password.value) return;
      submit.disabled = true;
      try {
        await api.post('/admin/reauth', { password: password.value });
        await onConfirm({ reason: reasonInput ? reasonInput.value.trim() : '' });
        modal.close();
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

const STATE_FILTERS = [
  ['', 'Все'],
  ['active', 'Идут сейчас'],
  ['future', 'Будущие'],
  ['finished', 'Завершённые'],
  ['cancelled', 'Отменённые']
];

export default async function campaignsSection({ settings, refresh }) {
  let q = '';
  let payment = '';
  let state = '';
  let campaigns = [];
  let banners = [];

  const root = el('div', { class: 'col', style: { gap: '14px' } });
  root.append(
    sectionHead(
      'Кампании',
      'Все брони, оплата и статистика. Время указано по Ташкенту.',
      button('Создать бронь', {
        variant: 'btn-primary',
        onClick: () => openBookingModal({ hours: [], banners, pricePerHour: settings.price_per_hour, onSaved: () => load() })
      })
    )
  );

  const toolbar = el('div', { class: 'ads-toolbar' });
  const search = el('input', { class: 'input', attrs: { placeholder: 'Поиск по рекламодателю или Telegram', maxlength: '80' } });
  search.style.maxWidth = '280px';
  const paymentSelect = el('select', { class: 'select' });
  [['', 'Все оплаты'], ['paid', 'Оплачено'], ['unpaid', 'Не оплачено'], ['refunded', 'Возврат']].forEach(([value, label]) => {
    paymentSelect.append(el('option', { text: label, attrs: { value } }));
  });
  const stateSelect = el('select', { class: 'select' });
  STATE_FILTERS.forEach(([value, label]) => {
    stateSelect.append(el('option', { text: label, attrs: { value } }));
  });
  toolbar.append(search, paymentSelect, stateSelect);
  root.append(toolbar);

  const list = el('div', { class: 'ads-list' });
  root.append(list);

  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      q = search.value.trim();
      load();
    }, 250);
  });
  paymentSelect.addEventListener('change', () => {
    payment = paymentSelect.value;
    load();
  });
  stateSelect.addEventListener('change', () => {
    state = stateSelect.value;
    load();
  });

  async function loadBanners() {
    try {
      const data = await api.get('/admin/ads/banners');
      banners = data.banners || [];
    } catch (err) {
      banners = [];
    }
  }

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'skeleton', style: { height: '64px' } }));
    try {
      const query = new URLSearchParams({ q, payment, state, limit: '200' });
      const [data] = await Promise.all([api.get(`/admin/ads/campaigns?${query.toString()}`), loadBanners()]);
      campaigns = data.campaigns || [];
      render();
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить кампании'));
    }
  }

  function render() {
    list.innerHTML = '';
    if (!campaigns.length) {
      list.append(emptyState('Броней не найдено. Создайте первую бронь.'));
      return;
    }
    for (const campaign of campaigns) {
      const row = el('div', { class: 'ads-list__row' });
      const main = el('div', { class: 'ads-list__main' });
      main.append(el('div', { class: 'ads-list__title', text: campaign.advertiser_name }));
      if (campaign.advertiser_telegram) {
        main.append(
          el('a', {
            class: 'ads-list__meta',
            text: `@${campaign.advertiser_telegram}`,
            attrs: { href: `https://t.me/${campaign.advertiser_telegram}`, target: '_blank', rel: 'noopener noreferrer' }
          })
        );
      }
      main.append(el('div', { class: 'ads-list__meta', text: groupHoursText(campaign.hours) }));
      main.append(
        el('div', {
          class: 'ads-list__meta',
          text: `${campaign.placement_labels.join(', ') || '—'} · ${formatSum(campaign.price_total)}${
            campaign.status === 'cancelled' ? ' · отменена' : ''
          }`
        })
      );

      const actions = el('div', { class: 'ads-list__actions' });
      actions.append(paymentChip(campaign.paid_status));
      actions.append(
        button('Открыть', {
          variant: 'btn-secondary btn-sm',
          onClick: async () => {
            try {
              const data = await api.get(`/admin/ads/campaigns/${campaign.id}`);
              openCampaignDetail(data.campaign, {
                onEdit: (item) =>
                  openBookingModal({ campaign: item, banners, pricePerHour: settings.price_per_hour, onSaved: () => load() }),
                showPreview: openPreviewModal
              });
            } catch (err) {
              toast(err.message || 'Не удалось открыть бронь', 'error');
            }
          }
        })
      );
      actions.append(
        button('Изменить', {
          variant: 'btn-ghost btn-sm',
          onClick: () =>
            openBookingModal({ campaign, banners, pricePerHour: settings.price_per_hour, onSaved: () => load() })
        })
      );
      actions.append(
        button('Как увидят', { variant: 'btn-ghost btn-sm', onClick: () => openPreviewModal(campaign) })
      );
      if (campaign.status === 'active') {
        actions.append(
          button('Отменить', {
            variant: 'btn-ghost btn-sm',
            onClick: () =>
              withSudo({
                title: 'Отменить бронь',
                description: `Часы брони «${campaign.advertiser_name}» освободятся.`,
                reason: 'Причина отмены',
                actionLabel: 'Отменить бронь',
                onConfirm: async ({ reason }) => {
                  await api.post(`/admin/ads/campaigns/${campaign.id}/cancel`, { reason });
                  toast('Бронь отменена, часы свободны', 'success');
                  await load();
                  if (refresh) refresh();
                }
              })
          })
        );
      }
      actions.append(
        button('Дублировать', {
          variant: 'btn-ghost btn-sm',
          onClick: async () => {
            try {
              await api.post(`/admin/ads/campaigns/${campaign.id}/duplicate`);
              toast('Копия создана без оплаты', 'success');
              await load();
            } catch (err) {
              toast(err.message || 'Не удалось дублировать', 'error');
            }
          }
        })
      );
      actions.append(
        button('CSV', {
          variant: 'btn-ghost btn-sm',
          onClick: () => {
            window.open(`/api/admin/ads/campaigns/${campaign.id}/export`, '_blank');
          }
        })
      );
      actions.append(
        button('Ссылка отчёта', {
          variant: 'btn-ghost btn-sm',
          onClick: async () => {
            const url = `${window.location.origin}/ad-report/${campaign.report_token}`;
            try {
              await navigator.clipboard.writeText(url);
              toast('Ссылка отчёта скопирована', 'success');
            } catch (err) {
              openModal({
                title: 'Ссылка отчёта',
                body: el('input', { class: 'input', attrs: { value: url, readonly: 'readonly' } })
              });
            }
          }
        })
      );
      actions.append(
        button('Новый токен', {
          variant: 'btn-ghost btn-sm',
          onClick: () =>
            withSudo({
              title: 'Пересоздать ссылку отчёта',
              description: 'Старая ссылка перестанет работать.',
              actionLabel: 'Пересоздать',
              onConfirm: async () => {
                await api.post(`/admin/ads/campaigns/${campaign.id}/report-token`);
                toast('Новая ссылка создана', 'success');
                await load();
              }
            })
        })
      );
      row.append(main, actions);
      list.append(row);
    }
  }

  await load();
  void PAYMENT_LABELS;
  return root;
}
