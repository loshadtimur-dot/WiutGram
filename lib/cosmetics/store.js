'use strict';

const db = require('../../db');
const { nowIso } = require('../../utils/time');
const {
  RARITIES,
  BANNERS,
  BADGES,
  GIFTS,
  BANNER_MAP,
  BADGE_MAP,
  GIFT_MAP,
  giftWithOverrides,
  bannerView,
  badgeView
} = require('./catalog');

const DAY_MS = 24 * 60 * 60 * 1000;

function nowIsoSafe() {
  return nowIso();
}

function expiresAfter(months) {
  const amount = Number(months);
  if (!amount || amount <= 0) return null;
  return new Date(Date.now() + amount * 30 * DAY_MS).toISOString();
}

function giftOverrides() {
  return db.all('SELECT * FROM gift_overrides');
}

function overrideMap() {
  return new Map(giftOverrides().map((row) => [row.gift_id, row]));
}

function giftMeta(giftId) {
  const gift = GIFT_MAP.get(giftId);
  if (!gift) return null;
  const override = db.get('SELECT * FROM gift_overrides WHERE gift_id = ?', [giftId]);
  return giftWithOverrides(gift, override);
}

/* ---------- Follows and the Aura table ---------- */

function follow(followerId, followingId) {
  if (!followerId || !followingId || Number(followerId) === Number(followingId)) return false;
  db.run(
    'INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)',
    [followerId, followingId, nowIsoSafe()]
  );
  return true;
}

function unfollow(followerId, followingId) {
  db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
}

function isFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false;
  return !!db.get('SELECT 1 AS ok FROM follows WHERE follower_id = ? AND following_id = ?', [
    followerId,
    followingId
  ]);
}

function followCounts(userId) {
  const followers = db.get('SELECT COUNT(*) AS t FROM follows WHERE following_id = ?', [userId]);
  const following = db.get('SELECT COUNT(*) AS t FROM follows WHERE follower_id = ?', [userId]);
  return {
    followers: followers ? followers.t : 0,
    following: following ? following.t : 0
  };
}

// Popularity ranking: most followers first, newest account as a tie breaker.
function auraTable({ limit = 50, viewerId = null } = {}) {
  const rows = db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar_path, u.role, u.is_verified,
       COUNT(f.follower_id) AS followers
     FROM users u
     LEFT JOIN follows f ON f.following_id = u.id
     WHERE u.is_demo = 0 AND u.is_banned = 0
     GROUP BY u.id
     ORDER BY followers DESC, u.id ASC
     LIMIT ?`,
    [Math.max(1, Math.min(100, Number(limit) || 50))]
  );
  const ranked = rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_path: row.avatar_path,
    role: row.role,
    is_verified: !!row.is_verified,
    followers: Number(row.followers) || 0
  }));
  let me = ranked.find((row) => row.id === Number(viewerId)) || null;
  if (viewerId && !me) {
    const user = db.get('SELECT id, username, display_name, avatar_path, role, is_verified FROM users WHERE id = ?', [
      viewerId
    ]);
    if (user) {
      const counts = followCounts(user.id);
      const ahead = db.get(
        `SELECT COUNT(*) AS t FROM (
           SELECT following_id FROM follows GROUP BY following_id HAVING COUNT(*) > ?
         )`,
        [counts.followers]
      );
      me = {
        rank: (ahead ? ahead.t : 0) + 1,
        ...user,
        is_verified: !!user.is_verified,
        followers: counts.followers
      };
    }
  }
  return { leaders: ranked, me };
}

/* ---------- Banners ---------- */

function activeBannerGrant(userId, bannerId) {
  return db.get(
    `SELECT * FROM user_banners WHERE user_id = ? AND banner_id = ?
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY id DESC LIMIT 1`,
    [userId, bannerId, nowIsoSafe()]
  );
}

function grantBanner(userId, bannerId, months, byId) {
  if (!BANNER_MAP.has(bannerId)) return null;
  const expiresAt = expiresAfter(months);
  const result = db.run(
    'INSERT INTO user_banners (user_id, banner_id, granted_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, bannerId, byId || null, expiresAt, nowIsoSafe()]
  );
  return { id: Number(result.lastInsertRowid), expires_at: expiresAt };
}

function revokeBanner(userId, bannerId) {
  db.run('DELETE FROM user_banners WHERE user_id = ? AND banner_id = ?', [userId, bannerId]);
  const user = db.get('SELECT banner_id FROM users WHERE id = ?', [userId]);
  if (user && user.banner_id === bannerId) {
    db.run('UPDATE users SET banner_id = NULL WHERE id = ?', [userId]);
  }
}

function equipBanner(userId, bannerId) {
  if (!bannerId) {
    db.run('UPDATE users SET banner_id = NULL WHERE id = ?', [userId]);
    return true;
  }
  if (!BANNER_MAP.has(bannerId)) return false;
  const user = db.get('SELECT role FROM users WHERE id = ?', [userId]);
  const grant = activeBannerGrant(userId, bannerId);
  if (!grant && !(user && user.role === 'owner')) return false;
  db.run('UPDATE users SET banner_id = ? WHERE id = ?', [bannerId, userId]);
  return true;
}

/* ---------- Badges ---------- */

function activeBadgeGrants(userId) {
  return db.all(
    `SELECT * FROM user_badges WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY id ASC`,
    [userId, nowIsoSafe()]
  );
}

function grantBadge(userId, badgeId, months, byId) {
  if (!BADGE_MAP.has(badgeId)) return null;
  const expiresAt = expiresAfter(months);
  const result = db.run(
    'INSERT INTO user_badges (user_id, badge_id, granted_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, badgeId, byId || null, expiresAt, nowIsoSafe()]
  );
  return { id: Number(result.lastInsertRowid), expires_at: expiresAt };
}

function revokeBadge(userId, badgeId) {
  db.run('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?', [userId, badgeId]);
}

/* ---------- Gifts ---------- */

function giftRows(userId) {
  return db.all('SELECT * FROM user_gifts WHERE user_id = ? ORDER BY id DESC', [userId]);
}

// Groups duplicates so a profile never becomes a wall of identical cards.
function giftInventory(userId) {
  const rows = giftRows(userId);
  const grouped = new Map();
  for (const row of rows) {
    const meta = giftMeta(row.gift_id);
    if (!meta) continue;
    if (!grouped.has(row.gift_id)) {
      grouped.set(row.gift_id, {
        gift_id: row.gift_id,
        name: meta.name,
        rarity: meta.rarity,
        rarity_label: meta.rarity_label,
        rarity_color: meta.rarity_color,
        price: meta.price,
        count: 0,
        hidden: 0,
        regifted: 0,
        rows: []
      });
    }
    const entry = grouped.get(row.gift_id);
    entry.count += 1;
    entry.hidden += row.is_hidden ? 1 : 0;
    entry.regifted += row.regifted ? 1 : 0;
    entry.rows.push({ id: row.id, regifted: !!row.regifted, hidden: !!row.is_hidden });
  }
  return [...grouped.values()].map((entry) => ({
    ...entry,
    is_hidden: entry.hidden >= entry.count,
    has_regifted: entry.regifted > 0
  }));
}

function grantGift(userId, giftId, quantity, byId) {
  if (!GIFT_MAP.has(giftId)) return 0;
  const amount = Math.max(1, Math.min(100, Number(quantity) || 1));
  const createdAt = nowIsoSafe();
  for (let index = 0; index < amount; index += 1) {
    db.run(
      `INSERT INTO user_gifts (user_id, gift_id, from_user_id, source, regifted, is_hidden, created_at)
       VALUES (?, ?, ?, 'admin', 0, 0, ?)`,
      [userId, giftId, byId || null, createdAt]
    );
  }
  return amount;
}

// Moves one gift from the sender to the receiver. Admin grants are always fresh.
function transferGift({ fromId, toId, giftId, admin = false }) {
  if (!GIFT_MAP.has(giftId) || !toId) return false;
  let owned = null;
  if (!admin) {
    owned = db.get(
      'SELECT * FROM user_gifts WHERE user_id = ? AND gift_id = ? ORDER BY regifted ASC, id ASC LIMIT 1',
      [fromId, giftId]
    );
    if (!owned) return false;
    db.run('DELETE FROM user_gifts WHERE id = ?', [owned.id]);
  }
  const result = db.run(
    `INSERT INTO user_gifts (user_id, gift_id, from_user_id, source, regifted, is_hidden, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [toId, giftId, admin ? null : fromId, admin ? 'admin' : 'user', admin ? 0 : 1, nowIsoSafe()]
  );
  return { id: Number(result.lastInsertRowid) };
}

function equipGift(userId, giftId) {
  if (!giftId) {
    db.run('UPDATE users SET equipped_gift_id = NULL WHERE id = ?', [userId]);
    return true;
  }
  const row = db.get('SELECT id FROM user_gifts WHERE user_id = ? AND gift_id = ? ORDER BY id DESC LIMIT 1', [
    userId,
    giftId
  ]);
  if (!row) return false;
  db.run('UPDATE users SET equipped_gift_id = ? WHERE id = ?', [row.id, userId]);
  return true;
}

function setGiftHidden(userId, giftId, hidden) {
  const result = db.run('UPDATE user_gifts SET is_hidden = ? WHERE user_id = ? AND gift_id = ?', [
    hidden ? 1 : 0,
    userId,
    giftId
  ]);
  return result.changes > 0;
}

function equippedGift(userId) {
  const row = db.get(
    `SELECT ug.*, u.equipped_gift_id FROM users u
     LEFT JOIN user_gifts ug ON ug.id = u.equipped_gift_id AND ug.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  if (!row || !row.gift_id) return null;
  const meta = giftMeta(row.gift_id);
  if (!meta) return null;
  return {
    gift_id: meta.id,
    name: meta.name,
    rarity: meta.rarity,
    rarity_label: meta.rarity_label,
    rarity_color: meta.rarity_color,
    svg: meta.svg,
    regifted: !!row.regifted
  };
}

/* ---------- Composite views ---------- */

function catalogFor(userId) {
  const overrides = overrideMap();
  const banners = db.all('SELECT * FROM user_banners WHERE user_id = ?', [userId]);
  const badges = db.all('SELECT * FROM user_badges WHERE user_id = ?', [userId]);
  const bannerGrants = new Map();
  for (const row of banners) {
    const current = bannerGrants.get(row.banner_id);
    if (!current || (row.expires_at === null) || (current.expires_at && row.expires_at > current.expires_at)) {
      bannerGrants.set(row.banner_id, row);
    }
  }
  const badgeGrants = new Map();
  for (const row of badges) {
    const current = badgeGrants.get(row.badge_id);
    if (!current || (row.expires_at === null) || (current.expires_at && row.expires_at > current.expires_at)) {
      badgeGrants.set(row.badge_id, row);
    }
  }
  const inventory = new Map(giftInventory(userId).map((item) => [item.gift_id, item]));
  const user = db.get('SELECT banner_id, equipped_gift_id FROM users WHERE id = ?', [userId]);

  return {
    rarities: RARITIES,
    banners: BANNERS.map((banner) => bannerView(banner, bannerGrants.get(banner.id))).map((banner) => ({
      ...banner,
      equipped: !!(user && user.banner_id === banner.id)
    })),
    badges: BADGES.map((badge) => badgeView(badge, badgeGrants.get(badge.id))).map((badge) => ({
      ...badge,
      active: badge.owned
    })),
    gifts: GIFTS.map((gift) => giftWithOverrides(gift, overrides.get(gift.id)))
      .map((gift) => ({
        id: gift.id,
        name: gift.name,
        rarity: gift.rarity,
        rarity_label: gift.rarity_label,
        rarity_color: gift.rarity_color,
        price: gift.price,
        purchasable: gift.purchasable,
        svg: gift.svg,
        count: inventory.has(gift.id) ? inventory.get(gift.id).count : 0,
        is_hidden: inventory.has(gift.id) ? inventory.get(gift.id).is_hidden : false
      })),
    equipped_gift_id: user && user.equipped_gift_id
      ? (db.get('SELECT gift_id FROM user_gifts WHERE id = ?', [user.equipped_gift_id]) || {}).gift_id || null
      : null,
    banner_id: user ? user.banner_id : null,
    telegram: db.getSetting('owner_telegram', '')
  };
}

function profileCosmetics(userId, { self = false } = {}) {
  const user = db.get('SELECT banner_id, equipped_gift_id FROM users WHERE id = ?', [userId]);
  const banner = user && user.banner_id ? BANNER_MAP.get(user.banner_id) : null;
  const badges = activeBadgeGrants(userId)
    .map((grant) => {
      const badge = BADGE_MAP.get(grant.badge_id);
      if (!badge) return null;
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        rarity: badge.rarity,
        svg: badge.svg,
        expires_at: grant.expires_at
      };
    })
    .filter(Boolean);
  const gifts = giftInventory(userId)
    .filter((item) => self || !item.is_hidden)
    .map((item) => ({
      gift_id: item.gift_id,
      name: item.name,
      rarity: item.rarity,
      rarity_label: item.rarity_label,
      rarity_color: item.rarity_color,
      count: item.count,
      has_regifted: item.has_regifted,
      is_hidden: item.is_hidden
    }));
  return {
    banner: banner ? { ...banner } : null,
    badges,
    gifts,
    equipped_gift: equippedGift(userId),
    follow: followCounts(userId)
  };
}

function setGiftOverride(giftId, { rarity, price }) {
  if (!GIFT_MAP.has(giftId)) return false;
  const nextRarity = RARITIES[rarity] ? rarity : null;
  const nextPrice = Number.isFinite(Number(price)) ? Math.max(0, Math.round(Number(price))) : null;
  db.run(
    `INSERT INTO gift_overrides (gift_id, rarity, price, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(gift_id) DO UPDATE SET rarity = excluded.rarity, price = excluded.price, updated_at = excluded.updated_at`,
    [giftId, nextRarity, nextPrice, nowIsoSafe()]
  );
  return true;
}

module.exports = {
  follow,
  unfollow,
  isFollowing,
  followCounts,
  auraTable,
  grantBanner,
  revokeBanner,
  equipBanner,
  activeBannerGrant,
  grantBadge,
  revokeBadge,
  activeBadgeGrants,
  grantGift,
  transferGift,
  equipGift,
  setGiftHidden,
  giftInventory,
  equippedGift,
  catalogFor,
  profileCosmetics,
  setGiftOverride
};
