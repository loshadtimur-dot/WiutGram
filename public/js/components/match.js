import { el, avatarNode, button, colorFor } from '../ui.js?v=18';
import { icon } from '../icons.js?v=18';
import { navigate } from '../router.js?v=18';

function confettiLayer() {
  const layer = el('div', { class: 'confetti-layer', attrs: { 'aria-hidden': 'true' } });
  const colors = ['#ffffff', '#ffd0e2', '#1BA8FF', '#FDBF30', '#21D07A', '#A260E4'];
  for (let i = 0; i < 60; i += 1) {
    const piece = el('span', { class: 'confetti' });
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2.4 + Math.random() * 2.4}s`;
    piece.style.animationDelay = `${Math.random() * 1.6}s`;
    piece.style.width = `${5 + Math.random() * 7}px`;
    piece.style.height = `${8 + Math.random() * 10}px`;
    piece.style.borderRadius = Math.random() > 0.6 ? '50%' : '2px';
    layer.append(piece);
  }
  return layer;
}

// Full screen "It's a match" celebration.
export function showMatchScreen(match, options = {}) {
  const me = options.me || (match && match.me) || null;
  const other = (match && match.user) || options.user || null;
  if (!other) return null;

  const screen = el('div', { class: 'match-screen', attrs: { role: 'dialog', 'aria-modal': 'true' } });
  screen.append(confettiLayer());

  screen.append(el('div', { class: 'match-screen__title', text: 'Это взаимно!' }));
  screen.append(el('div', { class: 'match-screen__sub', text: `Вы и ${other.display_name} лайкнули друг друга` }));

  const avatars = el('div', { class: 'match-screen__avatars' });
  const left = el('div', { class: 'match-screen__avatar match-screen__avatar--left' });
  left.append(avatarNode(me || { display_name: 'Вы' }, 'xxl', { class: 'avatar--xxl' }));
  const right = el('div', { class: 'match-screen__avatar match-screen__avatar--right' });
  right.append(avatarNode(other, 'xxl'));
  const spark = el('div', { class: 'match-screen__spark' });
  spark.innerHTML = icon('sparkles', { size: 26 });
  avatars.append(left, right, spark);
  screen.append(avatars);

  const actions = el('div', { class: 'match-screen__actions' });
  const chatBtn = button('Написать сообщение', {
    variant: 'btn-primary',
    onClick: () => {
      close();
      navigate(`/chat/${match.id}`);
    }
  });
  const continueBtn = button('Продолжить свайпить', {
    variant: 'btn-ghost',
    onClick: () => {
      close();
      if (options.onContinue) options.onContinue();
      else navigate('/swipe');
    }
  });
  actions.append(chatBtn, continueBtn);
  screen.append(actions);

  const closeBtn = el('button', {
    class: 'story-viewer__close',
    attrs: { type: 'button', 'aria-label': 'Закрыть' },
    style: { top: '18px', right: '18px' }
  });
  closeBtn.innerHTML = icon('x', { size: 20 });
  screen.append(closeBtn);

  document.body.append(screen);
  document.body.style.overflow = 'hidden';

  function close() {
    screen.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }
  function onKey(event) {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', close);

  // Decorative gradient ring behind avatars.
  screen.style.background = `radial-gradient(120% 90% at 50% 0%, ${colorFor(
    other.display_name || 'uni'
  )[0]}, #b3125a 42%, #2c0a1d 100%)`;

  return { close };
}
