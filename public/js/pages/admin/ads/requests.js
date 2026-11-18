import { api } from '../../../api.js?v=19';
import { el, button, toast, openModal } from '../../../ui.js?v=19';
import { formatSum } from '../../../ads-utils.js?v=19';
import { sectionHead, emptyState } from '../shared.js?v=19';
import { REQUEST_STATUS, statusChip, reasonDialog, groupHoursText } from './shared.js?v=19';
import { openBookingModal } from './booking.js?v=19';

const FILTERS = [
  ['', 'Все'],
  ['new', 'Новые'],
  ['contacted', 'Связались'],
  ['converted', 'В брони'],
  ['rejected', 'Отклонены'],
  ['expired', 'Истекли']
];

export default async function requestsSection({ refresh, settings }) {
  let filter = 'new';
  let requests = [];
  const root = el('div', { class: 'col', style: { gap: '14px' } });
  root.append(sectionHead('Заявки на рекламу', 'Заявки с публичной страницы /advertise'));

  const filters = el('div', { class: 'segmented' });
  for (const [value, label] of FILTERS) {
    const btn = el('button', {
      class: `segmented__item ${filter === value ? 'is-active' : ''}`,
      attrs: { type: 'button' },
      text: label
    });
    btn.addEventListener('click', () => {
      filter = value;
      filters.querySelectorAll('.segmented__item').forEach((node) => node.classList.toggle('is-active', node === btn));
      load();
    });
    filters.append(btn);
  }
  root.append(filters);
  const list = el('div', { class: 'ads-list' });
  root.append(list);

  async function load() {
    list.innerHTML = '';
    list.append(el('div', { class: 'skeleton', style: { height: '70px' } }));
    try {
      const data = await api.get(`/admin/ads/requests?status=${encodeURIComponent(filter)}`);
      requests = data.requests || [];
      render();
    } catch (err) {
      list.innerHTML = '';
      list.append(emptyState(err.message || 'Не удалось загрузить заявки'));
    }
  }

  function render() {
    list.innerHTML = '';
    if (!requests.length) {
      list.append(emptyState('Заявок с таким статусом нет'));
      return;
    }
    for (const request of requests) {
      const row = el('div', { class: 'ads-list__row' });
      const main = el('div', { class: 'ads-list__main' });
      const title = el('div', { class: 'ads-list__title' });
      const code = el('span', { text: request.code });
      code.style.fontVariantNumeric = 'tabular-nums';
      title.append(code);
      if (request.contact_name) title.append(el('span', { text: ` · ${request.contact_name}` }));
      main.append(title);
      main.append(el('div', { class: 'ads-list__meta', text: `${groupHoursText(request.hours)} · ${formatSum(request.total)}` }));
      main.append(
        el('div', {
          class: 'ads-list__meta',
          text: new Date(request.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
        })
      );
      if (request.note) main.append(el('div', { class: 'ads-list__meta', text: `Заметка: ${request.note}` }));

      const actions = el('div', { class: 'ads-list__actions' });
      actions.append(statusChip(REQUEST_STATUS[request.status] || request.status, request.status === 'new' ? 'owner' : ''));
      if (request.status !== 'converted') {
        actions.append(
          button('Создать бронь', {
            variant: 'btn-primary btn-sm',
            onClick: () =>
              openBookingModal({
                hours: request.hours,
                request,
                pricePerHour: settings.price_per_hour,
                onSaved: () => {
                  refresh();
                }
              })
          })
        );
      }
      if (request.status === 'new' || request.status === 'contacted') {
        actions.append(
          button('Связался', {
            variant: 'btn-secondary btn-sm',
            onClick: () => setStatus(request, 'contacted')
          })
        );
        actions.append(
          button('Отклонить', {
            variant: 'btn-ghost btn-sm',
            onClick: () =>
              reasonDialog({
                title: `Отклонить ${request.code}`,
                label: 'Причина (необязательно)',
                confirmLabel: 'Отклонить',
                onSubmit: async (reason) => {
                  await api.post(`/admin/ads/requests/${request.id}/status`, {
                    status: 'rejected',
                    note: reason
                  });
                  toast('Заявка отклонена', 'success');
                  await load();
                }
              })
          })
        );
      }
      actions.append(
        button('Заметка', {
          variant: 'btn-ghost btn-sm',
          onClick: () => openNote(request)
        })
      );
      row.append(main, actions);
      list.append(row);
    }
  }

  async function setStatus(request, status) {
    try {
      await api.post(`/admin/ads/requests/${request.id}/status`, { status });
      toast('Статус обновлён', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'Не удалось обновить заявку', 'error');
    }
  }

  function openNote(request) {
    const body = el('div', { class: 'col' });
    const input = el('textarea', { class: 'textarea', attrs: { rows: '4', maxlength: '1000' } });
    input.value = request.note || '';
    body.append(el('p', { class: 'field__hint', text: 'Заметка видна только владельцу.' }), input);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: `Заявка ${request.code}`, body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Сохранить', {
        variant: 'btn-primary',
        onClick: async () => {
          try {
            await api.post(`/admin/ads/requests/${request.id}/status`, {
              status: request.status,
              note: input.value.trim()
            });
            toast('Заметка сохранена', 'success');
            modal.close();
            await load();
          } catch (err) {
            toast(err.message || 'Не удалось сохранить', 'error');
          }
        }
      })
    );
  }

  await load();
  return root;
}
