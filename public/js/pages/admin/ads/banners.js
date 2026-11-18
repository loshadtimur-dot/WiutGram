import { api } from '../../../api.js?v=19';
import { el, button, toast } from '../../../ui.js?v=19';
import { sectionHead, emptyState } from '../shared.js?v=19';
import { openCropModal } from './crop.js?v=19';
import { withSudo } from './campaigns.js?v=19';

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export default async function bannersSection({ refresh }) {
  let banners = [];

  const root = el('div', { class: 'col', style: { gap: '14px' } });
  const input = el('input', { attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' } });
  input.style.display = 'none';

  const upload = button('Загрузить баннер', {
    variant: 'btn-primary',
    onClick: () => input.click()
  });
  root.append(
    sectionHead(
      'Библиотека баннеров',
      'Только изображения 4:1. Загрузите файл — мы обрежем его до 1600×400.',
      upload
    )
  );

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    openCropModal(file, {
      onUploaded: () => {
        load();
        if (refresh) refresh();
      }
    });
    input.value = '';
  });

  const grid = el('div', { class: 'ads-banner-grid' });
  root.append(grid);

  async function load() {
    grid.innerHTML = '';
    grid.append(el('div', { class: 'skeleton', style: { height: '120px' } }));
    try {
      const data = await api.get('/admin/ads/banners');
      banners = data.banners || [];
      render();
    } catch (err) {
      grid.innerHTML = '';
      grid.append(emptyState(err.message || 'Не удалось загрузить баннеры'));
    }
  }

  function render() {
    grid.innerHTML = '';
    if (!banners.length) {
      grid.append(
        emptyState(
          'Баннеров пока нет. Загрузите первое изображение 1600×400.',
          button('Загрузить баннер', { variant: 'btn-primary', onClick: () => input.click() })
        )
      );
      return;
    }
    for (const banner of banners) {
      const card = el('div', { class: 'ads-banner-card' });
      card.append(el('div', { class: 'ads-banner-card__thumb' }, [el('img', { attrs: { src: banner.path, alt: 'Баннер', loading: 'lazy' } })]));
      const body = el('div', { class: 'ads-banner-card__body' });
      const meta = el('div', { class: 'ads-banner-card__meta' });
      meta.append(el('div', { text: `${banner.width}×${banner.height} · ${formatSize(banner.bytes)}` }));
      meta.append(el('div', { text: banner.original_name || 'Без названия' }));
      if (banner.in_use) meta.append(el('div', { text: 'Используется в брони', style: { color: 'var(--accent)' } }));
      const actions = el('div', { class: 'ads-banner-card__actions' });
      actions.append(
        button('Удалить', {
          variant: 'btn-ghost btn-sm',
          onClick: () =>
            withSudo({
              title: 'Удалить баннер',
              description: banner.in_use
                ? 'Баннер используется. Удаление будет отклонено, пока он в активной брони.'
                : 'Файл будет удалён без возможности восстановления.',
              actionLabel: 'Удалить',
              onConfirm: async () => {
                await api.delete(`/admin/ads/banners/${banner.id}`);
                toast('Баннер удалён', 'success');
                await load();
              }
            })
        })
      );
      body.append(meta, actions);
      card.append(body);
      grid.append(card);
    }
  }

  await load();
  void banners;
  return root;
}
