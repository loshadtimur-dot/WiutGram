import { api } from '../api.js?v=31';
import { el, button } from '../ui.js?v=31';
import { getState } from '../state.js?v=31';
import { navigate } from '../router.js?v=31';
import { glassSvg } from '../components/glass.js?v=31';

export default async function DesignPreviewPage() {
  const me = getState().user;
  if (!me || me.role !== 'owner') {
    navigate('/swipe', { replace: true });
    return null;
  }
  const root = el('div', { class: 'shop-page' });
  const head = el('div', { class: 'shop-head' });
  const text = el('div');
  text.append(el('h1', { text: 'Графика: предпросмотр' }));
  text.append(el('p', { text: 'Все подарки, стеклянные эмодзи, баннеры и фоны на разных размерах и в двух темах.' }));
  head.append(text);
  head.append(button('Назад в админку', { variant: 'btn-secondary', onClick: () => navigate('/admin') }));
  root.append(head);

  const body = el('div');
  root.append(body);
  body.append(el('div', { class: 'loading-row', html: '<div class="spinner"></div>' }));

  let assets;
  try {
    assets = await api.get('/admin/design/assets');
  } catch (err) {
    body.innerHTML = '';
    body.append(el('div', { class: 'purchase__note', text: err.message || 'Не удалось загрузить ассеты' }));
    return { el: root };
  }

  body.innerHTML = '';

  /* Gifts */
  const giftsSection = el('section', { class: 'design-section' });
  giftsSection.append(el('h2', { text: `Подарки · ${assets.gifts.length}` }));
  const gifts = el('div', { class: 'design-gifts' });
  for (const gift of assets.gifts) {
    const card = el('div', { class: 'design-gift' });
    const art = el('div', { class: 'design-gift__art' });
    art.innerHTML = gift.svg;
    card.append(art);
    card.append(el('div', { class: 'design-gift__name', text: gift.name }));
    card.append(el('div', { class: `rarity-pill rarity-pill--${gift.rarity}`, text: gift.rarity }));
    gifts.append(card);
  }
  giftsSection.append(gifts);
  body.append(giftsSection);

  /* Glass */
  const glassSection = el('section', { class: 'design-section' });
  glassSection.append(el('h2', { text: `Стеклянные эмодзи · ${assets.glass.length}` }));
  const sizes = [16, 24, 32, 64];
  for (const pack of assets.packs) {
    const group = el('div', { style: { marginBottom: '12px' } });
    group.append(el('div', { class: 'emoji-pack__head' }, [el('strong', { text: pack.title })]));
    const grid = el('div', { class: 'emoji-grid' });
    for (const id of pack.items) {
      const cell = el('div', { class: 'emoji-button', style: { flexDirection: 'column', gap: '2px' } });
      for (const size of sizes) {
        const icon = el('span');
        icon.innerHTML = glassSvg(id, size);
        cell.append(icon);
      }
      grid.append(cell);
    }
    group.append(grid);
    glassSection.append(group);
  }
  const dark = el('div', { class: 'design-dark' });
  dark.append(el('div', { class: 'people-card__meta', text: 'Тёмная тема' }));
  for (const id of ['heart', 'star', 'bolt', 'rocket', 'crown', 'moon']) {
    for (const size of [16, 24, 32, 64]) {
      const icon = el('span', { style: { marginRight: '6px' } });
      icon.innerHTML = glassSvg(id, size);
      dark.append(icon);
    }
    dark.append(el('br'));
  }
  glassSection.append(dark);
  body.append(glassSection);

  /* Banners */
  const bannerSection = el('section', { class: 'design-section' });
  bannerSection.append(el('h2', { text: `Баннеры · ${assets.banners.length}` }));
  const banners = el('div', { class: 'design-banners' });
  for (const banner of assets.banners) {
    const node = el('div', { class: `design-banner banner-pattern-${banner.pattern}` });
    node.style.background = banner.theme;
    node.append(el('span', { text: banner.name }));
    banners.append(node);
  }
  bannerSection.append(banners);
  body.append(bannerSection);

  /* Backgrounds */
  const bgSection = el('section', { class: 'design-section' });
  bgSection.append(el('h2', { text: `Фоны · ${assets.backgrounds.length}` }));
  const bgs = el('div', { class: 'design-banners' });
  for (const background of assets.backgrounds) {
    const node = el('div', { class: `design-banner bg-pattern-${background.pattern}`, style: { height: '130px' } });
    node.style.background = background.theme;
    const label = el('span', { text: background.name });
    node.append(label);
    bgs.append(node);
  }
  bgSection.append(bgs);
  body.append(bgSection);

  return { el: root };
}

