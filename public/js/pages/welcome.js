import { el, button, avatarNode } from '../ui.js?v=25';
import { getState } from '../state.js?v=25';
import { navigate } from '../router.js?v=25';
import { icon } from '../icons.js?v=25';

export default function WelcomePage() {
  const user = getState().user;
  const isOwner = user && user.role === 'owner';

  const root = el('div', { class: 'welcome-screen' });
  root.style.minHeight = 'calc(100dvh - 120px)';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.textAlign = 'center';
  root.style.gap = '18px';
  root.style.padding = '20px';

  const glow = el('div', { class: 'welcome-glow' });
  glow.style.width = '220px';
  glow.style.height = '220px';
  glow.style.borderRadius = '50%';
  glow.style.background = 'radial-gradient(circle, rgba(253,38,122,.22), transparent 68%)';
  glow.style.position = 'absolute';
  glow.style.filter = 'blur(8px)';
  glow.style.pointerEvents = 'none';
  root.style.position = 'relative';
  root.append(glow);

  root.append(avatarNode(user || { display_name: 'UNI' }, 'xxl'));

  const title = el('h1');
  title.style.fontSize = 'clamp(26px, 5vw, 38px)';
  title.style.letterSpacing = '-0.03em';
  title.textContent = `Добро пожаловать, ${user ? user.display_name : 'друг'}!`;
  root.append(title);

  root.append(
    el('p', {
      class: 'muted',
      text: 'Профиль готов. Свайпайте вправо, чтобы найти взаимность — при взаимном лайке сразу откроется чат.',
      style: { maxWidth: '440px', lineHeight: '1.6' }
    })
  );

  if (isOwner) {
    const ownerCard = el('div', { class: 'card card-pad' });
    ownerCard.style.maxWidth = '460px';
    ownerCard.style.background = 'linear-gradient(135deg, rgba(253,38,122,.08), rgba(255,96,54,.08))';
    ownerCard.style.borderColor = 'rgba(253,38,122,.3)';
    const badge = el('div', { class: 'role-icon role-icon--owner' });
    badge.innerHTML = icon('crown', { size: 34, fill: true });
    ownerCard.append(badge);
    ownerCard.append(el('h3', { text: 'Вы — владелец Wiutgram', style: { margin: '8px 0 6px' } }));
    ownerCard.append(
      el('p', {
        class: 'muted',
        text: 'Ваш аккаунт создан первым, поэтому вы получили полный доступ: админ-панель, модерация, настройки сайта и демо-данные. Передать владение можно в разделе «Админ-панель».',
        style: { fontSize: '13px', lineHeight: '1.55', marginBottom: '12px' }
      })
    );
    ownerCard.append(
      button('Открыть админ-панель', {
        variant: 'btn-secondary',
        icon: 'shield',
        onClick: () => navigate('/admin')
      })
    );
    root.append(ownerCard);
  }

  const actions = el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '4px' } });
  actions.append(
    button('Начать свайпать', {
      variant: 'btn-primary',
      class: 'btn-lg',
      icon: 'flame',
      onClick: () => navigate('/swipe')
    })
  );
  actions.append(
    button('Заполнить профиль', {
      variant: 'btn-outline',
      onClick: () => navigate('/profile/edit')
    })
  );
  root.append(actions);

  return root;
}
