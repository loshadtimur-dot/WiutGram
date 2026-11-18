import { api } from '../../../api.js?v=18';
import { el, button, toast, openModal } from '../../../ui.js?v=18';

// 4:1 banner cropper. The preview canvas is 800×200 and the export is 1600×400.
const VIEW_W = 800;
const VIEW_H = 200;
const OUT_W = 1600;
const OUT_H = 400;
const MAX_UPLOAD_BYTES = 400 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось открыть изображение'));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function openCropModal(file, { onUploaded } = {}) {
  let image;
  try {
    image = await loadImage(file);
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
  if (!file.type.startsWith('image/')) {
    toast('Допустимы только изображения JPG, PNG или WEBP', 'error');
    return null;
  }

  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let startOffsetY = 0;
  let uploading = false;

  const body = el('div', { class: 'crop' });
  const lowQuality = image.width < 1200 || image.height < 300;
  if (lowQuality) {
    body.append(
      el('p', {
        class: 'crop__warn',
        text: `Низкое качество: исходник ${image.width}×${image.height}. Рекомендуем от 1200×300 px, иначе баннер будет размытым.`
      })
    );
  }

  const area = el('div', { class: 'crop__area' });
  const canvas = el('canvas', { class: 'crop__canvas', attrs: { width: String(VIEW_W), height: String(VIEW_H) } });
  area.append(canvas, el('div', { class: 'crop__frame' }));
  body.append(area);

  const controls = el('div', { class: 'crop__controls' });
  const zoomLabel = el('span', { class: 'crop__hint', text: 'Масштаб' });
  const zoomInput = el('input', {
    class: 'input',
    attrs: { type: 'range', min: '1', max: '3', step: '0.01', value: '1', 'aria-label': 'Масштаб' }
  });
  zoomInput.style.flex = '1';
  controls.append(zoomLabel, zoomInput);
  body.append(controls);
  body.append(el('p', { class: 'crop__hint', text: 'Перетащите изображение мышью или пальцем, масштаб — ползунком или колесом.' }));

  const preview = el('div', { class: 'crop__preview hidden' });
  const previewImg = el('img', { attrs: { alt: 'Предпросмотр баннера' } });
  preview.append(previewImg);
  body.append(preview);

  function baseScale() {
    return Math.max(VIEW_W / image.width, VIEW_H / image.height);
  }

  function clampOffsets() {
    const scale = baseScale() * zoom;
    const maxX = Math.max(0, (image.width * scale - VIEW_W) / 2);
    const maxY = Math.max(0, (image.height * scale - VIEW_H) / 2);
    offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
    offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
  }

  function draw() {
    clampOffsets();
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = '#101114';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const scale = baseScale() * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, VIEW_W / 2 + offsetX - width / 2, VIEW_H / 2 + offsetY - height / 2, width, height);
    ctx.restore();
  }

  function updatePreview() {
    const scale = baseScale() * zoom * (OUT_W / VIEW_W);
    const out = document.createElement('canvas');
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext('2d');
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      OUT_W / 2 + offsetX * (OUT_W / VIEW_W) - width / 2,
      OUT_H / 2 + offsetY * (OUT_H / VIEW_H) - height / 2,
      width,
      height
    );
    previewImg.src = out.toDataURL('image/jpeg', 0.82);
    preview.classList.remove('hidden');
  }

  zoomInput.addEventListener('input', () => {
    zoom = Number(zoomInput.value);
    draw();
    updatePreview();
  });

  area.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
    area.setPointerCapture(event.pointerId);
  });
  area.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = area.getBoundingClientRect();
    const ratio = VIEW_W / rect.width;
    offsetX = startOffsetX + (event.clientX - startX) * ratio;
    offsetY = startOffsetY + (event.clientY - startY) * ratio;
    draw();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    updatePreview();
  };
  area.addEventListener('pointerup', endDrag);
  area.addEventListener('pointercancel', endDrag);
  area.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom = Math.min(3, Math.max(1, zoom + (event.deltaY > 0 ? -0.06 : 0.06)));
    zoomInput.value = String(zoom);
    draw();
    updatePreview();
  }, { passive: false });

  draw();
  updatePreview();

  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Обрезка баннера 4:1', body, footer, size: 'wide' });
  footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));

  const save = button('Загрузить баннер', {
    variant: 'btn-primary',
    onClick: async () => {
      if (uploading) return;
      uploading = true;
      save.disabled = true;
      try {
        const scale = baseScale() * zoom * (OUT_W / VIEW_W);
        const out = document.createElement('canvas');
        out.width = OUT_W;
        out.height = OUT_H;
        const ctx = out.getContext('2d');
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          image,
          OUT_W / 2 + offsetX * (OUT_W / VIEW_W) - width / 2,
          OUT_H / 2 + offsetY * (OUT_H / VIEW_H) - height / 2,
          width,
          height
        );

        let blob = null;
        for (const quality of [0.9, 0.85, 0.8, 0.72, 0.62, 0.5]) {
          const candidate = await canvasToBlob(out, 'image/webp', quality);
          if (!candidate) continue;
          blob = candidate;
          if (candidate.size <= MAX_UPLOAD_BYTES) break;
        }
        if (!blob) blob = await canvasToBlob(out, 'image/jpeg', 0.85);
        if (!blob) throw new Error('Не удалось подготовить изображение');

        const form = new FormData();
        form.append('image', blob, 'banner.webp');
        const data = await api.upload('/admin/ads/banners', form);
        toast('Баннер загружен', 'success');
        modal.close();
        if (onUploaded) onUploaded(data.banner);
      } catch (err) {
        toast(err.message || 'Не удалось загрузить баннер', 'error');
        uploading = false;
        save.disabled = false;
      }
    }
  });
  footer.append(save);
  return modal;
}
