'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');
const { UPLOAD_DIR, deleteUpload } = require('../utils/files');
const { ensureMatch, matchDateLabel } = require('../lib/matches');
const { CITY, DISTRICTS, COURSES } = require('../config');
const { INTERESTS, LANGUAGES } = require('../utils/constants');
const { nowIso, isoPlusHours } = require('../utils/time');

const DEMO_EMAIL_DOMAIN = 'demo.uni-lovers.uz';

const WOMEN = [
  'Дилноза', 'Мадина', 'Севинч', 'Нилуфар', 'Камила', 'Шахноза', 'Гульнара', 'Зарина',
  'Азиза', 'Лола', 'Дарья', 'Анна', 'Мария', 'Умида', 'Феруза'
];
const MEN = [
  'Азиз', 'Бекзод', 'Джасур', 'Рустам', 'Санжар', 'Тимур', 'Фаррух', 'Шохрух',
  'Алишер', 'Дамир', 'Иван', 'Артём', 'Сергей', 'Улугбек', 'Хасан'
];
const LAST_NAMES_WOMEN = ['Каримова', 'Юсупова', 'Ахмедова', 'Рахимова', 'Тошматова', 'Исламова', 'Назарова'];
const LAST_NAMES_MEN = ['Каримов', 'Юсупов', 'Ахмедов', 'Рахимов', 'Тошматов', 'Исламов', 'Назаров'];
const FACULTIES = [
  'Информационные технологии',
  'Экономика',
  'Бизнес-управление',
  'Международные отношения',
  'Право',
  'Дизайн',
  'Медицина',
  'Педагогика',
  'Финансы',
  'Компьютерная инженерия'
];
const JOBS = [
  'Дизайнер', 'Frontend-разработчик', 'Маркетолог', 'Фотограф', 'Преподаватель',
  'Аналитик', 'Предприниматель', 'Менеджер проектов', 'Психолог', 'Инженер'
];
const BIOS = [
  'Учусь и много читаю. Люблю спокойные прогулки и хорошие разговоры.',
  'Пишу код, играю на гитаре, иногда рисую. Открыт(а) к новым знакомствам.',
  'Люблю кофе, кино и поездки по стране. Ищу человека со схожими интересами.',
  'Провожу вечера с книгой или на тренировке. Ценю юмор и спокойствие.',
  'Готовлю и экспериментирую на кухне. Люблю музыку и выставки.',
  'Студент(ка), увлекаюсь фотографией и путешествиями. Давай познакомимся.',
  'Ищу дружбу и что-то большее, если совпадём. Люблю животных и осень.',
  'Спорт, учёба и немного творчества. Всегда рад(а) новым людям.',
  'Тихо, но интересно. Люблю старые фильмы и долгие прогулки.',
  'Увлекаюсь IT и дизайном. Хочу найти людей, с которыми легко молчать и смеяться.'
];
const CAPTIONS = [
  'Утро в городе',
  'Немного учёбы и кофе',
  'Выходной',
  'Любимое место в Ташкенте',
  'Спокойный вечер',
  'Новые фото',
  'Маленькая прогулка',
  'Планы на неделю',
  'Тихое утро',
  'Встреча с друзьями'
];

function pick(list, index) {
  return list[index % list.length];
}

function hashString(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex');
}

// Calm, muted gradients for local demo avatars.
function palette(seed) {
  const palettes = [
    ['#4C5FD7', '#8A98E8'],
    ['#2E9E6B', '#7CC4A4'],
    ['#7C5CD6', '#B3A2EC'],
    ['#5B6C8F', '#9AA9C6'],
    ['#8B7355', '#C3B099'],
    ['#3C7A89', '#86B4BF']
  ];
  const hash = parseInt(hashString(seed).slice(0, 4), 16);
  return palettes[hash % palettes.length];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gradientAvatar(initials, seed) {
  const [from, to] = palette(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <text x="300" y="350" font-family="Inter, Segoe UI, Roboto, sans-serif" font-size="210"
    font-weight="600" fill="rgba(255,255,255,0.95)" text-anchor="middle">${escapeXml(initials)}</text>
</svg>`;
}

function gradientPost(label, seed) {
  const [from, to] = palette(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="900" height="900" fill="url(#g)"/>
  <text x="450" y="470" font-family="Inter, Segoe UI, Roboto, sans-serif" font-size="42"
    font-weight="600" fill="rgba(255,255,255,0.94)" text-anchor="middle">${escapeXml(label)}</text>
  <text x="450" y="525" font-family="Inter, Segoe UI, Roboto, sans-serif" font-size="24"
    fill="rgba(255,255,255,0.7)" text-anchor="middle">Wiutgram</text>
</svg>`;
}

function saveSvg(content, subdir) {
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `demo_${crypto.randomBytes(6).toString('hex')}.svg`;
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  return `/uploads/${subdir}/${filename}`;
}

async function download(url, subdir) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 512 || buffer.length > 3 * 1024 * 1024) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const dir = path.join(UPLOAD_DIR, subdir);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `demo_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `/uploads/${subdir}/${filename}`;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function removeDemo() {
  const demoUsers = db.all('SELECT id, avatar_path FROM users WHERE is_demo = 1');
  const files = [];
  for (const user of demoUsers) {
    db.all('SELECT path FROM photos WHERE user_id = ?', [user.id]).forEach((r) => files.push(r.path));
    db.all('SELECT image_path FROM posts WHERE user_id = ?', [user.id]).forEach((r) => files.push(r.image_path));
    db.all('SELECT media_path FROM stories WHERE user_id = ?', [user.id]).forEach((r) => files.push(r.media_path));
    db.all('SELECT image_path FROM messages WHERE sender_id = ? AND image_path IS NOT NULL', [user.id]).forEach(
      (r) => files.push(r.image_path)
    );
    files.push(user.avatar_path);
  }
  const ids = demoUsers.map((u) => u.id);
  if (ids.length) db.run(`DELETE FROM users WHERE id IN ${db.inClause(ids.length)}`, ids);
  for (const file of new Set(files)) if (file) deleteUpload(file);
  return { removed: ids.length, files: files.length };
}

function buildPerson(index, gender) {
  const names = gender === 'female' ? WOMEN : MEN;
  const first = names[index % names.length];
  const last = gender === 'female'
    ? LAST_NAMES_WOMEN[index % LAST_NAMES_WOMEN.length]
    : LAST_NAMES_MEN[index % LAST_NAMES_MEN.length];
  return { first, last, username: `demo_${gender === 'female' ? 'f' : 'm'}${index + 1}` };
}

async function downloadAvatar(gender, index) {
  const remoteIndex = (index * 3 + 7) % 99;
  const url = `https://randomuser.me/api/portraits/${gender === 'female' ? 'women' : 'men'}/${remoteIndex}.jpg`;
  return (await download(url, 'avatars')) || null;
}

function activeUniversities() {
  return db.all('SELECT * FROM universities WHERE is_active = 1 AND is_system = 0 ORDER BY sort_order ASC');
}

async function seedDemo(options = {}) {
  const count = Math.min(60, Math.max(1, Number(options.count) || 30));
  removeDemo();

  const universities = activeUniversities();
  const maxPhotos = Number(db.getSetting('max_photos', '9')) || 9;
  const courses = COURSES.map((course) => course.value);
  const now = nowIso();
  const created = [];
  const pendingImages = [];

  for (let i = 0; i < count; i += 1) {
    const gender = i % 2 === 0 ? 'female' : 'male';
    const person = buildPerson(Math.floor(i / 2), gender);
    const age = 18 + ((i * 5) % 23);
    const birthYear = new Date().getUTCFullYear() - age;
    const birthdate = `${birthYear}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`;
    const interestSample = [];
    for (let k = 0; k < 4; k += 1) {
      interestSample.push(INTERESTS[(i * 3 + k * 5) % INTERESTS.length].id);
    }
    const uniqueInterests = [...new Set(interestSample)];
    const looking = ['relationship', 'dating', 'friends', 'chat', 'not_sure'][i % 5];
    const initials = `${person.first[0] || ''}${person.last[0] || ''}`;
    const avatarPath = saveSvg(gradientAvatar(initials, person.username), 'avatars');
    const university = universities.length ? universities[i % universities.length] : null;
    const course = university ? pick(courses, i + 1) : null;
    const district = pick(DISTRICTS, i * 3 + 1);
    const faculty = university ? pick(FACULTIES, i + 2) : null;
    const createdAt = new Date(Date.now() - (i + 1) * 3600 * 1000).toISOString();

    // Every demo account gets its own random password; it is never stored in plain text.
    const randomPassword = crypto.randomBytes(24).toString('base64url');
    const passwordHash = bcrypt.hashSync(randomPassword, 8);

    const result = db.run(
      `INSERT INTO users
       (username, email, password_hash, role, display_name, birthdate, gender, interested_in,
        looking_for, city, bio, job, education, height, interests, languages, avatar_path,
        is_verified, is_demo, last_seen, created_at, updated_at, onboarding_done,
        filter_age_min, filter_age_max, super_likes_reset_at,
        university_id, faculty, course, district)
       VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1, 18, 99, ?, ?, ?, ?, ?)`,
      [
        person.username,
        `${person.username}@${DEMO_EMAIL_DOMAIN}`,
        passwordHash,
        `${person.first} ${person.last}`,
        birthdate,
        gender,
        gender === 'female' ? 'male' : 'female',
        looking,
        CITY,
        pick(BIOS, i),
        pick(JOBS, i + 2),
        university ? university.name : '',
        158 + ((i * 4) % 30),
        JSON.stringify(uniqueInterests),
        JSON.stringify([LANGUAGES[i % 3], LANGUAGES[2 + (i % 2)]]),
        avatarPath,
        i % 3 === 0 ? 1 : 0,
        new Date(Date.now() - i * 13 * 60 * 1000).toISOString(),
        createdAt,
        createdAt,
        createdAt,
        university ? university.id : null,
        faculty,
        course,
        district
      ]
    );
    const userId = Number(result.lastInsertRowid);
    db.run('INSERT INTO photos (user_id, path, position, created_at) VALUES (?, ?, 0, ?)', [userId, avatarPath, createdAt]);
    created.push({ id: userId, gender, username: person.username, name: `${person.first} ${person.last}`, index: i });

    pendingImages.push(
      (async () => {
        const remote = await downloadAvatar(gender, i);
        if (remote) {
          db.run('UPDATE photos SET path = ? WHERE user_id = ? AND position = 0', [remote, userId]);
          db.run('UPDATE users SET avatar_path = ? WHERE id = ?', [remote, userId]);
        }
      })()
    );
  }

  await Promise.all(pendingImages);

  for (const person of created) {
    const extraCount = Math.min(maxPhotos - 1, 1 + (person.index % 2));
    for (let p = 1; p <= extraCount; p += 1) {
      const photoPath = saveSvg(gradientPost(person.name, `${person.username}-photo-${p}`), 'avatars');
      db.run('INSERT INTO photos (user_id, path, position, created_at) VALUES (?, ?, ?, ?)', [
        person.id,
        photoPath,
        p,
        now
      ]);
    }
  }

  const postDownloads = [];
  for (const person of created) {
    const i = person.index;
    const postsCount = 2 + (i % 4);
    for (let p = 0; p < postsCount; p += 1) {
      const localPath = saveSvg(gradientPost(pick(CAPTIONS, i + p), `${person.username}-post-${p}`), 'posts');
      const postResult = db.run(
        `INSERT INTO posts (user_id, image_path, caption, location, created_at, views_count)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [person.id, localPath, pick(CAPTIONS, i + p), CITY, new Date(Date.now() - (i * 5 + p) * 3600 * 1000).toISOString()]
      );
      const postId = Number(postResult.lastInsertRowid);
      postDownloads.push(
        (async () => {
          const remote = await download(`https://picsum.photos/seed/uni${i}${p}/900/900`, 'posts');
          if (remote) db.run('UPDATE posts SET image_path = ? WHERE id = ?', [remote, postId]);
        })()
      );

      const likers = created.filter((_, idx) => (idx + i + p) % 4 === 0).slice(0, 6);
      for (const liker of likers) {
        db.run('INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)', [postId, liker.id, now]);
      }
      db.run('UPDATE posts SET views_count = ? WHERE id = ?', [8 + ((i * 13 + p * 7) % 240), postId]);
      db.run('INSERT OR IGNORE INTO post_views (post_id, viewer_id, created_at) VALUES (?, ?, ?)', [
        postId,
        created[(i + 3) % created.length].id,
        now
      ]);
      if ((i + p) % 3 === 0) {
        db.run('INSERT INTO comments (post_id, user_id, body, parent_id, created_at) VALUES (?, ?, ?, NULL, ?)', [
          postId,
          created[(i + 5) % created.length].id,
          ['Красиво', 'Очень атмосферно', 'Где это?', 'Люблю такие места', 'Отличное фото'][(i + p) % 5],
          now
        ]);
      }
    }

    if (i % 3 !== 2) {
      const storyPath = saveSvg(gradientPost(person.name, `${person.username}-story`), 'stories');
      db.run('INSERT INTO stories (user_id, media_path, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [
        person.id,
        storyPath,
        ['Мой день', 'Утро', 'Прогулка', 'Ташкент', 'Настроение'][i % 5],
        new Date(Date.now() - (i + 1) * 45 * 60 * 1000).toISOString(),
        isoPlusHours(24)
      ]);
    }
  }

  const demoPairs = Math.min(18, Math.floor(created.length / 2));
  const chatLines = [
    'Привет! Как проходит день?',
    'Привет, всё хорошо. А у тебя?',
    'Тоже хорошо. Как учёба?',
    'Нормально, готовлюсь к сессии',
    'Может, как-нибудь кофе?',
    'С удовольствием, на выходных?'
  ];
  for (let i = 0; i < demoPairs; i += 1) {
    const a = created[i];
    const b = created[created.length - 1 - i];
    if (!a || !b) continue;
    db.run('INSERT OR IGNORE INTO swipes (from_id, to_id, action, created_at) VALUES (?, ?, ?, ?)', [a.id, b.id, 'like', now]);
    db.run('INSERT OR IGNORE INTO swipes (from_id, to_id, action, created_at) VALUES (?, ?, ?, ?)', [b.id, a.id, 'like', now]);
    const { match } = ensureMatch(a.id, b.id);
    const lines = 2 + (i % 3);
    for (let l = 0; l < lines; l += 1) {
      db.run('INSERT INTO messages (match_id, sender_id, type, body, created_at) VALUES (?, ?, ?, ?, ?)', [
        match.id,
        l % 2 === 0 ? a.id : b.id,
        l === 0 ? 'system' : 'text',
        l === 0 ? `Вы лайкнули друг друга ${matchDateLabel(match.created_at)}` : chatLines[l % chatLines.length],
        new Date(Date.now() - (lines - l) * 700000).toISOString()
      ]);
    }
  }

  const realUser = db.get('SELECT * FROM users WHERE is_demo = 0 ORDER BY id ASC LIMIT 1');
  if (realUser) {
    created.slice(0, Math.min(12, created.length)).forEach((person, index) => {
      const action = index % 5 === 0 ? 'super' : 'like';
      db.run('INSERT OR IGNORE INTO swipes (from_id, to_id, action, created_at) VALUES (?, ?, ?, ?)', [
        person.id,
        realUser.id,
        action,
        new Date(Date.now() - index * 1800 * 1000).toISOString()
      ]);
    });

    created.slice(0, Math.min(4, created.length)).forEach((person, index) => {
      db.run('INSERT OR IGNORE INTO swipes (from_id, to_id, action, created_at) VALUES (?, ?, ?, ?)', [
        realUser.id,
        person.id,
        'like',
        now
      ]);
      db.run('INSERT OR IGNORE INTO swipes (from_id, to_id, action, created_at) VALUES (?, ?, ?, ?)', [
        person.id,
        realUser.id,
        index === 0 ? 'super' : 'like',
        now
      ]);
      const { match } = ensureMatch(realUser.id, person.id);
      const messageCount = db.get('SELECT COUNT(*) AS t FROM messages WHERE match_id = ?', [match.id]).t;
      if (messageCount === 0) {
        db.run('INSERT INTO messages (match_id, sender_id, type, body, created_at) VALUES (?, ?, ?, ?, ?)', [
          match.id,
          person.id,
          'system',
          `Вы лайкнули друг друга ${matchDateLabel(match.created_at)}`,
          match.created_at
        ]);
        db.run('INSERT INTO messages (match_id, sender_id, type, body, created_at) VALUES (?, ?, ?, ?, ?)', [
          match.id,
          person.id,
          'text',
          ['Привет! Рад(а) нашему матчу', 'О, привет! Как дела?', 'Наконец-то взаимно', 'Привет, как проходит вечер?'][index % 4],
          new Date(Date.now() - (index + 1) * 300000).toISOString()
        ]);
      }
    });
  }

  await Promise.all(postDownloads);

  return {
    created: created.length,
    demos: created.length,
    real_user_matched: realUser ? realUser.username : null
  };
}

if (require.main === module) {
  seedDemo({ count: Number(process.argv[2]) || 30 })
    .then((stats) => {
      console.log('Demo data created:', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seedDemo, removeDemo };
