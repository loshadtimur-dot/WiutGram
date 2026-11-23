import { api } from '../../../api.js?v=31';
import { el, button, toast, openModal } from '../../../ui.js?v=31';
import { icon } from '../../../icons.js?v=31';
import { formatSum, describeGroups, groupHours, groupLabel } from '../../../ads-utils.js?v=31';

export const PAYMENT_LABELS = { paid: 'Оплачено', unpaid: 'Не оплачено', refunded: 'Возврат' };
export const STATUS_LABELS = { active: 'Активна', cancelled: 'Отменена' };
export const REQUEST_STATUS = {
  new: 'Новая',
  contacted: 'Связались',
  converted: 'В брони',
  rejected: 'Отклонена',
  expired: 'Истекла'
};

const PALETTE = ['#5b6fd6', '#3f9e7a', '#8a6bc9', '#c08a3e', '#4b8fa8', '#a05f8f', '#6c7f95', '#8f9b52'];

export function campaignColor(id) {
  const index = Math.abs(Number(id) || 0) % PALETTE.length;
  return PALETTE[index];
}

export function statusChip(text, variant = '') {
  return el('span', { class: `admin-chip ${variant ? `admin-chip--${variant}` : ''}`, text });
}

export function paymentChip(status) {
  const variant = status === 'paid' ? 'verified' : status === 'refunded' ? 'banned' : 'demo';
  return statusChip(PAYMENT_LABELS[status] || status, variant);
}

export function groupHoursText(hours) {
  return describeGroups(hours) || '—';
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Скопировано', 'success');
  } catch (err) {
    toast('Не удалось скопировать', 'error');
  }
}

// Confirmation dialog with an optional reason field.
export function reasonDialog({ title, label = 'Причина', confirmLabel = 'Отменить бронь', onSubmit }) {
  const body = el('div', { class: 'col', style: { gap: '10px' } });
  body.append(el('p', { class: 'field__hint', text: 'Часы сразу освободятся и станут доступны для новых броней.' }));
  const input = el('textarea', { class: 'textarea', attrs: { rows: '3', maxlength: '500', placeholder: label } });
  body.append(input);
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title, body, footer });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
  footer.append(
    button(confirmLabel, {
      variant: 'btn-danger',
      onClick: async () => {
        try {
          await onSubmit(input.value.trim());
          modal.close();
        } catch (err) {
          toast(err.message || 'Не удалось выполнить действие', 'error');
        }
      }
    })
  );
  return modal;
}

export function openCampaignDetail(campaign, { onEdit, onRefresh, showPreview }) {
  const body = el('div', { class: 'col', style: { gap: '14px' } });
  const top = el('div', { class: 'row', style: { justifyContent: 'space-between' } });
  const title = el('div');
  title.append(el('div', { class: 'ads-list__title', text: campaign.advertiser_name }));
  if (campaign.advertiser_telegram) {
    title.append(
      el('a', {
        class: 'ads-list__meta',
        text: `@${campaign.advertiser_telegram}`,
        attrs: { href: `https://t.me/${campaign.advertiser_telegram}`, target: '_blank', rel: 'noopener noreferrer' }
      })
    );
  }
  top.append(title, paymentChip(campaign.paid_status));
  body.append(top);

  const info = el('div', { class: 'ads-list' });
  const rows = [
    ['Часы', campaign.hours_text || '—'],
    ['Места', (campaign.placement_labels || []).join(', ') || '—'],
    ['Стоимость', formatSum(campaign.price_total)],
    ['Статус', STATUS_LABELS[campaign.status] || campaign.status]
  ];
  for (const [label, value] of rows) {
    const row = el('div', { class: 'ads-list__row' });
    row.append(el('span', { class: 'ads-list__meta', text: label }), el('span', { text: value }));
    info.append(row);
  }
  body.append(info);

  if (campaign.note) body.append(el('p', { class: 'field__hint', text: `Заметка: ${campaign.note}` }));
  if (campaign.cancel_reason) body.append(el('p', { class: 'field__hint', text: `Причина отмены: ${campaign.cancel_reason}` }));

  if (campaign.stats) {
    const statsRow = el('div', { class: 'ads-kpis' });
    [
      ['Показы', campaign.stats.totals.impressions],
      ['Уникальные', campaign.stats.totals.unique_viewers],
      ['Клики', campaign.stats.totals.clicks],
      ['CTR', `${campaign.stats.totals.ctr}%`]
    ].forEach(([label, value]) => {
      const card = el('div', { class: 'ads-kpi' });
      card.append(el('span', { text: label }), el('strong', { text: String(value) }));
      statsRow.append(card);
    });
    body.append(statsRow);
  }

  const banner = campaign.banner_swipe || campaign.banner_profile;
  if (banner) {
    const preview = el('div', { class: 'ads-preview' });
    preview.append(el('img', { attrs: { src: banner.path, alt: 'Баннер' } }));
    preview.append(el('span', { class: 'ad-badge', text: 'Реклама' }));
    body.append(preview);
  }

  const footer = el('div', { class: 'row' });
  footer.append(button('Закрыть', { variant: 'btn-secondary', onClick: () => modal.close() }));
  if (showPreview) {
    footer.append(button('Как увидят', { variant: 'btn-outline', onClick: () => showPreview(campaign) }));
  }
  if (onEdit) {
    footer.append(
      button('Изменить', {
        variant: 'btn-primary',
        onClick: () => {
          modal.close();
          onEdit(campaign);
        }
      })
    );
  }
  const modal = openModal({ title: 'Бронь', body, footer, size: 'wide' });
  void onRefresh;
  return modal;
}

// Device/theme preview of how a banner looks inside the product.
export function openPreviewModal(campaignOrBanner) {
  const banner = campaignOrBanner.banner_swipe || campaignOrBanner.banner_profile || campaignOrBanner;
  const body = el('div', { class: 'col', style: { gap: '14px' } });
  const controls = el('div', { class: 'segmented' });
  let device = 'phone';
  let theme = 'light';
  const wrap = el('div', { class: 'row', style: { gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' } });

  const deviceButtons = [
    ['phone', 'Телефон'],
    ['desktop', 'Десктоп']
  ].map(([id, label]) => {
    const btn = button(label, {
      variant: device === id ? 'btn-primary' : 'btn-secondary',
      class: 'btn-sm',
      onClick: () => {
        device = id;
        deviceButtons.forEach(([key, node]) => {
          node.className = `btn btn-sm ${device === key ? 'btn-primary' : 'btn-secondary'}`;
        });
        draw();
      }
    });
    return [id, btn];
  });
  deviceButtons.forEach(([, node]) => controls.append(node));

  const themeButtons = [
    ['light', 'Светлая'],
    ['dark', 'Тёмная']
  ].map(([id, label]) => {
    const btn = button(label, {
      variant: 'btn-secondary',
      class: 'btn-sm',
      onClick: () => {
        theme = id;
        themeButtons.forEach(([key, node]) => {
          node.className = `btn btn-sm ${theme === key ? 'btn-primary' : 'btn-secondary'}`;
        });
        draw();
      }
    });
    return [id, btn];
  });
  themeButtons.forEach(([, node]) => controls.append(node));

  function draw() {
    wrap.innerHTML = '';
    const frame = el('div', { class: device === 'phone' ? 'ads-preview-phone' : 'ads-preview-desktop' });
    frame.style.background = theme === 'dark' ? '#17181b' : '#ffffff';
    frame.style.color = theme === 'dark' ? '#ececee' : '#1d1e22';
    frame.style.borderColor = theme === 'dark' ? '#2a2b30' : '#e6e6e1';
    const bar = el('div', { class: 'ads-preview-phone__bar' });
    bar.style.background = theme === 'dark' ? '#2a2b30' : '#e9e9e4';
    frame.append(bar);
    const bannerNode = el('div', { class: 'ads-preview' });
    if (banner && banner.path) {
      bannerNode.append(el('img', { attrs: { src: banner.path, alt: 'Баннер' } }));
    } else {
      bannerNode.append(el('div', { style: { aspectRatio: '4 / 1', display: 'grid', placeItems: 'center', fontSize: '11px' }, text: 'Баннер не выбран' }));
    }
    bannerNode.append(el('span', { class: 'ad-badge', text: 'Реклама' }));
    frame.append(bannerNode);
    if (device === 'phone') {
      const card = el('div', { class: 'ads-preview-phone__card' });
      card.style.background = theme === 'dark' ? '#1f2024' : '#f4f4f1';
      card.style.borderColor = theme === 'dark' ? '#2a2b30' : '#e6e6e1';
      frame.append(card);
    } else {
      const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' } });
      for (let i = 0; i < 3; i += 1) {
        const tile = el('div', { style: { height: '90px', borderRadius: '10px' } });
        tile.style.background = theme === 'dark' ? '#1f2024' : '#f4f4f1';
        grid.append(tile);
      }
      frame.append(grid);
    }
    wrap.append(frame);
  }

  body.append(controls, wrap);
  draw();
  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Как это увидят пользователи', body, footer });
  footer.append(button('Закрыть', { variant: 'btn-secondary', onClick: () => modal.close() }));
}

export function requestRow(request) {
  const row = el('div', { class: 'ads-list__row' });
  const main = el('div', { class: 'ads-list__main' });
  const title = el('div', { class: 'ads-list__title' });
  const code = el('span', { text: request.code });
  code.style.fontVariantNumeric = 'tabular-nums';
  title.append(code);
  if (request.contact_name) title.append(el('span', { text: ` · ${request.contact_name}` }));
  main.append(title);
  main.append(
    el('div', { class: 'ads-list__meta', text: `${groupHoursText(request.hours)} · ${formatSum(request.total)}` })
  );
  main.append(el('div', { class: 'ads-list__meta', text: new Date(request.created_at).toLocaleString('ru-RU') }));
  row.append(main);
  const actions = el('div', { class: 'ads-list__actions' });
  actions.append(statusChip(REQUEST_STATUS[request.status] || request.status, request.status === 'new' ? 'owner' : ''));
  row.append(actions);
  return row;
}

export { formatSum, groupHours, groupLabel };
