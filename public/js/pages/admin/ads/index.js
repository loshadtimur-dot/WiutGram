import { api } from '../../../api.js?v=24';
import { el, button, toast } from '../../../ui.js?v=24';
import { icon } from '../../../icons.js?v=24';
import { sectionHead } from '../shared.js?v=24';
import { formatSum } from '../../../ads-utils.js?v=24';
import calendarSection from './calendar.js?v=24';
import requestsSection from './requests.js?v=24';
import campaignsSection from './campaigns.js?v=24';
import bannersSection from './banners.js?v=24';
import revenueSection from './revenue.js?v=24';
import adsSettingsSection from './settings.js?v=24';

const TABS = [
  { id: 'calendar', label: 'Календарь' },
  { id: 'requests', label: 'Заявки' },
  { id: 'campaigns', label: 'Кампании' },
  { id: 'banners', label: 'Баннеры' },
  { id: 'revenue', label: 'Доход' },
  { id: 'settings', label: 'Настройки' }
];

const SECTIONS = {
  calendar: calendarSection,
  requests: requestsSection,
  campaigns: campaignsSection,
  banners: bannersSection,
  revenue: revenueSection,
  settings: adsSettingsSection
};

export default async function adsSection() {
  const requestedTab = new URLSearchParams(location.search).get('tab');
  let overview = null;
  let active = SECTIONS[requestedTab] ? requestedTab : 'calendar';

  const root = el('div', { class: 'col', style: { gap: '16px' } });
  const summary = el('div', { class: 'col', style: { gap: '12px' } });
  root.append(summary);

  const tabs = el('div', { class: 'ads-tabs', attrs: { role: 'tablist', 'aria-label': 'Разделы рекламы' } });
  const content = el('div');
  root.append(tabs, content);

  async function loadOverview() {
    summary.innerHTML = '';
    try {
      overview = await api.get('/admin/ads/overview');
      renderOverview();
    } catch (err) {
      summary.append(el('div', { class: 'admin-empty', text: err.message || 'Не удалось загрузить сводку' }));
    }
  }

  function renderOverview() {
    summary.innerHTML = '';
    summary.append(
      sectionHead('Реклама', 'Брони по часам, заявки, баннеры и доход. Время указано по Ташкенту.')
    );
    const kpis = el('div', { class: 'ads-kpis' });
    const cards = [
      ['Новые заявки', overview.counts.requests_new],
      ['Активные брони', overview.counts.campaigns_active],
      ['Баннеры', overview.counts.banners],
      ['Telegram', overview.settings.telegram ? `@${overview.settings.telegram}` : 'не указан']
    ];
    for (const [label, value] of cards) {
      const card = el('div', { class: 'ads-kpi' });
      card.append(el('span', { text: label }), el('strong', { text: String(value) }));
      if (label === 'Telegram' && !overview.settings.telegram) {
        card.append(el('small', { text: 'Укажите в настройках', style: { color: 'var(--danger)' } }));
      }
      kpis.append(card);
    }
    const paid = el('div', { class: 'ads-kpi' });
    paid.append(
      el('span', { text: 'Оплачено за месяц' }),
      el('strong', { text: formatSum(overview.revenue.paid_month) }),
      el('small', { text: `Ожидает: ${formatSum(overview.revenue.unpaid_total)}` })
    );
    kpis.append(paid);
    summary.append(kpis);

    if (overview.warnings && overview.warnings.length) {
      const warnings = el('div', { class: 'ads-warnings' });
      for (const warning of overview.warnings) {
        const row = el('div', { class: 'ads-warning' });
        row.innerHTML = icon('alert', { size: 15 });
        row.append(el('span', { text: warning.text }));
        if (warning.code === 'no_telegram') {
          row.append(
            button('Открыть настройки', {
              variant: 'btn-ghost btn-sm',
              onClick: () => switchTab('settings')
            })
          );
        }
        warnings.append(row);
      }
      summary.append(warnings);
    }
    updateTabBadges();
  }

  function updateTabBadges() {
    const count = overview ? overview.counts.requests_new : 0;
    const requestsTab = tabs.querySelector('[data-tab="requests"]');
    if (!requestsTab) return;
    const existing = requestsTab.querySelector('.ads-tab__badge');
    if (existing) existing.remove();
    if (count > 0) requestsTab.append(el('span', { class: 'ads-tab__badge', text: String(count) }));
  }

  function renderTabs() {
    tabs.innerHTML = '';
    for (const tab of TABS) {
      const btn = el('button', {
        class: `ads-tab ${active === tab.id ? 'is-active' : ''}`,
        attrs: { type: 'button', role: 'tab', 'aria-selected': active === tab.id ? 'true' : 'false' },
        text: tab.label
      });
      btn.dataset.tab = tab.id;
      btn.addEventListener('click', () => switchTab(tab.id));
      tabs.append(btn);
    }
    updateTabBadges();
  }

  function syncTabParam(id) {
    const url = new URL(location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  async function switchTab(id) {
    if (!SECTIONS[id]) return;
    active = id;
    syncTabParam(id);
    renderTabs();
    content.innerHTML = '';
    const skeleton = el('div', { class: 'col', style: { gap: '10px' } });
    for (let i = 0; i < 3; i += 1) skeleton.append(el('div', { class: 'skeleton', style: { height: '74px' } }));
    content.append(skeleton);
    try {
      const section = await SECTIONS[id]({
        refresh: () => {
          loadOverview();
          switchTab(active);
        },
        settings: overview ? overview.settings : { price_per_hour: 15000 }
      });
      content.innerHTML = '';
      if (section) content.append(section);
    } catch (err) {
      content.innerHTML = '';
      content.append(el('div', { class: 'admin-empty', text: err.message || 'Не удалось загрузить раздел' }));
      toast('Раздел рекламы недоступен', 'error');
    }
  }

  renderTabs();
  await loadOverview();
  switchTab(active);
  return root;
}
