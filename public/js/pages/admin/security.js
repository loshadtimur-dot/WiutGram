import { api } from '../../api.js?v=23';
import { el, button, toast, openModal } from '../../ui.js?v=23';
import { icon } from '../../icons.js?v=23';
import { sectionHead, fmtDateTime } from './shared.js?v=23';

function copyButton(text, label = 'Копировать') {
  return button(label, {
    variant: 'btn-secondary btn-sm',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast('Скопировано', 'success');
      } catch (err) {
        toast('Не удалось скопировать', 'error');
      }
    }
  });
}

function codeList(codes) {
  const list = el('div', { class: 'ads-hours-chips' });
  for (const code of codes) {
    const item = el('span', { class: 'ads-hour-chip', text: code });
    item.style.fontVariantNumeric = 'tabular-nums';
    item.style.letterSpacing = '0.05em';
    list.append(item);
  }
  return list;
}

export default async function securitySection() {
  const root = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(sectionHead('Безопасность владельца', 'Двухфакторная аутентификация, сессии и история входов'));

  const content = el('div', { class: 'col', style: { gap: '16px' } });
  root.append(content);

  let data = null;

  async function load() {
    content.innerHTML = '';
    content.append(el('div', { class: 'skeleton', style: { height: '120px' } }));
    try {
      data = await api.get('/security/overview');
      render();
    } catch (err) {
      content.innerHTML = '';
      content.append(el('div', { class: 'admin-empty', text: err.message || 'Не удалось загрузить данные' }));
    }
  }

  /* ---------- 2FA ---------- */

  function openEnableFlow() {
    api
      .post('/security/2fa/setup')
      .then((setup) => {
        const body = el('div', { class: 'col', style: { gap: '12px' } });
        body.append(
          el('p', {
            class: 'field__hint',
            text: 'Отсканируйте QR-код в Google Authenticator, Authy или 1Password, затем введите 6-значный код.'
          })
        );
        if (setup.qr) {
          const qr = el('img', { attrs: { src: setup.qr, alt: 'QR-код для 2FA', width: '200', height: '200' } });
          qr.style.margin = '0 auto';
          qr.style.borderRadius = '12px';
          body.append(qr);
        }
        const secretRow = el('div', { class: 'row', style: { justifyContent: 'space-between', gap: '8px' } });
        const secret = el('input', { class: 'input', attrs: { value: setup.secret, readonly: 'readonly', 'aria-label': 'Секрет' } });
        secret.style.fontFamily = 'monospace';
        secretRow.append(secret, copyButton(setup.secret));
        body.append(el('span', { class: 'field__label', text: 'Секрет для ручного ввода' }), secretRow);
        const code = el('input', {
          class: 'input',
          attrs: { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000' }
        });
        code.style.letterSpacing = '0.3em';
        code.style.textAlign = 'center';
        body.append(code);

        const footer = el('div', { class: 'row' });
        const modal = openModal({ title: 'Включить 2FA', body, footer });
        footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
        footer.append(
          button('Подтвердить', {
            variant: 'btn-primary',
            onClick: async () => {
              try {
                const result = await api.post('/security/2fa/enable', { code: code.value.trim() });
                modal.close();
                showBackupCodes(result.backup_codes);
                await load();
              } catch (err) {
                toast(err.message || 'Не удалось включить 2FA', 'error');
              }
            }
          })
        );
        code.focus();
      })
      .catch((err) => toast(err.message || 'Не удалось начать настройку', 'error'));
  }

  function showBackupCodes(codes) {
    const body = el('div', { class: 'col', style: { gap: '12px' } });
    body.append(
      el('p', {
        class: 'field__hint',
        text: 'Сохраните резервные коды в надёжном месте. Каждый код можно использовать один раз, повторно они не показываются.'
      })
    );
    body.append(codeList(codes));
    body.append(copyButton(codes.join('\n'), 'Скопировать все коды'));
    openModal({ title: 'Резервные коды', body });
  }

  function openDisableFlow() {
    const body = el('div', { class: 'col', style: { gap: '10px' } });
    body.append(el('p', { class: 'field__hint', text: 'Для отключения нужен пароль и текущий код или резервный код.' }));
    const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' } });
    const code = el('input', { class: 'input', attrs: { placeholder: 'Код из приложения или резервный код' } });
    body.append(password, code);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Отключить 2FA', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Отключить', {
        variant: 'btn-danger',
        onClick: async () => {
          try {
            await api.post('/security/2fa/disable', { password: password.value, code: code.value.trim() });
            toast('2FA отключена', 'success');
            modal.close();
            await load();
          } catch (err) {
            toast(err.message || 'Не удалось отключить 2FA', 'error');
          }
        }
      })
    );
  }

  function openBackupCodesFlow() {
    const body = el('div', { class: 'col', style: { gap: '10px' } });
    body.append(el('p', { class: 'field__hint', text: 'Новые коды заменят старые. Введите пароль.' }));
    const password = el('input', { class: 'input', attrs: { type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' } });
    body.append(password);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Новые резервные коды', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Создать', {
        variant: 'btn-primary',
        onClick: async () => {
          try {
            const result = await api.post('/security/2fa/backup-codes', { password: password.value });
            modal.close();
            showBackupCodes(result.backup_codes);
            await load();
          } catch (err) {
            toast(err.message || 'Не удалось создать коды', 'error');
          }
        }
      })
    );
  }

  /* ---------- Password ---------- */

  function passwordCard() {
    const card = el('div', { class: 'admin-panel' });
    card.append(el('strong', { text: 'Смена пароля' }));
    card.append(el('p', { class: 'field__hint', text: 'Минимум 10 символов для владельца.' }));
    const grid = el('div', { class: 'ads-form-grid' });
    const current = el('input', { class: 'input', attrs: { type: 'password', autocomplete: 'current-password', placeholder: 'Текущий пароль' } });
    const next = el('input', { class: 'input', attrs: { type: 'password', autocomplete: 'new-password', placeholder: 'Новый пароль' } });
    const repeat = el('input', { class: 'input', attrs: { type: 'password', autocomplete: 'new-password', placeholder: 'Повторите пароль' } });
    [current, next, repeat].forEach((input) => grid.append(input));
    card.append(grid);
    card.append(
      button('Сменить пароль', {
        variant: 'btn-primary',
        class: 'btn-sm',
        onClick: async () => {
          if (next.value.length < 10) {
            toast('Пароль должен быть не короче 10 символов', 'error');
            return;
          }
          if (next.value !== repeat.value) {
            toast('Пароли не совпадают', 'error');
            return;
          }
          try {
            await api.put('/auth/password', { current_password: current.value, new_password: next.value });
            toast('Пароль изменён', 'success');
            current.value = '';
            next.value = '';
            repeat.value = '';
          } catch (err) {
            toast(err.message || 'Не удалось сменить пароль', 'error');
          }
        }
      })
    );
    return card;
  }

  /* ---------- Render ---------- */

  function render() {
    content.innerHTML = '';

    const twoFa = el('div', { class: 'admin-panel' });
    const twoFaHead = el('div', { class: 'row', style: { justifyContent: 'space-between' } });
    const twoFaTitle = el('div');
    twoFaTitle.append(el('strong', { text: 'Двухфакторная аутентификация' }));
    twoFaTitle.append(
      el('p', {
        class: 'field__hint',
        text: data.two_factor.enabled
          ? `Включена ${fmtDateTime(data.two_factor.enabled_at)}. Резервных кодов: ${data.two_factor.backup_codes_left}.`
          : 'Дополнительная защита входа в аккаунт владельца через приложение-аутентификатор.'
      })
    );
    twoFaHead.append(twoFaTitle);
    const actions = el('div', { class: 'row', style: { gap: '6px' } });
    if (data.two_factor.enabled) {
      actions.append(button('Резервные коды', { variant: 'btn-secondary btn-sm', onClick: openBackupCodesFlow }));
      actions.append(button('Отключить', { variant: 'btn-ghost btn-sm', onClick: openDisableFlow }));
    } else {
      actions.append(button('Включить 2FA', { variant: 'btn-primary btn-sm', onClick: openEnableFlow }));
    }
    twoFaHead.append(actions);
    twoFa.append(twoFaHead);
    content.append(twoFa);

    if (data.lock && data.lock.locked) {
      const locked = el('div', { class: 'ads-warning' });
      locked.innerHTML = icon('alert', { size: 15 });
      locked.append(
        el('span', {
          text: `Вход временно заблокирован после неудачных попыток. Осталось ${data.lock.retry_after_minutes} мин.`
        })
      );
      content.append(locked);
    }

    const sessionsCard = el('div', { class: 'admin-panel' });
    const sessionsHead = el('div', { class: 'row', style: { justifyContent: 'space-between' } });
    sessionsHead.append(el('strong', { text: 'Активные сессии' }));
    sessionsHead.append(
      button('Выйти на всех других устройствах', {
        variant: 'btn-secondary btn-sm',
        onClick: async () => {
          try {
            await api.post('/security/sessions/revoke-others');
            toast('Остальные сессии закрыты', 'success');
            await load();
          } catch (err) {
            toast(err.message || 'Не удалось закрыть сессии', 'error');
          }
        }
      })
    );
    sessionsCard.append(sessionsHead);
    const sessionList = el('div', { class: 'ads-list', style: { marginTop: '10px' } });
    for (const session of data.sessions) {
      const row = el('div', { class: 'ads-list__row' });
      const main = el('div', { class: 'ads-list__main' });
      main.append(el('div', { class: 'ads-list__title', text: session.device }));
      main.append(
        el('div', {
          class: 'ads-list__meta',
          text: `${session.ip || 'IP неизвестен'} · активна ${fmtDateTime(session.last_active_at)}`
        })
      );
      row.append(main);
      const rowActions = el('div', { class: 'ads-list__actions' });
      if (session.current) {
        rowActions.append(el('span', { class: 'admin-chip admin-chip--verified', text: 'Текущая' }));
      } else {
        rowActions.append(
          button('Завершить', {
            variant: 'btn-ghost btn-sm',
            onClick: async () => {
              try {
                await api.post(`/security/sessions/${encodeURIComponent(session.session_ref)}/revoke`);
                toast('Сессия завершена', 'success');
                await load();
              } catch (err) {
                toast(err.message || 'Не удалось завершить сессию', 'error');
              }
            }
          })
        );
      }
      row.append(rowActions);
      sessionList.append(row);
    }
    sessionsCard.append(sessionList);
    content.append(sessionsCard, passwordCard());

    const loginsCard = el('div', { class: 'admin-panel' });
    loginsCard.append(el('strong', { text: 'Последние входы' }));
    const loginList = el('div', { class: 'ads-list', style: { marginTop: '10px' } });
    if (!data.logins.length) loginList.append(el('p', { class: 'field__hint', text: 'История входов пуста.' }));
    for (const entry of data.logins) {
      const row = el('div', { class: 'ads-list__row' });
      const main = el('div', { class: 'ads-list__main' });
      main.append(el('div', { class: 'ads-list__title', text: entry.device }));
      main.append(el('div', { class: 'ads-list__meta', text: `${entry.ip || '—'} · ${fmtDateTime(entry.created_at)}` }));
      row.append(main, el('span', { class: `admin-chip ${entry.success ? 'admin-chip--verified' : 'admin-chip--banned'}`, text: entry.success ? 'Успешно' : 'Неудачно' }));
      loginList.append(row);
    }
    loginsCard.append(loginList);
    if (data.failures.length) {
      loginsCard.append(el('p', { class: 'field__hint', text: `Неудачные попытки: ${data.failures.length} за последнее время.` }));
    }
    content.append(loginsCard);
  }

  await load();
  return root;
}
