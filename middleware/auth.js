'use strict';

const jwt = require('jsonwebtoken');
const db = require('../db');
const { getSecret } = require('../lib/secret');
const sessions = require('../lib/sessions');
const activityHourly = require('../lib/activityHourly');
const { nowIso } = require('../utils/time');

const COOKIE_NAME = 'uni_token';
const TOKEN_DAYS = 30;

function readToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function signToken(userId, sessionId, tokenVersion) {
  return jwt.sign(
    { uid: userId, sid: sessionId, v: Number(tokenVersion) || 0 },
    getSecret(),
    { expiresIn: `${TOKEN_DAYS}d` }
  );
}

function isSecureRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function cookieOptions(req) {
  const secure = process.env.NODE_ENV === 'production' || isSecureRequest(req);
  return {
    httpOnly: true,
    // HTTPS gets a partitioned SameSite=None cookie, which also works inside an
    // embedded preview iframe. Plain HTTP keeps the strict SameSite=Lax cookie.
    sameSite: secure ? 'none' : 'lax',
    secure,
    partitioned: secure,
    maxAge: TOKEN_DAYS * 24 * 60 * 60 * 1000,
    path: '/'
  };
}

function setAuthCookie(res, token, req) {
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
}

function clearAuthCookie(res, req) {
  const { maxAge, ...options } = cookieOptions(req);
  res.clearCookie(COOKIE_NAME, options);
}

// Resolves a raw JWT into { user, session } or null. Used by HTTP and socket.io.
function resolveToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch (err) {
    return null;
  }
  if (!payload || !payload.sid) return null;
  const session = sessions.getSession(payload.sid);
  if (!session || session.revoked_at) return null;
  const user = db.get('SELECT * FROM users WHERE id = ?', [payload.uid]);
  if (!user) return null;
  if (Number(payload.v) !== Number(user.token_version || 0)) return null;
  if (session.user_id !== user.id) return null;
  if (user.is_banned) {
    if (user.ban_until && user.ban_until < nowIso()) {
      db.run('UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?', [user.id]);
      user.is_banned = 0;
      user.ban_reason = null;
      user.ban_until = null;
    } else {
      return { user, session, banned: true };
    }
  }
  return { user, session, banned: false };
}

// Attaches req.user when a valid token is present. Never throws for guests.
function attachUser(req, res, next) {
  req.user = null;
  req.session = null;
  req.authError = null;
  req.impersonation = null;
  const token = readToken(req);
  if (!token) return next();

  const resolved = resolveToken(token);
  if (!resolved) {
    req.authError = 'invalid_token';
    return next();
  }
  if (resolved.banned) {
    req.authError = 'banned';
    req.bannedUser = resolved.user;
    return next();
  }

  req.user = resolved.user;
  req.session = resolved.session;
  sessions.touchSession(resolved.session.id);
  // Aggregate activity counters for the public advertising page.
  activityHourly.touch(resolved.user.id);
  if (resolved.session.impersonator_id) {
    req.impersonation = {
      ownerId: resolved.session.impersonator_id,
      readOnly: !!resolved.session.read_only,
      sessionId: resolved.session.id
    };
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.authError === 'banned') {
      return res.status(403).json({
        error: 'Аккаунт заблокирован',
        code: 'banned',
        ban_reason: req.bannedUser ? req.bannedUser.ban_reason : null
      });
    }
    return res.status(401).json({ error: 'Требуется авторизация', code: 'unauthorized' });
  }
  return next();
}

// Owner-only area. Everyone else, including guests, gets a 404 on purpose.
function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(404).json({ error: 'Не найдено' });
  }
  return next();
}

// Dangerous owner actions need a fresh password confirmation (10 minutes).
function requireSudo(req, res, next) {
  if (!req.user || req.user.role !== 'owner') return res.status(404).json({ error: 'Не найдено' });
  if (!sessions.hasSudo(req.session)) {
    return res.status(403).json({ error: 'Подтвердите пароль владельца', code: 'reauth_required' });
  }
  return next();
}

// Impersonation sessions are read-only unless the owner explicitly enabled writes.
function requireWritable(req, res, next) {
  const safeImpersonationPath = req.path.startsWith('/impersonation');
  if (
    req.impersonation &&
    req.impersonation.readOnly &&
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    !safeImpersonationPath
  ) {
    return res.status(403).json({ error: 'Режим просмотра: изменения недоступны', code: 'read_only' });
  }
  return next();
}

const PASSWORD_CHANGE_ALLOWED = ['/auth/password', '/auth/logout', '/auth/me', '/auth/email'];

// Users with a temporary password must set a new one before using the site.
function requirePasswordChanged(req, res, next) {
  if (!req.user || !req.user.force_password_change) return next();
  if (PASSWORD_CHANGE_ALLOWED.includes(req.path)) return next();
  return res.status(403).json({
    error: 'Смените временный пароль, чтобы продолжить',
    code: 'password_change_required'
  });
}

// Minimal CSRF protection: browsers send Origin/Referer for unsafe requests.
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const host = req.get('host');
  const origin = req.get('origin');
  const referer = req.get('referer');
  let source = null;
  try {
    if (origin && origin !== 'null') source = new URL(origin).host;
    else if (referer) source = new URL(referer).host;
  } catch (err) {
    source = 'invalid';
  }
  if (source && source !== host) {
    return res.status(403).json({ error: 'Запрос отклонён', code: 'csrf' });
  }
  return next();
}

// Admin API responses must never be cached.
function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
}

module.exports = {
  COOKIE_NAME,
  attachUser,
  requireAuth,
  requireOwner,
  requireSudo,
  requireWritable,
  requirePasswordChanged,
  csrfGuard,
  noStore,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  readToken,
  resolveToken,
  // Backwards-compatible aliases used by older route modules.
  requireRole: requireOwner,
  requireAdmin: requireOwner
};
