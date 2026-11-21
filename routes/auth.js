'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { meView } = require('../lib/userView');
const { notify } = require('../lib/notify');
const sessions = require('../lib/sessions');
const totp = require('../lib/totp');
const ownerSecurity = require('../lib/ownerSecurity');
const { getSecret } = require('../lib/secret');
const {
  attachUser,
  requireAuth,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  COOKIE_NAME
} = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/rateLimit');
const {
  MESSAGES,
  validateEmail,
  validateUsername,
  validatePassword,
  oneOf,
  cleaned
} = require('../middleware/validate');
const { buildBirthdate, isAdult } = require('../utils/age');
const { CITY, DISTRICTS, COURSE_VALUES, COURSE_LABELS, MIN_OWNER_PASSWORD } = require('../config');
const { INTEREST_IDS, GENDERS, INTERESTED_IN, LOOKING_FOR } = require('../utils/constants');
const { normalizeList } = require('../utils/sanitize');
const { saveDataUrl, deleteUpload } = require('../utils/files');
const { nowIso } = require('../utils/time');
const { isMailerConfigured, sendMail } = require('../utils/mailer');

const router = express.Router();
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_AGE = 16;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Prefer the configured public URL, fall back to the request origin so local
// and preview deployments still produce working links.
function siteOrigin(req) {
  const configured = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!domain || !name) return String(email || '');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

// Single-use confirmation link, valid for 24 hours.
async function issueVerification(user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const link = `${siteOrigin(req)}/verify?token=${token}`;
  db.run('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
  db.run(
    'INSERT INTO email_verifications (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [user.id, hashToken(token), new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(), nowIso()]
  );
  const text = [
    `Привет, ${user.display_name || user.username}!`,
    '',
    'Подтвердите почту, чтобы активировать аккаунт Wiutgram.',
    `Ссылка действует 24 часа: ${link}`,
    '',
    'Если вы не регистрировались — просто проигнорируйте это письмо.'
  ].join('\n');
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#18181b">
      <h1 style="font-size:22px;margin:0 0 12px">Wiutgram</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Привет, ${user.display_name || user.username}! Подтвердите почту, чтобы активировать аккаунт.</p>
      <p style="margin:0 0 22px">
        <a href="${link}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#fd267a;color:#fff;text-decoration:none;font-weight:700">Подтвердить почту</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#71717a;line-height:1.6">Ссылка действует 24 часа. Если кнопка не работает, скопируйте адрес:<br><a href="${link}" style="color:#fd267a;word-break:break-all">${link}</a></p>
      <p style="margin:18px 0 0;font-size:13px;color:#a1a1aa">Если вы не регистрировались в Wiutgram — просто проигнорируйте это письмо.</p>
    </div>`;
  const sent = await sendMail({ to: user.email, subject: 'Подтвердите почту — Wiutgram', text, html });
  if (!sent) throw new Error('MAIL_NOT_CONFIGURED');
}

function parseBirthdate(body) {
  if (typeof body.birthdate === 'string' && body.birthdate) return body.birthdate;
  if (body.birth_year && body.birth_month && body.birth_day) {
    return buildBirthdate(body.birth_year, body.birth_month, body.birth_day);
  }
  return null;
}

// Wiutgram is open to Westminster International University in Tashkent only.
// A missing id defaults to WIUT so an older cached form can still register.
function resolveUniversity(rawId) {
  const id = Number(rawId);
  if (rawId !== undefined && rawId !== null && rawId !== '' && (!Number.isInteger(id) || id <= 0)) {
    return null;
  }
  if (!Number.isInteger(id) || id <= 0) {
    return db.get(
      "SELECT * FROM universities WHERE is_active = 1 AND short_name = 'WIUT' COLLATE NOCASE LIMIT 1"
    );
  }
  return db.get(
    "SELECT * FROM universities WHERE id = ? AND is_active = 1 AND short_name = 'WIUT' COLLATE NOCASE",
    [id]
  );
}

function startSession(req, res, user) {
  const sessionId = sessions.createSession(user.id, req);
  const token = signToken(user.id, sessionId, user.token_version);
  setAuthCookie(res, token, req);
  return token;
}

// Shared final step of a successful password (and optional 2FA) login.
function finishLogin(req, res, user) {
  const fresh = db.get('SELECT * FROM users WHERE id = ?', [user.id]);
  const now = nowIso();
  db.run(
    'UPDATE users SET last_seen = ?, last_ip = ?, last_login_at = ?, login_count = login_count + 1 WHERE id = ?',
    [now, sessions.clientIp(req), now, user.id]
  );
  sessions.recordLogin({ userId: user.id, identifier: user.email, success: true, req });
  const token = startSession(req, res, fresh);
  return res.json({
    user: meView(db.get('SELECT * FROM users WHERE id = ?', [user.id])),
    token,
    force_password_change: !!fresh.force_password_change
  });
}

// Public bootstrap info: is this the very first account?
router.get('/first-user', (req, res) => {
  const settings = db.listSettings();
  const realUsers = db.countRealUsers();
  res.json({
    first: realUsers === 0,
    real_users: realUsers,
    registration_open: settings.registration_open === '1' || realUsers === 0,
    site_name: settings.site_name || 'Wiutgram',
    city: CITY,
    min_owner_password: MIN_OWNER_PASSWORD
  });
});

router.get('/username-check', (req, res) => {
  const username = validateUsername(req.query.username);
  if (!username) return res.status(400).json({ available: false, error: MESSAGES.username });
  const taken = db.get('SELECT id FROM users WHERE username = ?', [username]);
  return res.json({ available: !taken, username });
});

router.post('/register', registerLimiter, async (req, res) => {
  const body = req.body || {};
  const settings = db.listSettings();
  const realUsers = db.countRealUsers();

  if (settings.registration_open !== '1' && realUsers > 0) {
    return res.status(403).json({ error: 'Регистрация временно закрыта' });
  }

  const email = validateEmail(body.email);
  if (!email) return res.status(400).json({ error: MESSAGES.email, field: 'email' });

  const password = validatePassword(body.password);
  if (!password) return res.status(400).json({ error: MESSAGES.password, field: 'password' });

  const willBeOwner = realUsers === 0;
  if (willBeOwner && password.length < MIN_OWNER_PASSWORD) {
    return res.status(400).json({
      error: `Пароль владельца должен быть не короче ${MIN_OWNER_PASSWORD} символов`,
      field: 'password'
    });
  }

  const username = validateUsername(body.username);
  if (!username) return res.status(400).json({ error: MESSAGES.username, field: 'username' });

  const displayName = cleaned(body.display_name, 40);
  if (displayName.length < 2) {
    return res.status(400).json({ error: MESSAGES.displayName, field: 'display_name' });
  }

  const birthdate = parseBirthdate(body);
  if (!birthdate) return res.status(400).json({ error: MESSAGES.birthdate, field: 'birthdate' });

  const minAge = Math.max(MIN_AGE, Number(settings.min_age) || MIN_AGE);
  if (!isAdult(birthdate, minAge)) {
    return res.status(400).json({ error: MESSAGES.adult, field: 'birthdate', code: 'underage' });
  }

  const gender = oneOf(body.gender, GENDERS, null);
  if (!gender) return res.status(400).json({ error: MESSAGES.gender, field: 'gender' });

  const interestedIn = oneOf(body.interested_in, INTERESTED_IN, null);
  if (!interestedIn) {
    return res.status(400).json({ error: MESSAGES.interestedIn, field: 'interested_in' });
  }

  const lookingFor = oneOf(body.looking_for, LOOKING_FOR, 'not_sure');

  const university = resolveUniversity(body.university_id);
  if (!university) {
    return res.status(400).json({
      error: 'Регистрация доступна только для студентов университета Westminster International University in Tashkent (WIUT)',
      field: 'university_id'
    });
  }

  const courseInput = body.course === '' || body.course === null || body.course === undefined
    ? null
    : String(body.course);
  // The form marks the course as optional, so registrations without it must pass too.
  const course = courseInput && COURSE_VALUES.includes(courseInput) ? courseInput : null;

  const faculty = cleaned(body.faculty, 80) || null;
  let district = null;
  if (body.district) {
    const found = DISTRICTS.find((item) => item.toLowerCase() === String(body.district).trim().toLowerCase());
    if (!found) return res.status(400).json({ error: 'Выберите район из списка', field: 'district' });
    district = found;
  }

  const interests = normalizeList(body.interests, INTEREST_IDS, 10);
  if (interests.length < 3) {
    return res.status(400).json({ error: MESSAGES.interests, field: 'interests' });
  }

  const rawPhotos = Array.isArray(body.photos) ? body.photos.filter(Boolean) : [];
  if (rawPhotos.length < 1 || rawPhotos.length > 9) {
    return res.status(400).json({ error: MESSAGES.photos, field: 'photos' });
  }

  if (db.get('SELECT id FROM users WHERE email = ?', [email])) {
    return res.status(409).json({ error: 'Этот email уже зарегистрирован', field: 'email' });
  }
  if (db.get('SELECT id FROM users WHERE username = ?', [username])) {
    return res.status(409).json({ error: 'Этот username занят', field: 'username' });
  }

  let passwordHash;
  try {
    passwordHash = bcrypt.hashSync(password, 10);
  } catch (err) {
    return res.status(500).json({ error: 'Не удалось создать аккаунт' });
  }

  const savedPaths = [];
  try {
    for (const dataUrl of rawPhotos.slice(0, 9)) {
      savedPaths.push(saveDataUrl(dataUrl, 'avatars'));
    }
  } catch (err) {
    for (const path of savedPaths) deleteUpload(path);
    return res.status(400).json({ error: 'Не удалось обработать фото. Используйте JPG, PNG или WEBP', field: 'photos' });
  }

  const createdAt = nowIso();
  const maxPhotos = Math.max(1, Number(settings.max_photos) || 9);
  const maxBio = Math.max(50, Number(settings.max_bio) || 500);

  let userId;
  try {
    userId = db.tx(() => {
      // Inside the transaction so two simultaneous registrations cannot both become owner.
      const isFirst = db.countRealUsers() === 0;
      const role = isFirst ? 'owner' : 'user';
      const result = db.run(
        `INSERT INTO users
         (username, email, password_hash, role, display_name, birthdate, gender, interested_in,
          looking_for, city, bio, interests, avatar_path, university_id, faculty, course, district,
          super_likes_balance, super_likes_reset_at, last_seen, created_at, updated_at,
          onboarding_done, last_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          username,
          email,
          passwordHash,
          role,
          displayName,
          birthdate,
          gender,
          interestedIn,
          lookingFor,
          CITY,
          cleaned(body.bio, maxBio),
          JSON.stringify(interests),
          savedPaths[0] || null,
          university.id,
          faculty,
          course,
          district,
          5,
          createdAt,
          createdAt,
          createdAt,
          createdAt,
          sessions.clientIp(req)
        ]
      );
      const id = Number(result.lastInsertRowid);
      const insertPhoto = db.q('INSERT INTO photos (user_id, path, position, created_at) VALUES (?, ?, ?, ?)');
      savedPaths.slice(0, maxPhotos).forEach((path, index) => insertPhoto.run(id, path, index, createdAt));
      return id;
    });
  } catch (err) {
    for (const path of savedPaths) deleteUpload(path);
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email или username уже заняты' });
    }
    return res.status(500).json({ error: 'Не удалось создать аккаунт' });
  }

  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);

  // When email delivery is configured, a new account must confirm its address
  // before the first sign-in. The owner account is never gated, so the site
  // cannot lock itself out, and a failed send falls back to the normal flow.
  if (isMailerConfigured() && user.role !== 'owner') {
    try {
      db.run('UPDATE users SET email_verified = 0 WHERE id = ?', [userId]);
      await issueVerification(user, req);
      const welcomeText = db.getSetting('welcome_message', 'Добро пожаловать в Wiutgram!');
      notify({ userId, type: 'system', text: welcomeText });
      return res.status(201).json({
        verification_required: true,
        email: user.email,
        user: { display_name: user.display_name, username: user.username }
      });
    } catch (err) {
      console.error('verification email failed:', err.message);
      db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);
    }
  }

  const welcome = db.getSetting('welcome_message', 'Добро пожаловать в Wiutgram!');
  notify({ userId, type: 'system', text: welcome });
  sessions.recordLogin({ userId, identifier: email, success: true, req });
  db.run('UPDATE users SET last_login_at = ?, login_count = login_count + 1 WHERE id = ?', [createdAt, userId]);

  const token = startSession(req, res, user);
  return res.status(201).json({
    user: meView(db.get('SELECT * FROM users WHERE id = ?', [userId])),
    owner: user.role === 'owner',
    token,
    welcome
  });
});

// Opens the link from the confirmation email.
router.post('/verify-email', authLimiter, async (req, res) => {
  const token = String((req.body && req.body.token) || '').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Ссылка недействительна' });
  }
  const row = db.get('SELECT * FROM email_verifications WHERE token_hash = ? AND used_at IS NULL', [
    hashToken(token)
  ]);
  if (!row) return res.status(400).json({ error: 'Ссылка уже использована или устарела' });
  if (row.expires_at < nowIso()) {
    return res.status(400).json({ error: 'Срок действия ссылки истёк — запросите новое письмо' });
  }
  db.run('UPDATE email_verifications SET used_at = ? WHERE id = ?', [nowIso(), row.id]);
  db.run('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', [nowIso(), row.user_id]);
  return res.json({ ok: true });
});

// Repeat confirmation letter. Always answers ok so the endpoint cannot be used
// to check which addresses are registered.
router.post('/resend-verification', registerLimiter, async (req, res) => {
  const email = validateEmail((req.body && req.body.email) || '');
  const user = email ? db.get('SELECT * FROM users WHERE email = ?', [email]) : null;
  if (user && user.email_verified === 0 && !user.is_banned) {
    const last = db.get(
      'SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [user.id]
    );
    const tooSoon = last && Date.now() - new Date(last.created_at).getTime() < 60 * 1000;
    if (!tooSoon) {
      try {
        await issueVerification(user, req);
      } catch (err) {
        console.error('verification email failed:', err.message);
      }
    }
  }
  return res.json({ ok: true });
});

router.post('/login', authLimiter, async (req, res) => {
  const body = req.body || {};
  const login = String(body.login || body.email || body.username || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!login || !password) {
    return res.status(400).json({ error: 'Введите email/username и пароль' });
  }

  const user = db.get('SELECT * FROM users WHERE email = ? OR username = ?', [login, login]);
  if (!user) {
    sessions.recordLogin({ userId: null, identifier: login, success: false, req });
    await ownerSecurity.progressiveDelay(2);
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Owners get a temporary lock after repeated failures on the account.
  if (user.role === 'owner') {
    const lock = ownerSecurity.lockStatus(user.id);
    if (lock.locked) {
      sessions.recordLogin({ userId: user.id, identifier: login, success: false, req });
      return res.status(429).json({
        error: `Слишком много попыток входа. Попробуйте через ${lock.retry_after_minutes} мин.`,
        code: 'owner_locked',
        retry_after_minutes: lock.retry_after_minutes
      });
    }
  }

  let ok = false;
  try {
    ok = bcrypt.compareSync(password, user.password_hash);
  } catch (err) {
    ok = false;
  }
  if (!ok) {
    sessions.recordLogin({ userId: user.id, identifier: login, success: false, req });
    if (user.role === 'owner') {
      await ownerSecurity.progressiveDelay(ownerSecurity.recentFailures(user.id));
      ownerSecurity.alertFailures(user);
    }
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  if (user.is_demo) {
    sessions.recordLogin({ userId: user.id, identifier: login, success: false, req });
    return res.status(403).json({ error: 'Демо-профиль нельзя использовать для входа' });
  }

  if (user.is_banned) {
    if (user.ban_until && user.ban_until < nowIso()) {
      db.run('UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?', [user.id]);
    } else {
      sessions.recordLogin({ userId: user.id, identifier: login, success: false, req });
      return res.status(403).json({
        error: 'Аккаунт заблокирован',
        code: 'banned',
        ban_reason: user.ban_reason || 'Нарушение правил сообщества'
      });
    }
  }

  if (user.email_verified === 0) {
    sessions.recordLogin({ userId: user.id, identifier: login, success: false, req });
    return res.status(403).json({
      error: `Подтвердите почту — письмо отправлено на ${maskEmail(user.email)}`,
      code: 'email_unverified',
      email: maskEmail(user.email)
    });
  }

  // Owners with TOTP enabled must confirm the second factor first.
  if (user.role === 'owner' && user.totp_enabled) {
    const challenge = jwt.sign({ uid: user.id, purpose: '2fa' }, getSecret(), { expiresIn: '5m' });
    return res.json({ two_factor_required: true, challenge });
  }

  return finishLogin(req, res, user);
});

// Second step of the owner login: TOTP code or a one-time backup code.
router.post('/login/2fa', authLimiter, async (req, res) => {
  const body = req.body || {};
  let payload = null;
  try {
    payload = jwt.verify(String(body.challenge || ''), getSecret());
  } catch (err) {
    payload = null;
  }
  if (!payload || payload.purpose !== '2fa' || !payload.uid) {
    return res.status(401).json({ error: 'Код подтверждения истёк. Войдите снова.' });
  }
  const user = db.get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  if (!user || !user.totp_enabled || user.role !== 'owner') {
    return res.status(401).json({ error: 'Двухфакторная аутентификация недоступна' });
  }
  if (user.is_banned) return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'banned' });

  const code = String(body.code || '').trim();
  let valid = totp.verifyTotp(totp.decryptSecret(user.totp_secret), code);
  if (!valid) {
    let stored = [];
    try {
      stored = JSON.parse(user.totp_backup_codes || '[]');
    } catch (err) {
      stored = [];
    }
    const left = totp.consumeBackupCode(stored, code);
    if (left) {
      db.run('UPDATE users SET totp_backup_codes = ? WHERE id = ?', [JSON.stringify(left), user.id]);
      valid = true;
    }
  }
  if (!valid) {
    sessions.recordLogin({ userId: user.id, identifier: user.email, success: false, req });
    await ownerSecurity.progressiveDelay(ownerSecurity.recentFailures(user.id));
    return res.status(401).json({ error: 'Неверный код подтверждения', code: 'bad_2fa' });
  }
  return finishLogin(req, res, user);
});

router.post('/logout', attachUser, (req, res) => {
  if (req.session) sessions.revokeSession(req.session.id);
  clearAuthCookie(res, req);
  res.json({ ok: true });
});

router.get('/me', attachUser, (req, res) => {
  const authHeader = String(req.headers.authorization || '');
  if (req.user && authHeader.startsWith('Bearer ') && !(req.cookies && req.cookies[COOKIE_NAME])) {
    // A session that started with a Bearer token gets the httpOnly cookie back
    // as soon as the browser allows it (for example after storage access is granted).
    setAuthCookie(res, authHeader.slice(7), req);
  }
  // Guests get a clean 200 with user:null so the client never logs a 401 in console.
  if (!req.user) {
    return res.json({ user: null, counts: {}, impersonation: null });
  }
  const unread = db.get(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  const likes = db.get(
    `SELECT COUNT(*) AS total FROM swipes s
     WHERE s.to_id = ? AND s.action IN ('like', 'super')
       AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.from_id = ? AND mine.to_id = s.from_id)`,
    [req.user.id, req.user.id]
  );
  const unreadMessages = db.get(
    `SELECT COUNT(*) AS total FROM messages m
     JOIN matches mt ON mt.id = m.match_id AND mt.is_active = 1
     WHERE m.sender_id != ? AND m.read_at IS NULL
       AND (mt.user_a = ? OR mt.user_b = ?)`,
    [req.user.id, req.user.id, req.user.id]
  );
  let impersonation = null;
  if (req.impersonation) {
    const owner = db.get('SELECT username, display_name FROM users WHERE id = ?', [req.impersonation.ownerId]);
    impersonation = {
      owner: owner ? owner.username : null,
      read_only: req.impersonation.readOnly
    };
  }
  res.json({
    user: meView(req.user),
    counts: {
      unread_notifications: unread ? unread.total : 0,
      likes: likes ? likes.total : 0,
      unread_messages: unreadMessages ? unreadMessages.total : 0
    },
    impersonation
  });
});

router.put('/password', attachUser, requireAuth, (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
  }
  if (!bcrypt.compareSync(String(currentPassword), req.user.password_hash)) {
    return res.status(403).json({ error: 'Текущий пароль неверен' });
  }
  const valid = validatePassword(newPassword);
  if (!valid) return res.status(400).json({ error: MESSAGES.password });

  if (req.user.role === 'owner' && valid.length < MIN_OWNER_PASSWORD) {
    return res.status(400).json({ error: `Пароль владельца должен быть не короче ${MIN_OWNER_PASSWORD} символов` });
  }

  const hash = bcrypt.hashSync(valid, 10);
  db.run(
    'UPDATE users SET password_hash = ?, force_password_change = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?',
    [hash, nowIso(), req.user.id]
  );

  // Keep the current session alive after the token version bump.
  const fresh = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const sessionId = sessions.createSession(fresh.id, req);
  const token = signToken(fresh.id, sessionId, fresh.token_version);
  setAuthCookie(res, token, req);
  if (req.session) sessions.revokeSession(req.session.id);
  res.json({ ok: true, user: meView(fresh), token });
});

router.put('/email', attachUser, requireAuth, (req, res) => {
  const { password, email } = req.body || {};
  if (!password || !bcrypt.compareSync(String(password), req.user.password_hash)) {
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  const validEmail = validateEmail(email);
  if (!validEmail) return res.status(400).json({ error: MESSAGES.email });
  const taken = db.get('SELECT id FROM users WHERE email = ? AND id != ?', [validEmail, req.user.id]);
  if (taken) return res.status(409).json({ error: 'Этот email уже используется' });
  db.run('UPDATE users SET email = ?, updated_at = ? WHERE id = ?', [validEmail, nowIso(), req.user.id]);
  res.json({ ok: true, email: validEmail });
});

router.delete('/account', attachUser, requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!password || !bcrypt.compareSync(String(password), req.user.password_hash)) {
    return res.status(403).json({ error: 'Пароль неверен' });
  }
  if (req.user.role === 'owner') {
    return res.status(400).json({
      error: 'Владелец не может удалить свой аккаунт. Передайте владение другому пользователю.'
    });
  }

  const files = [];
  db.all('SELECT path FROM photos WHERE user_id = ?', [req.user.id]).forEach((r) => files.push(r.path));
  db.all('SELECT image_path FROM posts WHERE user_id = ?', [req.user.id]).forEach((r) => files.push(r.image_path));
  db.all('SELECT media_path FROM stories WHERE user_id = ?', [req.user.id]).forEach((r) => files.push(r.media_path));
  db.all('SELECT image_path FROM messages WHERE sender_id = ? AND image_path IS NOT NULL', [req.user.id]).forEach(
    (r) => files.push(r.image_path)
  );
  if (req.user.avatar_path) files.push(req.user.avatar_path);

  db.run('DELETE FROM users WHERE id = ?', [req.user.id]);
  for (const file of new Set(files)) {
    if (file) deleteUpload(file);
  }
  clearAuthCookie(res, req);
  res.json({ ok: true });
});

module.exports = router;
module.exports.COURSE_LABELS = COURSE_LABELS;
