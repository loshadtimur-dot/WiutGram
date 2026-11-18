import { api } from '../../../api.js?v=25';
import { el, button, toast } from '../../../ui.js?v=25';
import { formatSum, dayLabel, dayKeyOf } from '../../../ads-utils.js?v=25';
import { sectionHead, emptyState } from '../shared.js?v=25';
import { paymentChip, groupHoursText } from './shared.js?v=25';

function money(value) {
  return formatSum(value || 0);
}

export default async function revenueSection({ refresh, settings }) {
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(sectionHead('Доход и загрузка', 'Оплаты, загрузка слотов и неоплаченные брони'));

  const content = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(content);

  async function load() {
    content.innerHTML = '';
    content.append(el('div', { class: 'skeleton', style: { height: '120px' } }));
    try {
      const data = await api.get('/admin/ads/revenue');
      render(data);
    } catch (err) {
      content.innerHTML = '';
      content.append(emptyState(err.message || 'Не удалось загрузить доход'));
    }
  }

  function kpi(label, value, hint) {
    const card = el('div', { class: 'ads-kpi' });
    card.append(el('span', { text: label }), el('strong', { text: value }));
    if (hint) card.append(el('small', { text: hint }));
    return card;
  }

  function loadBar(title, info) {
    const card = el('div', { class: 'ads-kpi' });
    card.append(el('span', { text: title }));
    card.append(el('strong', { text: `${info.percent}%` }));
    const track = el('div', { style: { height: '6px', borderRadius: '4px', background: 'var(--surface-2)', marginTop: '8px', overflow: 'hidden' } });
    const fill = el('div', { style: { height: '100%', width: `${Math.min(100, info.percent)}%`, background: 'var(--accent)', borderRadius: '4px' } });
    track.append(fill);
    card.append(track);
    card.append(el('small', { text: `${info.sold} из ${info.total} часов` }));
    return card;
  }

  function render(data) {
    const revenue = data.revenue || {};
    const load = data.load || {};
    const kpis = el('div', { class: 'ads-kpis' });
    kpis.append(
      kpi('Оплачено за месяц', money(revenue.paid_month)),
      kpi('Оплачено всего', money(revenue.paid_total)),
      kpi('Ожидает оплаты', money(revenue.unpaid_total)),
      kpi('Возвраты', money(revenue.refunded_total))
    );
    content.append(kpis);

    const loadRow = el('div', { class: 'ads-kpis' });
    if (load.days_7) loadRow.append(loadBar('Загрузка на 7 дней', load.days_7));
    if (load.days_30) loadRow.append(loadBar('Загрузка на 30 дней', load.days_30));
    content.append(loadRow);

    const exportRow = el('div', { class: 'ads-toolbar' });
    exportRow.append(
      button('Экспорт дохода CSV', {
        variant: 'btn-secondary btn-sm',
        onClick: () => window.open('/api/admin/ads/revenue/export', '_blank')
      }),
      el('span', { class: 'field__hint', text: `Цена по умолчанию: ${money(settings.price_per_hour)} за час` })
    );
    content.append(exportRow);

    const unpaid = el('div', { class: 'admin-panel' });
    unpaid.append(el('strong', { text: 'Неоплаченные брони' }));
    if (!revenue.unpaid_campaigns || !revenue.unpaid_campaigns.length) {
      unpaid.append(el('p', { class: 'field__hint', text: 'Все брони оплачены.' }));
    } else {
      const list = el('div', { class: 'ads-list', style: { marginTop: '10px' } });
      for (const campaign of revenue.unpaid_campaigns) {
        const row = el('div', { class: 'ads-list__row' });
        const main = el('div', { class: 'ads-list__main' });
        main.append(el('div', { class: 'ads-list__title', text: campaign.advertiser_name }));
        main.append(
          el('div', {
            class: 'ads-list__meta',
            text: `${campaign.starts_at ? `${dayLabel(dayKeyOf(campaign.starts_at))} · ${new Date(campaign.starts_at * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'без часов'} · ${formatSum(campaign.price_total)}`
          })
        );
        const actions = el('div', { class: 'ads-list__actions' });
        actions.append(
          button('Отметить оплату', {
            variant: 'btn-primary btn-sm',
            onClick: async () => {
              try {
                await api.post(`/admin/ads/campaigns/${campaign.id}/payment`, { paid_status: 'paid' });
                toast('Оплата отмечена', 'success');
                await load();
                if (refresh) refresh();
              } catch (err) {
                toast(err.message || 'Не удалось обновить оплату', 'error');
              }
            }
          })
        );
        row.append(main, actions);
        list.append(row);
      }
      unpaid.append(list);
    }
    content.append(unpaid);

    const top = el('div', { class: 'admin-panel' });
    top.append(el('strong', { text: 'Топ рекламодателей' }));
    if (!revenue.top_advertisers || !revenue.top_advertisers.length) {
      top.append(el('p', { class: 'field__hint', text: 'Оплаченных кампаний пока нет.' }));
    } else {
      const table = el('table', { class: 'ads-table', style: { marginTop: '8px' } });
      const thead = el('thead');
      const headRow = el('tr');
      ['Рекламодатель', 'Кампаний', 'Оплачено'].forEach((label) => headRow.append(el('th', { text: label })));
      thead.append(headRow);
      const tbody = el('tbody');
      for (const advertiser of revenue.top_advertisers) {
        const row = el('tr');
        row.append(el('td', { text: advertiser.advertiser_name }));
        row.append(el('td', { text: String(advertiser.campaigns) }));
        row.append(el('td', { text: money(advertiser.total) }));
        tbody.append(row);
      }
      table.append(thead, tbody);
      top.append(table);
    }
    content.append(top);

    const upcoming = el('div', { class: 'admin-panel' });
    upcoming.append(el('strong', { text: 'Ближайшие поступления' }));
    if (!revenue.upcoming || !revenue.upcoming.length) {
      upcoming.append(el('p', { class: 'field__hint', text: 'Будущих броней нет.' }));
    } else {
      const list = el('div', { class: 'ads-list', style: { marginTop: '10px' } });
      for (const item of revenue.upcoming) {
        const row = el('div', { class: 'ads-list__row' });
        const main = el('div', { class: 'ads-list__main' });
        main.append(el('div', { class: 'ads-list__title', text: item.advertiser_name }));
        main.append(el('div', { class: 'ads-list__meta', text: `${dayLabel(dayKeyOf(item.starts_at))} · ${groupHoursText([item.starts_at])}` }));
        row.append(main, paymentChip(item.paid_status), el('span', { text: money(item.price_total) }));
        list.append(row);
      }
      upcoming.append(list);
    }
    content.append(upcoming);
  }

  await load();
  return root;
}
