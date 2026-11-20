'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { meView, profileView, photosFor, groupPhotos, joinedUser } = require('../lib/userView');
const { publicUser, normalizeList, cleanText } = require('../utils/sanitize');
const { INTEREST_IDS, LANGUAGES, LOOKING_FOR, GENDERS, INTERESTED_IN } = require('../utils/constants');
const { CITY, DISTRICTS, COURSE_VALUES } = require('../config');
const { deleteUpload } = require('../utils/files');
const { ensureSuperLikes, boostState, BOOST_DURATION_MS } = require('../lib/limits');
const { notifyDaily, logActivity } = require('../lib/notify');
const { hasBlocked, isBlockedBetween } = require('../lib/blocks');
const { nowIso, lastDays } = require('../utils/time');
const { oneOf, toInt, clamp } = require('../middleware/validate');
const cosmeticsStore = require('../lib/cosmetics/store');
const decorService = require('../lib/decor/service');

const router = express.Router();

router.use(requireAuth);

function profileCounts(userId) {
  const posts = db.get('SELECT COUNT(*) AS total FROM posts WHERE user_id = ?', [userId]);
  const likes = db.get(
    `SELECT COUNT(*) AS total FROM post_likes pl
     JOIN posts p ON p.id = pl.post_id WHERE p.user_id = ?`,
    [userId]
  );
  const views = db.get(
    `SELECT COALESCE(SUM(views_count), 0) AS total FROM posts WHERE user_id = ?`,
    [userId]
  );
  const profileViews = db.get(
    'SELECT COUNT(*) AS total FROM profile_views WHERE viewed_id = ?',
    [userId]
  );
  const matches = db.get(
    'SELECT COUNT(*) AS total FROM matches WHERE is_active = 1 AND (user_a = ? OR user_b = ?)',
    [userId, userId]
  );
  return {
    posts: posts ? posts.total : 0,
    likes: likes ? likes.total : 0,
    views: views ? views.total : 0,
    profile_views: profileViews ? profileViews.total : 0,
    matches: matches ? matches.total : 0
  };
}

router.get('/me', (req, res) => {
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const view = meView(user);
  view.super_likes_balance = ensureSuperLikes(user);
  view.boost = boostState(user);
  res.json({ user: view, counts: profileCounts(user.id) });
});

router.get('/me/blocked', (req, res) => {
  const rows = db.all(
    `SELECT u.*, b.created_at AS blocked_at FROM blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  const photoMap = groupPhotos(photosFor(rows.map((r) => r.id)));
  res.json({
    users: rows.map((row) =>
      publicUser(row, { photos: photoMap.get(row.id) || [], isOnline: false })
    )
  });
});

router.get('/me/viewers', (req, res) => {
  const limit = clamp(toInt(req.query.limit, 50), 1, 100);
  const rows = db.all(
    `SELECT u.*, MAX(pv.created_at) AS viewed_at
     FROM profile_views pv
     JOIN users u ON u.id = pv.viewer_id
     WHERE pv.viewed_id = ? AND u.is_incognito = 0 AND u.is_banned = 0
     GROUP BY pv.viewer_id
     ORDER BY viewed_at DESC
     LIMIT ?`,
    [req.user.id, limit]
  );
  const photoMap = groupPhotos(photosFor(rows.map((r) => r.id)));
  res.json({
    viewers: rows.map((row) => ({
      user: publicUser(row, { photos: photoMap.get(row.id) || [] }),
      viewed_at: row.viewed_at
    }))
  });
});

router.get('/me/post-likers', (req, res) => {
  const rows = db.all(
    `SELECT u.*, COUNT(pl.post_id) AS likes_count, MAX(pl.created_at) AS liked_at
     FROM post_likes pl
     JOIN posts p ON p.id = pl.post_id
     JOIN users u ON u.id = pl.user_id
     WHERE p.user_id = ?
     GROUP BY pl.user_id
     ORDER BY liked_at DESC
     LIMIT 100`,
    [req.user.id]
  );
  const photoMap = groupPhotos(photosFor(rows.map((r) => r.id)));
  res.json({
    users: rows.map((row) => ({
      user: publicUser(row, { photos: photoMap.get(row.id) || [] }),
      likes_count: row.likes_count,
      liked_at: row.liked_at
    }))
  });
});

// Aggregated statistics for the profile stats tab.
router.get('/me/stats', (req, res) => {
  const me = req.user.id;
  const range = toInt(req.query.range, 7) === 30 ? 30 : 7;
  const days = lastDays(range);
  const since = `${days[0]}T00:00:00.000Z`;

  const viewsRows = db.all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
     FROM profile_views WHERE viewed_id = ? AND created_at >= ?
     GROUP BY day`,
    [me, since]
  );
  const likesRows = db.all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
     FROM swipes WHERE to_id = ? AND action IN ('like', 'super') AND created_at >= ?
     GROUP BY day`,
    [me, since]
  );
  const matchRows = db.all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
     FROM matches WHERE (user_a = ? OR user_b = ?) AND created_at >= ?
     GROUP BY day`,
    [me, me, since]
  );

  const toSeries = (rows) => {
    const map = new Map(rows.map((r) => [r.day, r.total]));
    return days.map((day) => ({ day, value: map.get(day) || 0 }));
  };

  const totals = {
    profile_views: db.get('SELECT COUNT(*) AS t FROM profile_views WHERE viewed_id = ?', [me]).t,
    likes_received: db.get(
      "SELECT COUNT(*) AS t FROM swipes WHERE to_id = ? AND action = 'like'",
      [me]
    ).t,
    super_likes_received: db.get(
      "SELECT COUNT(*) AS t FROM swipes WHERE to_id = ? AND action = 'super'",
      [me]
    ).t,
    matches: db.get(
      'SELECT COUNT(*) AS t FROM matches WHERE is_active = 1 AND (user_a = ? OR user_b = ?)',
      [me, me]
    ).t,
    my_likes: db.get(
      "SELECT COUNT(*) AS t FROM swipes WHERE from_id = ? AND action IN ('like', 'super')",
      [me]
    ).t,
    posts: db.get('SELECT COUNT(*) AS t FROM posts WHERE user_id = ?', [me]).t,
    posts_likes: db.get(
      `SELECT COUNT(*) AS t FROM post_likes pl JOIN posts p ON p.id = pl.post_id WHERE p.user_id = ?`,
      [me]
    ).t,
    posts_views: db.get('SELECT COALESCE(SUM(views_count), 0) AS t FROM posts WHERE user_id = ?', [me])
      .t,
    story_views: db.get(
      `SELECT COUNT(*) AS t FROM story_views sv JOIN stories s ON s.id = sv.story_id WHERE s.user_id = ?`,
      [me]
    ).t
  };

  const reciprocity = totals.my_likes > 0 ? Math.round((totals.matches / totals.my_likes) * 100) : 0;

  const topPosts = db.all(
    `SELECT p.id, p.image_path, p.caption, p.created_at, p.views_count,
       (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments
     FROM posts p WHERE p.user_id = ?
     ORDER BY likes DESC, p.views_count DESC LIMIT 5`,
    [me]
  );

  const topViewed = db.all(
    `SELECT p.id, p.image_path, p.caption, p.created_at, p.views_count,
       (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments
     FROM posts p WHERE p.user_id = ?
     ORDER BY p.views_count DESC, p.id DESC LIMIT 5`,
    [me]
  );

  res.json({
    range,
    totals,
    reciprocity,
    series: {
      days,
      profile_views: toSeries(viewsRows),
      likes: toSeries(likesRows),
      matches: toSeries(matchRows)
    },
    top_posts: topPosts,
    top_viewed: topViewed
  });
});

router.put('/me', (req, res) => {
  const body = req.body || {};
  const updates = {};
  const now = nowIso();

  if (typeof body.display_name === 'string') {
    const name = cleanText(body.display_name, 40);
    if (name.length < 2) return res.status(400).json({ error: 'Укажите имя (2–40 символов)' });
    updates.display_name = name;
  }
  if (typeof body.bio === 'string') updates.bio = cleanText(body.bio, 500);
  if (typeof body.job === 'string') updates.job = cleanText(body.job, 80);
  if (typeof body.education === 'string') updates.education = cleanText(body.education, 80);

  if (body.height !== undefined) {
    if (body.height === null || body.height === '') {
      updates.height = null;
    } else {
      const height = toInt(body.height, 0);
      if (height < 100 || height > 250) {
        return res.status(400).json({ error: 'Рост должен быть от 100 до 250 см' });
      }
      updates.height = height;
    }
  }

  if (body.university_id !== undefined) {
    if (body.university_id === null || body.university_id === '') {
      updates.university_id = null;
    } else {
      const university = db.get(
        "SELECT * FROM universities WHERE id = ? AND is_active = 1 AND short_name = 'WIUT' COLLATE NOCASE",
        [toInt(body.university_id, 0)]
      );
      if (!university) {
        return res.status(400).json({ error: 'Wiutgram доступен только студентам WIUT' });
      }
      updates.university_id = university.id;
    }
  }
  if (body.faculty !== undefined) updates.faculty = cleanText(body.faculty, 80) || null;
  if (body.course !== undefined) {
    if (body.course === null || body.course === '') {
      updates.course = null;
    } else {
      const course = String(body.course);
      if (!COURSE_VALUES.includes(course)) return res.status(400).json({ error: 'Некорректный курс' });
      updates.course = course;
    }
  }
  if (body.district !== undefined) {
    if (!body.district) {
      updates.district = null;
    } else {
      const district = DISTRICTS.find(
        (item) => item.toLowerCase() === String(body.district).trim().toLowerCase()
      );
      if (!district) return res.status(400).json({ error: 'Выберите район из списка' });
      updates.district = district;
    }
  }
  updates.city = CITY;

  if (body.interests !== undefined) {
    const interests = normalizeList(body.interests, INTEREST_IDS, 10);
    if (interests.length < 3) return res.status(400).json({ error: 'Выберите минимум 3 интереса' });
    updates.interests = JSON.stringify(interests);
  }

  if (body.languages !== undefined) {
    const languages = normalizeList(body.languages, LANGUAGES, 6);
    updates.languages = JSON.stringify(languages);
  }

  if (typeof body.looking_for === 'string') {
    updates.looking_for = oneOf(body.looking_for, LOOKING_FOR, req.user.looking_for);
  }
  if (typeof body.gender === 'string') {
    updates.gender = oneOf(body.gender, GENDERS, req.user.gender);
  }
  if (typeof body.interested_in === 'string') {
    updates.interested_in = oneOf(body.interested_in, INTERESTED_IN, req.user.interested_in);
  }

  if (typeof body.instagram_link === 'string') {
    let link = cleanText(body.instagram_link, 200);
    if (link && !/^https?:\/\//i.test(link)) {
      link = `https://instagram.com/${link.replace(/^@/, '')}`;
    }
    updates.instagram_link = link;
  }

  const fields = Object.keys(updates);
  if (!fields.length) return res.status(400).json({ error: 'Нет данных для обновления' });

  const sql = `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
  db.run(sql, [...fields.map((f) => updates[f]), now, req.user.id]);
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: meView(user) });
});

router.put('/me/settings', (req, res) => {
  const body = req.body || {};
  const updates = {};

  const boolFields = [
    'is_incognito',
    'hide_online',
    'hide_age',
    'hide_district',
    'hide_from_discovery',
    'read_receipts',
    'prefer_my_university'
  ];
  for (const field of boolFields) {
    if (body[field] !== undefined) updates[field] = body[field] ? 1 : 0;
  }

  if (typeof body.theme === 'string') updates.theme = oneOf(body.theme, ['light', 'dark', 'auto'], 'auto');

  if (body.filter_age_min !== undefined || body.filter_age_max !== undefined) {
    let min = clamp(toInt(body.filter_age_min, req.user.filter_age_min), 18, 99);
    let max = clamp(toInt(body.filter_age_max, req.user.filter_age_max), 18, 99);
    if (min > max) [min, max] = [max, min];
    updates.filter_age_min = min;
    updates.filter_age_max = max;
  }

  if (typeof body.interested_in === 'string') {
    updates.interested_in = oneOf(body.interested_in, INTERESTED_IN, req.user.interested_in);
  }

  if (body.filter_university_id !== undefined) {
    if (!body.filter_university_id) {
      updates.filter_university_id = null;
    } else {
      const university = db.get('SELECT id FROM universities WHERE id = ? AND is_active = 1', [
        toInt(body.filter_university_id, 0)
      ]);
      updates.filter_university_id = university ? university.id : null;
    }
  }

  if (body.filter_course !== undefined) {
    if (!body.filter_course) {
      updates.filter_course = null;
    } else {
      const course = String(body.filter_course);
      updates.filter_course = COURSE_VALUES.includes(course) ? course : null;
    }
  }

  const fields = Object.keys(updates);
  if (!fields.length) return res.status(400).json({ error: 'Нет данных для обновления' });
  db.run(
    `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...fields.map((f) => updates[f]), nowIso(), req.user.id]
  );
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: meView(user) });
});

router.post('/me/photos', uploadLimiter, imageUpload('avatars'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Выберите изображение' });
  const total = db.get('SELECT COUNT(*) AS t FROM photos WHERE user_id = ?', [req.user.id]).t;
  if (total >= 9) {
    deleteUpload(`/uploads/avatars/${req.file.filename}`);
    return res.status(400).json({ error: 'Максимум 9 фото' });
  }
  const path = `/uploads/avatars/${req.file.filename}`;
  const createdAt = nowIso();
  const position = total;
  const result = db.run(
    'INSERT INTO photos (user_id, path, position, created_at) VALUES (?, ?, ?, ?)',
    [req.user.id, path, position, createdAt]
  );
  if (!req.user.avatar_path) {
    db.run('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?', [
      path,
      nowIso(),
      req.user.id
    ]);
  }
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.status(201).json({
    photo: { id: Number(result.lastInsertRowid), path, position },
    user: meView(user)
  });
});

router.delete('/me/photos/:id', (req, res) => {
  const photo = db.get('SELECT * FROM photos WHERE id = ? AND user_id = ?', [
    toInt(req.params.id, 0),
    req.user.id
  ]);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });
  db.run('DELETE FROM photos WHERE id = ?', [photo.id]);
  deleteUpload(photo.path);

  const remaining = db.all('SELECT * FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC', [
    req.user.id
  ]);
  remaining.forEach((row, index) => {
    db.run('UPDATE photos SET position = ? WHERE id = ?', [index, row.id]);
  });

  let avatar = req.user.avatar_path;
  if (avatar === photo.path) {
    avatar = remaining[0] ? remaining[0].path : null;
    db.run('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?', [
      avatar,
      nowIso(),
      req.user.id
    ]);
  }
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ ok: true, user: meView(user) });
});

router.put('/me/photos/order', (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order.map((id) => toInt(id, 0)) : [];
  const photos = db.all('SELECT * FROM photos WHERE user_id = ?', [req.user.id]);
  if (order.length !== photos.length) {
    return res.status(400).json({ error: 'Некорректный список фото' });
  }
  const owned = new Set(photos.map((p) => p.id));
  if (!order.every((id) => owned.has(id))) {
    return res.status(400).json({ error: 'Некорректный список фото' });
  }
  db.tx(() => {
    order.forEach((id, index) => {
      db.run('UPDATE photos SET position = ? WHERE id = ? AND user_id = ?', [
        index,
        id,
        req.user.id
      ]);
    });
    const first = db.get('SELECT path FROM photos WHERE id = ?', [order[0]]);
    db.run('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?', [
      first ? first.path : null,
      nowIso(),
      req.user.id
    ]);
  });
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ ok: true, user: meView(user) });
});

router.put('/me/avatar', (req, res) => {
  const photo = db.get('SELECT * FROM photos WHERE id = ? AND user_id = ?', [
    toInt(req.body?.photo_id, 0),
    req.user.id
  ]);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });
  db.tx(() => {
    db.run('UPDATE photos SET position = position + 1 WHERE user_id = ?', [req.user.id]);
    db.run('UPDATE photos SET position = 0 WHERE id = ?', [photo.id]);
    db.run('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?', [
      photo.path,
      nowIso(),
      req.user.id
    ]);
  });
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ ok: true, user: meView(user) });
});

router.post('/me/boost', (req, res) => {
  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const state = boostState(user);
  if (!state.can_boost) {
    return res.status(400).json({
      error: 'Буст уже активен или ещё недоступен',
      next_available_at: state.next_available_at,
      boost: state
    });
  }
  const now = nowIso();
  const until = new Date(Date.now() + BOOST_DURATION_MS).toISOString();
  db.run('UPDATE users SET boost_until = ?, last_boost_at = ?, updated_at = ? WHERE id = ?', [
    until,
    now,
    now,
    req.user.id
  ]);
  logActivity(req.user.id, 'boost', `user:${req.user.id}`);
  const updated = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ ok: true, boost: boostState(updated) });
});

// Public profile. Records a view according to the privacy rules.
router.get('/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const base = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!base) return res.status(404).json({ error: 'Профиль не найден' });
  const target = joinedUser(base.id) || base;
  if (target.is_banned) return res.status(404).json({ error: 'Профиль недоступен' });
  if (isBlockedBetween(req.user.id, target.id)) {
    return res.status(404).json({ error: 'Профиль недоступен' });
  }

  const isSelf = target.id === req.user.id;
  let recordedView = false;

  if (!isSelf && !req.user.is_incognito) {
    const lastView = db.get(
      `SELECT id FROM profile_views WHERE viewer_id = ? AND viewed_id = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, target.id, new Date(Date.now() - 60 * 60 * 1000).toISOString()]
    );
    if (!lastView) {
      db.run('INSERT INTO profile_views (viewer_id, viewed_id, created_at) VALUES (?, ?, ?)', [
        req.user.id,
        target.id,
        nowIso()
      ]);
      recordedView = true;
      notifyDaily({
        userId: target.id,
        type: 'profile_view',
        actorId: req.user.id,
        text: 'Кто-то посмотрел ваш профиль'
      });
    }
  }

  const photos = photosFor([target.id]).map((p) => ({ id: p.id, path: p.path, position: p.position }));
  const view = profileView(target, req.user, photos);

  const mySwipe = db.get('SELECT action FROM swipes WHERE from_id = ? AND to_id = ?', [
    req.user.id,
    target.id
  ]);
  const theirSwipe = db.get('SELECT action FROM swipes WHERE from_id = ? AND to_id = ?', [
    target.id,
    req.user.id
  ]);
  const match = db.get(
    `SELECT * FROM matches WHERE is_active = 1
     AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))`,
    [req.user.id, target.id, target.id, req.user.id]
  );

  const counts = { posts: db.get('SELECT COUNT(*) AS t FROM posts WHERE user_id = ?', [target.id]).t };
  if (isSelf) Object.assign(counts, profileCounts(target.id));

  const cosmetics = cosmeticsStore.profileCosmetics(target.id, { self: isSelf });
  const isFollowing = cosmeticsStore.isFollowing(req.user.id, target.id);
  const decorState = decorService.decorFor(target.id, req.user.id);
  const giftList = decorService.giftsFor(target.id, req.user);
  counts.gifts = giftList.length;

  res.json({
    user: view,
    is_self: isSelf,
    counts,
    cosmetics,
    decor: decorState,
    gifts: giftList.slice(0, 24),
    gift_stats: decorService.giftStats(target.id),
    is_following: isFollowing,
    follower_count: cosmetics.follow.followers,
    following_count: cosmetics.follow.following,
    recorded_view: recordedView,
    distance_km: null,
    my_swipe: mySwipe ? mySwipe.action : null,
    liked_me: theirSwipe ? ['like', 'super'].includes(theirSwipe.action) : false,
    super_liked_me: theirSwipe ? theirSwipe.action === 'super' : false,
    match: match ? { id: match.id, created_at: match.created_at } : null
  });
});

router.post('/:id/block', (req, res) => {
  const targetId = toInt(req.params.id, 0);
  if (!targetId || targetId === req.user.id) {
    return res.status(400).json({ error: 'Нельзя заблокировать этот профиль' });
  }
  const target = db.get('SELECT id, username FROM users WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', [
    req.user.id,
    targetId,
    nowIso()
  ]);
  db.run(
    `UPDATE matches SET is_active = 0
     WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)`,
    [req.user.id, targetId, targetId, req.user.id]
  );
  logActivity(req.user.id, 'block', `user:${targetId}`);
  res.json({ ok: true });
});

router.delete('/:id/block', (req, res) => {
  const targetId = toInt(req.params.id, 0);
  db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, targetId]);
  res.json({ ok: true });
});

router.get('/:id/blocked-status', (req, res) => {
  const targetId = toInt(req.params.id, 0);
  res.json({ blocked: hasBlocked(req.user.id, targetId) });
});

module.exports = router;
