import { api } from '../api.js?v=25';
import { el, toast } from '../ui.js?v=25';

// Landing page for the confirmation link from the email.
export default function VerifyEmailPage(ctx) {
  const token = String((ctx.query && ctx.query.token) || '');
  const root = el('div', { class: 'auth' });
  const panel = el('div', { class: 'auth__panel' });

  const wrap = el('div', { class: 'wizard', style: { padding: '20px 6px', textAlign: 'center' } });
  const badge = el('div', {
    style: {
      width: '64px',
      height: '64px',
      margin: '0 auto 14px',
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      fontSize: '28px',
      background: 'rgba(253, 38, 122, 0.12)'
    }
  });
  badge.textContent = '✉️';

  const title = el('h2', { class: 'wizard__title', text: 'Подтверждение почты' });
  const sub = el('p', { class: 'wizard__sub', text: 'Проверяем ссылку…' });
  const actions = el('div', {
    class: 'row',
    style: { justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }
  });
  const loginLink = el('a', { class: 'btn btn-primary', attrs: { href: '/login', 'data-link': '' } });
  loginLink.textContent = 'Перейти ко входу';
  actions.append(loginLink);

  wrap.append(badge, title, sub, actions);
  panel.append(wrap);
  root.append(panel);

  if (!token) {
    badge.textContent = '⚠️';
    sub.textContent = 'В ссылке нет кода подтверждения. Откройте письмо ещё раз или запросите новое.';
    return root;
  }

  api
    .post('/auth/verify-email', { token })
    .then(() => {
      badge.textContent = '✅';
      badge.style.background = 'rgba(34, 197, 94, 0.14)';
      sub.textContent = 'Почта подтверждена. Теперь можно войти в Wiutgram.';
      toast('Почта подтверждена', 'success');
    })
    .catch((err) => {
      badge.textContent = '⚠️';
      sub.textContent = err.message || 'Не удалось подтвердить почту';
      const hint = el('p', {
        class: 'field__hint',
        text: 'Войдите с email и паролем — на экране входа будет кнопка отправить письмо снова.'
      });
      wrap.insertBefore(hint, actions);
    });

  return root;
}
