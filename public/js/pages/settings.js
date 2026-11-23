import { api, clearToken } from '../api.js?v=25';
import { storageGet, storageSet } from '../storage.js?v=25';
import {
  el,
  button,
  toast,
  openModal,
  confirmDialog,
  avatarNode,
  loadingRow,
  emptyState,
  passwordField,
  svgIcon
} from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { getState, setUser, patchUser, applyTheme, refreshMe } from '../state.js?v=25';
import { navigate } from '../router.js?v=25';
import { getLang, setLang } from '../i18n.js?v=1';

function section(iconName, title) {
  const card = el('section', { class: 'settings-section' });
  const head = el('div', { class: 'settings-section__head' });
  head.innerHTML = icon(iconName, { size: 18 });
  head.append(el('h2', { text: title }));
  card.append(head);
  const body = el('div', { class: 'settings-section__body' });
  card.append(body);
  return { card, body };
}

export default async function SettingsPage() {
  const root = el('div', { class: 'settings-page' });
  const head = el('div', { class: 'section__head' });
  const headText = el('div');
  headText.append(el('h1', { text: 'Настройки', style: { fontSize: '24px', letterSpacing: '-0.03em' } }));
  headText.append(el('p', { class: 'section__subtitle', text: 'Аккаунт, поиск, приватность и уведомления.' }));
  head.append(headText);
  root.append(head);

  const loader = el('div');
  loader.append(loadingRow('Загружаем настройки…'));
  root.append(loader);

  let user;
  let blocked = [];
  try {
    const [meData, blockedData] = await Promise.all([
      api.get('/users/me'),
      api.get('/users/me/blocked').catch(() => ({ users: [] }))
    ]);
    user = meData.user;
    blocked = blockedData.users || [];
  } catch (err) {
    loader.innerHTML = '';
    loader.append(emptyState('😕', 'Не удалось загрузить настройки', err.message || ''));
    return root;
  }
  loader.remove();

  function updateSetting(patch) {
    return api
      .put('/users/me/settings', patch)
      .then((data) => {
        patchUser(data.user);
        return data.user;
      })
      .catch((err) => {
        toast(err.message || 'Не удалось сохранить', 'error');
        throw err;
      });
  }

  /* Account */
  const account = section('user', 'Аккаунт');
  root.append(account.card);
  const emailRow = el('div', { class: 'settings-row' });
  const emailText = el('div');
  emailText.append(el('div', { class: 'settings-row__label', text: 'Email' }));
  emailText.append(el('div', { class: 'settings-row__value', text: user.email }));
  emailRow.append(emailText);
  emailRow.append(
    button('Изменить', {
      variant: 'btn-secondary',
      class: 'btn-sm',
      onClick: () => openEmailModal()
    })
  );
  account.body.append(emailRow);

  const usernameRow = el('div', { class: 'settings-row' });
  const usernameText = el('div');
  usernameText.append(el('div', { class: 'settings-row__label', text: 'Username' }));
  usernameText.append(el('div', { class: 'settings-row__value', text: `@${user.username}` }));
  usernameRow.append(usernameText);
  usernameRow.append(el('span', { class: 'field__hint', text: 'Нельзя изменить' }));
  account.body.append(usernameRow);

  const passwordRow = el('div', { class: 'settings-row' });
  const passwordText = el('div');
  passwordText.append(el('div', { class: 'settings-row__label', text: 'Пароль' }));
  passwordText.append(el('div', { class: 'settings-row__value', text: 'Минимум 8 символов' }));
  passwordRow.append(passwordText);
  passwordRow.append(
    button('Сменить пароль', { variant: 'btn-secondary', class: 'btn-sm', onClick: () => openPasswordModal() })
  );
  account.body.append(passwordRow);

  const sessionRow = el('div', { class: 'settings-row' });
  const sessionText = el('div');
  sessionText.append(el('div', { class: 'settings-row__label', text: 'Сеанс' }));
  sessionText.append(el('div', { class: 'settings-row__value', text: 'Вы вошли на этом устройстве' }));
  sessionRow.append(sessionText);
  sessionRow.append(
    button('Выйти', {
      variant: 'btn-secondary',
      class: 'btn-sm',
      onClick: async () => {
        await api.post('/auth/logout').catch(() => {});
        clearToken();
        setUser(null);
        window.dispatchEvent(new CustomEvent('uni:auth-changed'));
        toast('Вы вышли из аккаунта');
        navigate('/login', { replace: true });
      }
    })
  );
  account.body.append(sessionRow);

  function openEmailModal() {
    const body = el('div', { class: 'col' });
    const emailField = el('label', { class: 'field' });
    emailField.append(el('span', { class: 'field__label', text: 'Новый email' }));
    const emailInput = el('input', { class: 'input', attrs: { type: 'email', placeholder: 'new@example.com' } });
    emailField.append(emailInput);
    const pass = passwordField('Текущий пароль');
    body.append(emailField, pass.field);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Смена email', body, footer });
    footer.append(
      button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
      button('Сохранить', {
        variant: 'btn-primary',
        onClick: async () => {
          try {
            const data = await api.put('/auth/email', {
              email: emailInput.value.trim(),
              password: pass.input.value
            });
            user.email = data.email;
            patchUser({ email: data.email });
            emailText.querySelector('.settings-row__value').textContent = data.email;
            toast('Email обновлён', 'success');
            modal.close();
          } catch (err) {
            toast(err.message || 'Не удалось изменить email', 'error');
          }
        }
      })
    );
  }

  function openPasswordModal() {
    const body = el('div', { class: 'col' });
    const current = passwordField('Текущий пароль', { autocomplete: 'current-password' });
    const next = passwordField('Новый пароль', { autocomplete: 'new-password', hint: 'Минимум 8 символов' });
    const repeat = passwordField('Повторите новый пароль', { autocomplete: 'new-password' });
    body.append(current.field, next.field, repeat.field);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Смена пароля', body, footer });
    footer.append(
      button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
      button('Сменить', {
        variant: 'btn-primary',
        onClick: async () => {
          if (next.input.value !== repeat.input.value) {
            toast('Пароли не совпадают', 'error');
            return;
          }
          try {
            await api.put('/auth/password', {
              current_password: current.input.value,
              new_password: next.input.value
            });
            toast('Пароль изменён', 'success');
            modal.close();
          } catch (err) {
            toast(err.message || 'Не удалось сменить пароль', 'error');
          }
        }
      })
    );
  }

  /* Search preferences */
  const search = section('search', 'Параметры поиска');
  root.append(search.card);
  const searchRow = el('div', { class: 'settings-section__body' });
  searchRow.style.padding = '0';
  searchRow.style.gap = '12px';
  const ageFieldRow = el('div', { class: 'field-row' });
  const minAgeField = el('label', { class: 'field' });
  minAgeField.append(el('span', { class: 'field__label', text: 'Возраст от' }));
  const minAgeInput = el('input', { class: 'input', attrs: { type: 'number', min: '18', max: '99' } });
  minAgeInput.value = user.filter_age_min || 18;
  minAgeField.append(minAgeInput);
  const maxAgeField = el('label', { class: 'field' });
  maxAgeField.append(el('span', { class: 'field__label', text: 'Возраст до' }));
  const maxAgeInput = el('input', { class: 'input', attrs: { type: 'number', min: '18', max: '99' } });
  maxAgeInput.value = user.filter_age_max || 99;
  maxAgeField.append(maxAgeInput);
  ageFieldRow.append(minAgeField, maxAgeField);
  search.body.append(ageFieldRow);

  const universityField = el('label', { class: 'field' });
  universityField.append(el('span', { class: 'field__label', text: 'Университет в поиске' }));
  const filterUniversitySelect = el('select', { class: 'select' });
  filterUniversitySelect.append(el('option', { text: 'Все университеты', attrs: { value: '' } }));
  try {
    const list = await api.get('/universities');
    for (const university of list.universities || []) {
      filterUniversitySelect.append(
        el('option', { text: `${university.short_name} — ${university.name}`, attrs: { value: String(university.id) } })
      );
    }
  } catch (err) {
    // The selector still works with the "all" option.
  }
  filterUniversitySelect.value = user.filter_university_id ? String(user.filter_university_id) : '';
  universityField.append(filterUniversitySelect);
  search.body.append(universityField);

  const courseField = el('label', { class: 'field' });
  courseField.append(el('span', { class: 'field__label', text: 'Курс в поиске' }));
  const filterCourseSelect = el('select', { class: 'select' });
  filterCourseSelect.append(el('option', { text: 'Любой курс', attrs: { value: '' } }));
  [
    ['1', '1 курс'], ['2', '2 курс'], ['3', '3 курс'], ['4', '4 курс'], ['5', '5 курс'], ['6', '6 курс'],
    ['master', 'Магистратура'], ['graduate', 'Выпускник'], ['phd', 'Аспирант']
  ].forEach(([value, label]) => filterCourseSelect.append(el('option', { text: label, attrs: { value } })));
  filterCourseSelect.value = user.filter_course || '';
  courseField.append(filterCourseSelect);
  search.body.append(courseField);

  const preferRow = el('label', { class: 'switch' });
  const preferText = el('div', { class: 'switch__text' });
  preferText.append(el('div', { class: 'switch__title', text: 'Сначала мой университет' }));
  preferText.append(el('div', { class: 'switch__desc', text: 'Влияет только на порядок карточек' }));
  const preferInput = el('input', { attrs: { type: 'checkbox' } });
  preferInput.checked = user.prefer_my_university === undefined ? true : !!user.prefer_my_university;
  preferRow.append(preferText, preferInput);
  search.body.append(preferRow);

  const genderField = el('div', { class: 'field' });
  genderField.append(el('span', { class: 'field__label', text: 'Показывать' }));
  const segmented = el('div', { class: 'segmented' });
  let interestedIn = user.interested_in || 'everyone';
  [
    ['male', 'Мужчин'],
    ['female', 'Женщин'],
    ['everyone', 'Всех']
  ].forEach(([value, label]) => {
    const item = el('button', {
      class: `segmented__item ${interestedIn === value ? 'is-active' : ''}`,
      text: label,
      attrs: { type: 'button' }
    });
    item.addEventListener('click', () => {
      interestedIn = value;
      segmented.querySelectorAll('.segmented__item').forEach((node) => node.classList.remove('is-active'));
      item.classList.add('is-active');
    });
    segmented.append(item);
  });
  genderField.append(segmented);
  search.body.append(genderField);

  search.body.append(
    button('Сохранить параметры поиска', {
      variant: 'btn-primary',
      onClick: async () => {
        try {
          await updateSetting({
            filter_age_min: Number(minAgeInput.value),
            filter_age_max: Number(maxAgeInput.value),
            filter_university_id: filterUniversitySelect.value ? Number(filterUniversitySelect.value) : null,
            filter_course: filterCourseSelect.value || null,
            prefer_my_university: preferInput.checked,
            interested_in: interestedIn
          });
          toast('Параметры поиска сохранены', 'success');
        } catch (err) {
          // Toast already displayed.
        }
      }
    })
  );

  /* Privacy */
  const privacy = section('lock', 'Приватность');
  root.append(privacy.card);
  const toggles = [
    ['hide_online', 'Скрыть онлайн-статус', 'Другие не увидят, когда вы в сети'],
    ['hide_age', 'Скрыть возраст', 'Возраст не будет виден в профиле и карточках'],
    ['hide_district', 'Скрыть район', 'Не показывать район Ташкента в профиле и карточках'],
    ['is_incognito', 'Режим инкогнито', 'Ваши просмотры профилей не записываются'],
    ['hide_from_discovery', 'Скрыть меня из поиска', 'Профиль не появится в свайпах и поиске'],
    ['read_receipts', 'Уведомления о прочтении', 'Показывать собеседнику, что вы прочитали']
  ];
  for (const [key, title, desc] of toggles) {
    const row = el('label', { class: 'switch' });
    const textWrap = el('div', { class: 'switch__text' });
    textWrap.append(el('div', { class: 'switch__title', text: title }));
    textWrap.append(el('div', { class: 'switch__desc', text: desc }));
    const input = el('input', { attrs: { type: 'checkbox' } });
    input.checked = !!user[key];
    input.addEventListener('change', async () => {
      try {
        await updateSetting({ [key]: input.checked });
        user[key] = input.checked;
        toast('Настройка сохранена', 'success');
      } catch (err) {
        input.checked = !input.checked;
      }
    });
    row.append(textWrap, input);
    privacy.body.append(row);
  }

  /* Notifications prefs */
  const notificationsSection = section('bell', 'Уведомления');
  root.append(notificationsSection.card);
  const soundRow = el('label', { class: 'switch' });
  const soundText = el('div', { class: 'switch__text' });
  soundText.append(el('div', { class: 'switch__title', text: 'Звук новых сообщений' }));
  soundText.append(el('div', { class: 'switch__desc', text: 'Короткий звук при новом сообщении' }));
  const soundInput = el('input', { attrs: { type: 'checkbox' } });
  soundInput.checked = storageGet('uni:sound') !== '0';
  soundInput.addEventListener('change', () => {
    storageSet('uni:sound', soundInput.checked ? '1' : '0');
    toast(soundInput.checked ? 'Звук включён' : 'Звук выключен');
  });
  soundRow.append(soundText, soundInput);
  notificationsSection.body.append(soundRow);

  const pushRow = el('label', { class: 'switch' });
  const pushText = el('div', { class: 'switch__text' });
  pushText.append(el('div', { class: 'switch__title', text: 'Браузерные уведомления' }));
  pushText.append(el('div', { class: 'switch__desc', text: 'Показывать уведомления, когда вкладка неактивна' }));
  const pushInput = el('input', { attrs: { type: 'checkbox' } });
  pushInput.checked = storageGet('uni:push') === '1';
  pushInput.addEventListener('change', async () => {
    if (pushInput.checked) {
      if (!('Notification' in window)) {
        toast('Браузер не поддерживает уведомления', 'error');
        pushInput.checked = false;
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Разрешение на уведомления не выдано', 'error');
        pushInput.checked = false;
        return;
      }
      storageSet('uni:push', '1');
      toast('Браузерные уведомления включены', 'success');
    } else {
      storageSet('uni:push', '0');
      toast('Браузерные уведомления выключены');
    }
  });
  pushRow.append(pushText, pushInput);
  notificationsSection.body.append(pushRow);

  /* Appearance */
  const appearance = section('sun', 'Внешний вид');
  root.append(appearance.card);
  const themeOptions = el('div', { class: 'theme-options' });
  const themeDefs = [
    ['light', 'Светлая', 'light', 'sun'],
    ['dark', 'Тёмная', 'dark', 'moon'],
    ['auto', 'Авто', 'auto', 'monitor']
  ];
  for (const [value, label, swatch, iconName] of themeDefs) {
    const option = el('button', {
      class: `theme-option ${(user.theme || 'auto') === value ? 'is-active' : ''}`,
      attrs: { type: 'button' }
    });
    const sw = el('div', { class: `theme-swatch theme-swatch--${swatch}` });
    option.append(sw);
    const labelRow = el('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });
    labelRow.innerHTML = icon(iconName, { size: 14 });
    labelRow.append(el('span', { text: label }));
    option.append(labelRow);
    option.addEventListener('click', async () => {
      themeOptions.querySelectorAll('.theme-option').forEach((node) => node.classList.remove('is-active'));
      option.classList.add('is-active');
      applyTheme(value);
      try {
        await updateSetting({ theme: value });
        toast(`Тема: ${label.toLowerCase()}`, 'success');
      } catch (err) {
        // Revert handled by toast.
      }
    });
    themeOptions.append(option);
  }
  appearance.body.append(themeOptions);

  /* Interface language */
  const language = section('globe', 'Язык');
  root.append(language.card);
  const languageOptions = el('div', { class: 'shop-chips' });
  for (const [code, label] of [['ru', 'Русский'], ['en', 'English']]) {
    const option = el('button', {
      class: `shop-chip ${getLang() === code ? 'is-active' : ''}`,
      text: label,
      attrs: { type: 'button' }
    });
    option.addEventListener('click', () => {
      if (getLang() === code) return;
      setLang(code);
    });
    languageOptions.append(option);
  }
  language.body.append(languageOptions);

  /* Blocked users */
  const blockedSection = section('block', 'Заблокированные пользователи');
  root.append(blockedSection.card);
  function renderBlocked() {
    blockedSection.body.innerHTML = '';
    if (!blocked.length) {
      blockedSection.body.append(el('div', { class: 'field__hint', text: 'Вы пока никого не блокировали.' }));
      return;
    }
    for (const person of blocked) {
      const row = el('div', { class: 'list-row' });
      row.append(avatarNode(person, 'sm'));
      const body = el('div', { class: 'list-row__body' });
      body.append(el('div', { class: 'list-row__title', text: person.display_name }));
      body.append(el('div', { class: 'list-row__meta', text: `@${person.username}` }));
      row.append(body);
      row.append(
        button('Разблокировать', {
          variant: 'btn-secondary',
          class: 'btn-sm',
          onClick: async () => {
            try {
              await api.delete(`/users/${person.id}/block`);
              blocked = blocked.filter((item) => item.id !== person.id);
              renderBlocked();
              toast('Пользователь разблокирован', 'success');
            } catch (err) {
              toast(err.message || 'Не удалось разблокировать', 'error');
            }
          }
        })
      );
      blockedSection.body.append(row);
    }
  }
  renderBlocked();

  /* Help */
  const help = section('info', 'Помощь');
  root.append(help.card);
  const helpRow = el('div', { class: 'row' });
  helpRow.append(
    button('Правила сообщества', { variant: 'btn-outline', class: 'btn-sm', onClick: () => navigate('/rules') }),
    button('Политика конфиденциальности', { variant: 'btn-outline', class: 'btn-sm', onClick: () => navigate('/privacy') }),
    button('Реклама на сайте', { variant: 'btn-outline', class: 'btn-sm', onClick: () => navigate('/advertise') }),
    (() => {
      const link = el('a', {
        class: 'btn btn-secondary btn-sm',
        attrs: { href: 'mailto:hello@uni-lovers.uz?subject=UNI%20Lovers%20—%20обращение%20к%20владельцу' }
      });
      link.append(svgIcon('mail', { size: 15 }));
      link.append(el('span', { text: 'Связаться с владельцем' }));
      return link;
    })()
  );
  help.body.append(helpRow);
  help.body.append(
    el('div', {
      class: 'field__hint',
      text: `Аккаунт создан ${new Date(user.created_at).toLocaleDateString('ru-RU')}. Всего матчей: ${user.matches || '—'}.`
    })
  );

  /* Danger zone */
  const danger = section('alert', 'Удаление аккаунта');
  danger.card.classList.add('danger-zone');
  root.append(danger.card);
  danger.body.append(
    el('p', {
      class: 'field__hint',
      text: 'Аккаунт, фото, посты, лайки, истории и сообщения будут удалены безвозвратно.'
    })
  );
  danger.body.append(
    button('Удалить аккаунт', {
      variant: 'btn-danger',
      onClick: async () => {
        if (user.role === 'owner') {
          toast('Владелец не может удалить аккаунт. Сначала передайте владение.', 'error', 5000);
          return;
        }
        const body = el('div', { class: 'col' });
        body.append(el('p', { class: 'confirm-text', text: 'Введите пароль, чтобы подтвердить удаление аккаунта.' }));
        const pass = passwordField('Пароль');
        body.append(pass.field);
        const footer = el('div', { class: 'row' });
        const modal = openModal({ title: 'Удалить аккаунт?', body, footer });
        footer.append(
          button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
          button('Удалить навсегда', {
            variant: 'btn-danger',
            onClick: async () => {
              try {
                await api.delete('/auth/account', { password: pass.input.value });
                clearToken();
                setUser(null);
                window.dispatchEvent(new CustomEvent('uni:auth-changed'));
                toast('Аккаунт удалён');
                navigate('/', { replace: true });
              } catch (err) {
                toast(err.message || 'Не удалось удалить аккаунт', 'error');
              }
            }
          })
        );
      }
    })
  );

  return root;
}
