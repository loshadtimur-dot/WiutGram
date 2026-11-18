import { el } from '../ui.js?v=23';

function setupCanvas(wrap) {
  const canvas = el('canvas');
  wrap.append(canvas);
  const draw = (render) => {
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(120, rect.width || wrap.clientWidth || 320);
    const height = Math.max(80, rect.height || 150);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, width, height);
  };
  return { canvas, draw };
}

// Smooth gradient line chart rendered on canvas (no libraries).
export function lineChartNode(series, options = {}) {
  const wrap = el('div', { class: 'chart' });
  const { draw } = setupCanvas(wrap);
  const values = series.map((point) => Number(point.value) || 0);
  const labels = series.map((point) => point.day);

  const render = () => {
    draw((ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const padding = { top: 14, right: 8, bottom: 22, left: 8 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const max = Math.max(1, ...values);
      const stepX = values.length > 1 ? chartWidth / (values.length - 1) : 0;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(16,24,40,0.07)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i += 1) {
        const y = padding.top + (chartHeight / 3) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      const points = values.map((value, index) => ({
        x: padding.left + stepX * index,
        y: padding.top + chartHeight - (value / max) * chartHeight
      }));

      const gradient = ctx.createLinearGradient(0, padding.top, 0, height);
      gradient.addColorStop(0, options.fillTop || 'rgba(253,38,122,0.28)');
      gradient.addColorStop(1, 'rgba(253,38,122,0)');

      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartHeight);
      for (const point of points) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = options.color || '#FD267A';
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.stroke();

      const last = points[points.length - 1];
      if (last) {
        ctx.beginPath();
        ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = options.color || '#FD267A';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(253,38,122,0.18)';
        ctx.fill();
      }

      const labelCount = Math.min(4, labels.length);
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(16,24,40,0.4)';
      ctx.font = '10px Inter, Segoe UI, sans-serif';
      ctx.textBaseline = 'bottom';
      for (let i = 0; i < labelCount; i += 1) {
        const index = Math.round(((labels.length - 1) / Math.max(1, labelCount - 1)) * i);
        const x = padding.left + stepX * index;
        const day = labels[index] || '';
        const text = day.slice(8, 10) + '.' + day.slice(5, 7);
        ctx.textAlign = index === 0 ? 'left' : index === labels.length - 1 ? 'right' : 'center';
        ctx.fillText(text, x, height - 2);
      }
    });
  };

  requestAnimationFrame(render);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(render);
    observer.observe(wrap);
  } else {
    window.addEventListener('resize', render);
  }
  return wrap;
}

export function barChartNode(series, options = {}) {
  const wrap = el('div', { class: 'bar-chart' });
  const max = Math.max(1, ...series.map((point) => Number(point.value) || 0));
  for (const point of series) {
    const col = el('div', { class: 'bar-chart__col' });
    const value = Number(point.value) || 0;
    const bar = el('div', { class: 'bar-chart__bar', attrs: { title: `${point.day}: ${value}` } });
    bar.style.height = `${Math.max(3, (value / max) * 100)}%`;
    if (options.color) bar.style.background = options.color;
    col.append(bar);
    const day = point.day || '';
    col.append(el('div', { class: 'bar-chart__label', text: day.slice(8, 10) }));
    wrap.append(col);
  }
  return wrap;
}

export function legendDot(color, label) {
  const item = el('span', { class: 'tag' });
  const dot = el('span');
  dot.style.width = '8px';
  dot.style.height = '8px';
  dot.style.borderRadius = '50%';
  dot.style.background = color;
  dot.style.display = 'inline-block';
  item.append(dot, el('span', { text: label }));
  return item;
}
