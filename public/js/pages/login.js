import { api, setToken } from '../api.js?v=24';
import { el, button, passwordField, toast, svgIcon } from '../ui.js?v=24';
import { setUser } from '../state.js?v=24';
import { navigate } from '../router.js?v=24';
import { icon } from '../icons.js?v=24';

export default function LoginPage(ctx) {
  const root = el('div', { class: 'auth' });

  const intro = el('div', { class: 'auth__intro' });
  intro.append(el('div', { class: 'auth__eyebrow' }));
  const title = el('h1');
  title.innerHTML = 'С возвращением в <span>Wiutgram</span>';
  intro.append(title);
  intro.append(
    el('p', {
      text: 'Войдите, чтобы вернуться к свайпам, матчам и сообщениям. Ваши совпадения никуда не пропали.'
    })
  );
  const points = el('div', { class: 'auth__points' });
  for (const [iconName, text] of [
    ['flame', 'Свайпы и матчи в реальном времени'],
    ['chat', 'Чаты с фото и статусами прочтения'],
    ['camera', 'Профиль в стиле Instagram']
  ]) {
    const point = el('div', { class: 'auth__point' });
    const iconWrap = el('div', { class: 'auth__point-icon' });
    iconWrap.innerHTML = icon(iconName, { size: 17 });
    point.append(iconWrap, el('span', { text }));
    points.append(point);
  }
  intro.append(points);
  root.append(intro);

  const panel = el('div', { class: 'auth__panel' });
  const head = el('div', { class: 'auth__panel-head' });
  head.append(el('h2', { class: 'auth__panel-title', text: 'Вход' }));
  panel.append(head);

  const form = el('form', { class: 'auth__form', attrs: { novalidate: 'novalidate' } });
  const errorBox = el('div', { class: 'field__error hidden', attrs: { role: 'alert' } });

  const loginField = el('label', { class: 'field' });
  loginField.append(el('span', { class: 'field__label', text: 'Email или username' }));
  const loginInput = el('input', {
    class: 'input',
    attrs: {
      type: 'text',
      name: 'login',
      placeholder: 'you@example.com',
      autocomplete: 'username',
      autocapitalize: 'none'
    }
  });
  loginField.append(loginInput);
  form.append(loginField);

  const pass = passwordField('Пароль', { autocomplete: 'current-password' });
  form.append(pass.field);
  pass.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  form.append(errorBox);

  const submitBtn = button('Войти', { variant: 'btn-primary', class: 'btn-block btn-lg', type: 'submit' });
  form.append(submitBtn);

  let busy = false;
  let challenge = null;
  async function submit() {
    if (busy || challenge) return;
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    const login = loginInput.value.trim();
    const password = pass.input.value;
    if (!login || !password) {
      errorBox.textContent = 'Введите email/username и пароль';
      errorBox.classList.remove('hidden');
      return;
    }
    busy = true;
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'Входим…';
    try {
      const data = await api.post('/auth/login', { login, password });
      if (data.two_factor_required) {
        showSecondStep(data.challenge);
        return;
      }
      setToken(data.token);
      setUser(data.user);
      window.dispatchEvent(new CustomEvent('uni:auth-changed'));
      toast(`С возвращением, ${data.user.display_name}!`, 'success');
      const next = ctx.query.next && ctx.query.next.startsWith('/') ? ctx.query.next : '/swipe';
      navigate(next, { replace: true });
    } catch (err) {
      const message = err.data && err.data.code === 'banned'
        ? `Аккаунт заблокирован: ${err.data.ban_reason || 'нарушение правил'}`
        : err.message || 'Не удалось войти';
      errorBox.textContent = message;
      errorBox.classList.remove('hidden');
      if (err.status === 0) toast('Сервер недоступен', 'error');
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  }

  // Second step for owner accounts with TOTP enabled.
  function showSecondStep(challengeValue) {
    challenge = challengeValue;
    form.innerHTML = '';
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    form.append(errorBox);

    const field = el('label', { class: 'field' });
    field.append(el('span', { class: 'field__label', text: 'Код подтверждения' }));
    const codeInput = el('input', {
      class: 'input',
      attrs: {
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
        maxlength: '12',
        placeholder: '000000',
        'aria-label': 'Код двухфакторной аутентификации'
      }
    });
    codeInput.style.letterSpacing = '0.25em';
    codeInput.style.textAlign = 'center';
    codeInput.style.fontSize = '18px';
    field.append(codeInput);
    field.append(
      el('span', { class: 'field__hint', text: 'Введите 6-значный код из приложения или резервный код.' })
    );
    form.append(field);
    const confirmBtn = button('Подтвердить', { variant: 'btn-primary', class: 'btn-block btn-lg' });
    confirmBtn.type = 'button';
    form.append(confirmBtn);
    const back = el('button', { class: 'btn btn-ghost btn-sm', attrs: { type: 'button' }, text: 'Ввести пароль заново' });
    back.addEventListener('click', () => navigate('/login', { replace: true }));
    form.append(back);

    let checking = false;
    async function submitCode() {
      if (checking) return;
      const code = codeInput.value.trim();
      if (!code) {
        errorBox.textContent = 'Введите код подтверждения';
        errorBox.classList.remove('hidden');
        return;
      }
      checking = true;
      confirmBtn.disabled = true;
      try {
        const data = await api.post('/auth/login/2fa', { challenge, code });
        setToken(data.token);
        setUser(data.user);
        window.dispatchEvent(new CustomEvent('uni:auth-changed'));
        toast(`С возвращением, ${data.user.display_name}!`, 'success');
        const next = ctx.query.next && ctx.query.next.startsWith('/') ? ctx.query.next : '/swipe';
        navigate(next, { replace: true });
      } catch (err) {
        errorBox.textContent = err.message || 'Неверный код';
        errorBox.classList.remove('hidden');
        codeInput.select();
      } finally {
        checking = false;
        confirmBtn.disabled = false;
      }
    }
    confirmBtn.addEventListener('click', submitCode);
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitCode();
      }
    });
    setTimeout(() => codeInput.focus(), 60);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  loginInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  panel.append(form);

  const footer = el('div', { class: 'auth__footer' });
  footer.append(el('span', { text: 'Нет аккаунта? ' }));
  footer.append(el('a', { text: 'Создать аккаунт', attrs: { href: '/register' } }));
  panel.append(footer);
  root.append(panel);

  const back = el('a', { class: 'legal__back', attrs: { href: '/' }, style: { position: 'fixed', left: '22px', bottom: '22px' } });
  back.append(svgIcon('arrowLeft', { size: 16 }));
  back.append(el('span', { text: 'На главную' }));
  root.append(back);

  setTimeout(() => loginInput.focus(), 80);
  return root;
}
