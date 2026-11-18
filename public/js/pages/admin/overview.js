import { api } from '../../api.js?v=25';
import { el, avatarNode } from '../../ui.js?v=25';
import { icon } from '../../icons.js?v=25';
import { sectionHead, fmtDate, courseLabel, emptyState, statusChips } from './shared.js?v=25';

function drawChart(canvas, labels, series) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const height = 180;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#4c5fd7';
  const border = css.getPropertyValue('--border').trim() || '#e6e6e1';
  const max = Math.max(1, ...series);
  const padX = 8;
  const padY = 16;
  const stepX = (width - padX * 2) / Math.max(1, series.length - 1);

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = padY + ((height - padY * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(width - padX, y);
    ctx.stroke();
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((value, index) => {
    const x = padX + stepX * index;
    const y = height - padY - ((height - padY * 2) * value) / max;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = accent;
  series.forEach((value, index) => {
    if (index !== 0 && index !== series.length - 1) return;
    const x = padX + stepX * index;
    const y = height - padY - ((height - padY * 2) * value) / max;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = css.getPropertyValue('--text-3').trim() || '#8b8f95';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText(String(max), padX, 12);
  ctx.fillText(labels[0] || '', padX, height - 2);
  const last = labels[labels.length - 1] || '';
  const lastWidth = ctx.measureText(last).width;
  ctx.fillText(last, width - padX - lastWidth, height - 2);
  return { ctx, width, height, accent };
}

function chartCard(title, chart) {
  const card = el('div', { class: 'chart-card' });
  card.append(el('div', { class: 'chart-card__title', text: title }));
  const canvas = el('canvas', { class: 'chart-canvas' });
  card.append(canvas);
  requestAnimationFrame(() => {
    drawChart(canvas, chart.labels, chart.values);
  });
  return card;
}

function kpi(label, value, iconName) {
  const card = el('div', { class: 'kpi' });
  const top = el('div', { class: 'kpi__top' });
  top.append(el('span', { class: 'kpi__label', text: label }));
  const iconWrap = el('span', { class: 'kpi__icon' });
  iconWrap.innerHTML = icon(iconName, { size: 16 });
  top.append(iconWrap);
  card.append(top, el('div', { class: 'kpi__value', text: String(value ?? 0) }));
  return card;
}

export default async function overviewSection({ showUser }) {
  const data = await api.get('/admin/stats');
  const totals = data.totals || {};
  const root = el('div', { class: 'col', style: { gap: '20px' } });
  root.append(sectionHead('Обзор', 'Ключевые показатели сайта за последние 30 дней'));

  const grid = el('div', { class: 'kpi-grid' });
  grid.append(kpi('Пользователи', totals.users, 'users'));
  grid.append(kpi('Новые за 24 часа', totals.new_24h, 'plus'));
  grid.append(kpi('Новые за 7 дней', totals.new_7d, 'activity'));
  grid.append(kpi('Онлайн сейчас', totals.online, 'circle'));
  grid.append(kpi('Матчи', totals.matches, 'heart'));
  grid.append(kpi('Сообщения', totals.messages, 'chat'));
  grid.append(kpi('Посты', totals.posts, 'image'));
  grid.append(kpi('Жалобы в очереди', totals.reports_new, 'flag'));
  root.append(grid);

  const labels = (data.charts?.days || []).map((day) => String(day).slice(5));
  const valuesOf = (list) => (list || []).map((item) => Number(item && item.value !== undefined ? item.value : item) || 0);
  const chartsRow = el('div', { class: 'chart-grid' });
  chartsRow.append(chartCard('Регистрации', { labels, values: valuesOf(data.charts?.registrations) }));
  chartsRow.append(chartCard('Сообщения', { labels, values: valuesOf(data.charts?.messages) }));
  chartsRow.append(chartCard('Свайпы', { labels, values: valuesOf(data.charts?.swipes) }));
  chartsRow.append(chartCard('Посты', { labels, values: valuesOf(data.charts?.posts) }));
  root.append(chartsRow);

  const two = el('div', { class: 'admin-two' });

  const uniCard = el('div', { class: 'admin-panel' });
  uniCard.append(el('h2', { class: 'admin-panel__title', text: 'Университеты' }));
  if (!(data.universities || []).length) uniCard.append(emptyState('Пока нет данных'));
  for (const item of (data.universities || []).slice(0, 8)) {
    const row = el('div', { class: 'admin-bar-row' });
    row.append(el('span', { class: 'admin-bar-row__label', text: item.short_name }));
    const bar = el('div', { class: 'admin-bar' });
    const fill = el('div', { class: 'admin-bar__fill' });
    fill.style.width = `${Math.min(100, (item.users / Math.max(1, data.universities[0].users)) * 100)}%`;
    bar.append(fill);
    row.append(bar, el('span', { class: 'admin-bar-row__value', text: String(item.users) }));
    uniCard.append(row);
  }
  two.append(uniCard);

  const distCard = el('div', { class: 'admin-panel' });
  distCard.append(el('h2', { class: 'admin-panel__title', text: 'Аудитория' }));
  const genders = data.genders || [];
  const ages = data.ages || [];
  const courses = data.courses || [];
  const distRow = el('div', { class: 'admin-dist' });
  const genderBox = el('div');
  genderBox.append(el('div', { class: 'field__label', text: 'Пол' }));
  for (const item of genders) {
    const name = item.gender === 'male' ? 'Мужчины' : item.gender === 'female' ? 'Женщины' : 'Другое';
    genderBox.append(el('div', { class: 'admin-kv', text: `${name}: ${item.total}` }));
  }
  const ageBox = el('div');
  ageBox.append(el('div', { class: 'field__label', text: 'Возраст' }));
  for (const item of ages) ageBox.append(el('div', { class: 'admin-kv', text: `${item.bucket}: ${item.total}` }));
  const courseBox = el('div');
  courseBox.append(el('div', { class: 'field__label', text: 'Курсы' }));
  for (const item of courses.slice(0, 6)) {
    courseBox.append(el('div', { class: 'admin-kv', text: `${courseLabel(item.course)}: ${item.total}` }));
  }
  distRow.append(genderBox, ageBox, courseBox);
  distCard.append(distRow);
  two.append(distCard);
  root.append(two);

  const latestCard = el('div', { class: 'admin-panel' });
  latestCard.append(el('h2', { class: 'admin-panel__title', text: 'Последние регистрации' }));
  const latest = data.latest_users || [];
  if (!latest.length) latestCard.append(emptyState('Регистраций пока нет'));
  for (const user of latest) {
    const row = el('button', { class: 'admin-user-row', attrs: { type: 'button' } });
    row.append(avatarNode({ ...user, avatar_path: user.avatar_path }, 'sm'));
    const text = el('div', { class: 'admin-user-row__text' });
    text.append(el('span', { class: 'admin-user-row__name', text: user.display_name }));
    text.append(
      el('span', {
        class: 'admin-user-row__meta',
        text: `@${user.username} · ${user.university_short_name || 'без университета'} · ${fmtDate(user.created_at)}`
      })
    );
    row.append(text, statusChips({ is_demo: user.is_demo, role: 'user' }));
    row.addEventListener('click', () => showUser(user.id));
    latestCard.append(row);
  }
  root.append(latestCard);

  const reportsCard = el('div', { class: 'admin-panel' });
  reportsCard.append(el('h2', { class: 'admin-panel__title', text: 'Последние жалобы' }));
  const reports = data.latest_reports || [];
  if (!reports.length) reportsCard.append(emptyState('Очередь жалоб пуста'));
  for (const report of reports) {
    const row = el('div', { class: 'admin-kv-row' });
    row.append(el('span', { text: `#${report.id} · ${report.reported_name || report.reported_username}` }));
    row.append(el('span', { class: 'field__hint', text: `${report.reason} · ${fmtDate(report.created_at)}` }));
    reportsCard.append(row);
  }
  root.append(reportsCard);

  return root;
}
