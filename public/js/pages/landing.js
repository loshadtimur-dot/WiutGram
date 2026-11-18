import { api } from '../api.js?v=19';
import { el, button } from '../ui.js?v=19';
import { icon } from '../icons.js?v=19';
import { navigate } from '../router.js?v=19';

const FEATURES = [
  {
    icon: 'graduation',
    title: 'Свой университет',
    text: 'Укажите вуз, факультет и курс — находите людей из своего университета или из любого другого в Ташкенте.'
  },
  {
    icon: 'users',
    title: 'Реальные профили',
    text: 'Только пользователи 18+. Верифицированные студенты отмечены галочкой, демо-профили помечены.'
  },
  {
    icon: 'lock',
    title: 'Приватность под контролем',
    text: 'Скрывайте район, возраст и онлайн-статус. Район и университет видны только так, как вы разрешите.'
  }
];

export default async function LandingPage() {
  const root = el('div', { class: 'landing' });

  const hero = el('div', { class: 'landing__hero' });
  const copy = el('div', { class: 'landing__copy' });
  copy.append(el('div', { class: 'landing__eyebrow', text: '18+ · Знакомства для студентов Ташкента' }));
  const title = el('h1', { class: 'landing__title' });
  title.innerHTML = 'Знакомства для студентов <span>Ташкента</span>';
  copy.append(title);
  copy.append(
    el('p', {
      class: 'landing__sub',
      text: 'Находите людей из своего и других университетов. Только 18+.'
    })
  );

  const cta = el('div', { class: 'landing__cta' });
  cta.append(
    button('Создать аккаунт', { variant: 'btn-primary', class: 'btn-lg', onClick: () => navigate('/register') })
  );
  cta.append(button('Войти', { variant: 'btn-secondary', class: 'btn-lg', onClick: () => navigate('/login') }));
  copy.append(cta);

  const firstHint = el('div', { class: 'landing__note hidden' });
  firstHint.textContent = 'Вы первый — этот аккаунт станет аккаунтом владельца сайта.';
  copy.append(firstHint);

  const stats = el('div', { class: 'landing__stats' });
  stats.innerHTML = `
    <div class="landing__stat"><strong>Ташкент</strong>один город</div>
    <div class="landing__stat"><strong>17+</strong>университетов</div>
    <div class="landing__stat"><strong>18+</strong>только взрослые</div>
  `;
  copy.append(stats);
  hero.append(copy);

  const visual = el('div', { class: 'landing__visual landing__visual--calm' });
  const cards = [
    { cls: 'back', name: 'Тимур, 22', meta: 'TUIT · 3 курс', tone: 'var(--surface-2)' },
    { cls: 'mid', name: 'Мадина, 21', meta: 'WIUT · 2 курс', tone: 'var(--accent-soft)' },
    { cls: 'front', name: 'Дилноза, 23', meta: 'NUUz · магистратура', tone: 'var(--surface)' }
  ];
  for (const card of cards) {
    const node = el('div', { class: `landing__card landing__card--${card.cls}` });
    node.style.background = card.tone;
    const avatar = el('div', { class: 'landing__avatar' });
    avatar.textContent = card.name.slice(0, 1);
    const body = el('div', { class: 'landing__card-body' });
    body.append(el('strong', { text: card.name }));
    body.append(el('span', { text: card.meta }));
    node.append(avatar, body);
    visual.append(node);
  }
  const likeBadge = el('div', { class: 'landing__badge landing__badge--like' });
  likeBadge.innerHTML = icon('heart', { size: 15 });
  likeBadge.append(el('span', { text: 'Взаимно' }));
  visual.append(likeBadge);
  hero.append(visual);
  root.append(hero);

  const features = el('div', { class: 'landing__features' });
  for (const feature of FEATURES) {
    const item = el('div', { class: 'landing__feature' });
    const iconWrap = el('div', { class: 'landing__feature-icon' });
    iconWrap.innerHTML = icon(feature.icon, { size: 19 });
    const body = el('div');
    body.append(el('h3', { text: feature.title }));
    body.append(el('p', { text: feature.text }));
    item.append(iconWrap, body);
    features.append(item);
  }
  root.append(features);

  const foot = el('div', { class: 'landing__foot' });
  foot.innerHTML = `
    <span>© ${new Date().getFullYear()} UNI Lovers</span>
    <a href="/rules">Правила сообщества</a>
    <a href="/privacy">Политика конфиденциальности</a>
    <a href="/advertise">Реклама на сайте</a>
    <span>Только для пользователей 18+</span>
  `;
  root.append(foot);

  try {
    const info = await api.get('/auth/first-user');
    if (info.first) {
      firstHint.classList.remove('hidden');
    }
    if (!info.registration_open) {
      const primary = cta.querySelector('.btn-primary');
      primary.textContent = 'Регистрация закрыта';
      primary.disabled = true;
    }
  } catch (err) {
    // The landing page still renders when the API is temporarily unavailable.
  }

  return root;
}
