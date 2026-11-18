'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const helmet = require('helmet');
const cookie = require('cookie');
const { Server } = require('socket.io');

const db = require('./db');
const logger = require('./lib/logger');
const { getSecret } = require('./lib/secret');
const {
  attachUser,
  csrfGuard,
  requirePasswordChanged,
  requireWritable,
  resolveToken,
  COOKIE_NAME
} = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimit');
const presence = require('./lib/presence');
const { setIo } = require('./lib/io');
const { matchForUser } = require('./lib/matches');
const { isBlockedBetween } = require('./lib/blocks');
const { nowIso } = require('./utils/time');
const { ensureUploadDirs, UPLOAD_DIR } = require('./utils/files');
const activityHourly = require('./lib/activityHourly');
const ads = require('./lib/ads');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const cosmeticsRoutes = require('./routes/cosmetics');
const discoverRoutes = require('./routes/discover');
const swipeRoutes = require('./routes/swipes');
const matchRoutes = require('./routes/matches');
const messageRoutes = require('./routes/messages');
const postRoutes = require('./routes/posts');
const storyRoutes = require('./routes/stories');
const notificationRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const universitiesRoutes = require('./routes/universities');
const impersonationRoutes = require('./routes/impersonation');
const adsRoutes = require('./routes/ads');
const superlikeRoutes = require('./routes/superlikes');
const securityRoutes = require('./routes/security');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

ensureUploadDirs();
getSecret();

const app = express();
// Behind nginx/Caddy the real client IP arrives in X-Forwarded-For.
// TRUST_PROXY=false disables proxy trust entirely.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === 'false') app.set('trust proxy', false);
else if (trustProxy === 'true') app.set('trust proxy', true);
else if (trustProxy && Number.isFinite(Number(trustProxy))) app.set('trust proxy', Number(trustProxy));
else app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        mediaSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'", 'https:'],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '14mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

// The owner area and the API must never be indexed.
app.use((req, res, next) => {
  if (req.path === '/admin' || req.path.startsWith('/admin/') || req.path.startsWith('/api/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    }
  })
);

// API maintenance guard: only auth, settings and owner routes stay available.
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/auth') && !req.path.startsWith('/settings') && !req.path.startsWith('/admin')) {
    const maintenance = db.getSetting('maintenance_mode', '0') === '1';
    if (maintenance && (!req.user || req.user.role !== 'owner')) {
      return res.status(503).json({ error: 'Сайт на техническом обслуживании', code: 'maintenance' });
    }
  }
  return next();
});

app.use('/api', csrfGuard);
app.use('/api', apiLimiter);
app.use('/api', requirePasswordChanged);
app.use('/api', requireWritable);

const PACKAGE_VERSION = require('./package.json').version;

function healthPayload() {
  let dbOk = true;
  try {
    db.get('SELECT 1 AS ok');
  } catch (err) {
    dbOk = false;
  }
  return {
    ok: dbOk,
    time: nowIso(),
    db: db.driver,
    db_ok: dbOk,
    version: PACKAGE_VERSION,
    uptime: Math.round(process.uptime())
  };
}
app.get('/api/health', (req, res) => res.json(healthPayload()));
app.get('/health', (req, res) => res.json(healthPayload()));

app.use('/api/auth', authRoutes);
// Public bootstrap routes must be mounted before the auth-guarded routers below,
// which are mounted on /api and would otherwise reject anonymous requests.
app.use('/api/settings', settingsRoutes);
app.use('/api/universities', universitiesRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/superlikes', superlikeRoutes);
app.use('/api/impersonation', impersonationRoutes);
// Owner-only areas are mounted before /api catch-all routers so guests get 404, not 401.
app.use('/api/security', securityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/discover/search', searchRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/swipes', swipeRoutes);
app.use('/api', messageRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/search', searchRoutes);
app.use('/api', postRoutes);
app.use('/api', storyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', cosmeticsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Маршрут API не найден' });
});

// Search engines need a real XML sitemap; robots.txt used to point at the SPA fallback.
app.get('/sitemap.xml', (req, res) => {
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const urls = ['/', '/advertise'];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${base}${url}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');
  res.type('application/xml').send(body);
});

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '1h',
    setHeaders(res, filePath) {
      // HTML, JS and CSS must always be revalidated so deploys take effect.
      if (/\.(html|js|css|json)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  })
);

// SPA fallback for all client routes.
app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}: ${err.message}`, err.stack ? err.stack.split('\n')[1] : '');
  return res.status(status).json({
    error: status >= 500 ? 'Внутренняя ошибка сервера' : err.message || 'Ошибка запроса'
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 1e6
});
setIo(io);

// Socket authentication reuses the HTTP-only cookie and the session table.
io.use((socket, next) => {
  try {
    const rawCookies = socket.handshake.headers.cookie || '';
    const parsed = cookie.parse(rawCookies);
    // Browsers that block third-party cookies still authenticate with the Bearer token.
    const handshakeToken = socket.handshake.auth && socket.handshake.auth.token;
    const resolved = resolveToken(parsed[COOKIE_NAME] || handshakeToken);
    if (!resolved || resolved.banned) return next(new Error('unauthorized'));
    socket.data.user = resolved.user;
    socket.data.session = resolved.session;
    return next();
  } catch (err) {
    return next(new Error('unauthorized'));
  }
});

function presencePayload(userId, online) {
  const row = db.get('SELECT last_seen FROM users WHERE id = ?', [userId]);
  return {
    user_id: Number(userId),
    online,
    last_seen: row ? row.last_seen : null
  };
}

io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(`user:${user.id}`);
  const becameOnline = presence.addSocket(user.id, socket.id);
  db.run('UPDATE users SET last_seen = ? WHERE id = ?', [nowIso(), user.id]);

  if (becameOnline && !user.hide_online) {
    io.emit('presence:update', presencePayload(user.id, true));
  }

  socket.on('typing:start', (payload) => {
    const info = matchForUser(Number(payload?.match_id), user.id);
    if (!info) return;
    if (isBlockedBetween(user.id, info.other.id)) return;
    io.to(`user:${info.other.id}`).emit('typing:start', {
      match_id: info.match.id,
      user_id: user.id,
      name: user.display_name
    });
  });

  socket.on('typing:stop', (payload) => {
    const info = matchForUser(Number(payload?.match_id), user.id);
    if (!info) return;
    io.to(`user:${info.other.id}`).emit('typing:stop', {
      match_id: info.match.id,
      user_id: user.id
    });
  });

  socket.on('disconnect', () => {
    const wentOffline = presence.removeSocket(user.id, socket.id);
    if (!wentOffline) return;
    const lastSeen = nowIso();
    db.run('UPDATE users SET last_seen = ? WHERE id = ?', [lastSeen, user.id]);
    if (!user.hide_online) {
      io.emit('presence:update', { user_id: user.id, online: false, last_seen: lastSeen });
    }
  });
});

/* ---------- Background maintenance ---------- */

function safeJob(name, fn) {
  try {
    fn();
  } catch (err) {
    logger.error(`job ${name}: ${err.message}`);
  }
}

// Expired stories on boot and every 10 minutes.
safeJob('cleanupExpiredStories', () => db.cleanupExpiredStories());
setInterval(() => safeJob('cleanupExpiredStories', () => db.cleanupExpiredStories()), 10 * 60 * 1000).unref();

// Sessions older than 30 days are dropped once a day.
safeJob('cleanupSessions', () => db.cleanupSessions());
setInterval(() => safeJob('cleanupSessions', () => db.cleanupSessions()), 24 * 60 * 60 * 1000).unref();

// Advertising maintenance: stale requests and old impression rows.
safeJob('adsCleanup', () => ads.cleanup());
setInterval(() => safeJob('adsCleanup', () => ads.cleanup()), 60 * 60 * 1000).unref();

// Hourly activity snapshot for the public advertising page.
setInterval(() => safeJob('activityFlush', () => activityHourly.flush()), 60 * 1000).unref();

/* ---------- Lifecycle ---------- */

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`received ${signal}, shutting down`);
  safeJob('finalActivityFlush', () => activityHourly.flush());
  server.close(() => {
    try {
      io.close();
      db.raw.close();
    } catch (err) {
      // Ignore close errors.
    }
    process.exit(0);
  });
  // Do not hang forever on open keep-alive connections.
  setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('unhandledRejection', String(reason)));
process.on('uncaughtException', (err) => logger.error('uncaughtException', err.stack || err.message));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Wiutgram server running on http://localhost:${PORT} (db: ${db.driver})`);
});

module.exports = { app, server, io };
