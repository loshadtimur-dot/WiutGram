import { api } from '../api.js?v=19';
import { el, formatNumber } from '../ui.js?v=19';
import { formatSum, dayLabel } from '../ads-utils.js?v=19';

const PAYMENT_LABELS = { paid: 'Оплачено', unpaid: 'Не оплачено', refunded: 'Возврат' };

export default async function AdReportPage(ctx) {
  const token = ctx.params.token;
  const root = el('div', { class: 'ad-report' });

  let report;
  try {
    report = await api.get(`/ads/report/${encodeURIComponent(token)}`);
  } catch (err) {
    const empty = el('div', { class: 'empty' });
    empty.append(el('div', { class: 'empty__title', text: 'Отчёт не найден' }));
    empty.append(el('p', { class: 'empty__text', text: 'Ссылка устарела или была пересоздана. Запросите новую у администратора.' }));
    root.append(empty);
    return root;
  }

  const head = el('div', { class: 'ad-report__head' });
  head.append(el('span', { class: 'ad-report__eyebrow', text: 'Отчёт о рекламе · UNI Lovers' }));
  head.append(el('h1', { class: 'ad-report__title', text: report.advertiser_name }));
  const metaBits = [];
  if (report.placements && report.placements.length) metaBits.push(report.placements.join(' и '));
  metaBits.push(PAYMENT_LABELS[report.paid_status] || report.paid_status);
  metaBits.push(report.timezone_note);
  head.append(el('div', { class: 'ad-report__meta', text: metaBits.join(' · ') }));
  root.append(head);

  const stats = el('div', { class: 'ad-report__stats' });
  [
    ['Показы', report.totals.impressions],
    ['Уникальные', report.totals.unique_viewers],
    ['Клики', report.totals.clicks],
    ['CTR', `${report.totals.ctr}%`]
  ].forEach(([label, value]) => {
    const card = el('div', { class: 'ad-report__stat' });
    card.append(el('span', { text: label }));
    card.append(el('strong', { text: typeof value === 'number' ? formatNumber(value) : value }));
    stats.append(card);
  });
  root.append(stats);

  if (report.banner && report.banner.path) {
    const preview = el('div', { class: 'ad-report__banner' });
    preview.append(el('img', { attrs: { src: report.banner.path, alt: 'Баннер кампании' } }));
    root.append(preview);
  }

  const details = el('div', { class: 'admin-panel' });
  details.append(el('div', { class: 'admin-head__sub', text: 'Размещение' }));
  const hoursLine = el('p', { text: report.hours_text || '—' });
  details.append(hoursLine);
  const totalLine = el('p', { class: 'field__hint', text: `Стоимость: ${formatSum(report.price_total)}` });
  details.append(totalLine);
  root.append(details);

  if (report.days && report.days.length) {
    const table = el('table', { class: 'ad-report__table' });
    const thead = el('thead');
    const headRow = el('tr');
    ['Дата', 'Показы', 'Уникальные', 'Клики'].forEach((label) => headRow.append(el('th', { text: label })));
    thead.append(headRow);
    const tbody = el('tbody');
    for (const day of report.days) {
      const row = el('tr');
      row.append(el('td', { text: dayLabel(day.day) }));
      row.append(el('td', { text: formatNumber(day.impressions) }));
      row.append(el('td', { text: formatNumber(day.unique_viewers) }));
      row.append(el('td', { text: formatNumber(day.clicks) }));
      tbody.append(row);
    }
    table.append(thead, tbody);
    root.append(table);
  } else {
    root.append(el('p', { class: 'field__hint', text: 'Показов пока нет — статистика появится в оплаченные часы.' }));
  }

  root.append(
    el('p', {
      class: 'field__hint',
      text: 'В отчёте только ваша кампания. Данные пользователей рекламодателям не передаются.'
    })
  );
  return root;
}
