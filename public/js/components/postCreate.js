import { api, compressImage, toFormData } from '../api.js?v=19';
import { el, button, openModal, toast } from '../ui.js?v=19';
import { icon } from '../icons.js?v=19';

// Creates a post (photo + caption + location) or a 24h story.
export function openPostCreate(onCreated) {
  const body = el('div', { class: 'col', style: { gap: '14px' } });
  let compressed = null;

  const dropzone = el('div', { class: 'photo-drop' });
  const dropIcon = el('div', { class: 'photo-drop__icon' });
  dropIcon.innerHTML = icon('image', { size: 22 });
  dropzone.append(dropIcon);
  dropzone.append(el('div', { text: 'Загрузите фото поста', style: { fontWeight: '700' } }));
  dropzone.append(el('div', { class: 'field__hint', text: 'JPG, PNG или WEBP · перетащите или нажмите' }));

  const fileInput = el('input', {
    attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' },
    style: { display: 'none' }
  });
  const preview = el('div', { class: 'post-create__preview hidden' });
  body.append(dropzone, fileInput, preview);

  async function handleFile(file) {
    if (!file) return;
    try {
      compressed = await compressImage(file, 1440, 0.88);
      preview.innerHTML = '';
      preview.append(el('img', { attrs: { src: compressed.dataUrl, alt: 'Предпросмотр поста' } }));
      preview.classList.remove('hidden');
      dropzone.classList.add('hidden');
    } catch (err) {
      toast(err.message || 'Не удалось обработать фото', 'error');
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    handleFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  const captionField = el('label', { class: 'field' });
  captionField.append(el('span', { class: 'field__label', text: 'Подпись' }));
  const caption = el('textarea', {
    class: 'textarea',
    attrs: { placeholder: 'Что происходит на фото?', maxlength: '2200', rows: '3' }
  });
  const counter = el('span', { class: 'field__hint', text: '0/2200' });
  caption.addEventListener('input', () => {
    counter.textContent = `${caption.value.length}/2200`;
  });
  captionField.append(caption, counter);
  body.append(captionField);

  const locationField = el('label', { class: 'field' });
  locationField.append(el('span', { class: 'field__label', text: 'Местоположение' }));
  const location = el('input', {
    class: 'input',
    attrs: { type: 'text', placeholder: 'Ташкент, парк', maxlength: '100' }
  });
  locationField.append(location);
  body.append(locationField);

  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Новый пост', body, footer });
  const publish = button('Опубликовать', {
    variant: 'btn-primary',
    onClick: async () => {
      if (!compressed) {
        toast('Добавьте фото', 'error');
        return;
      }
      publish.disabled = true;
      publish.textContent = 'Публикуем…';
      try {
        const form = toFormData(
          { caption: caption.value.trim(), location: location.value.trim() },
          compressed.blob,
          'post.jpg'
        );
        const data = await api.upload('/posts', form);
        toast('Пост опубликован', 'success');
        modal.close();
        if (onCreated) onCreated(data.post);
      } catch (err) {
        toast(err.message || 'Не удалось опубликовать пост', 'error');
        publish.disabled = false;
        publish.textContent = 'Опубликовать';
      }
    }
  });
  footer.append(button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }), publish);
  return modal;
}

// Story upload dialog, expires automatically in 24 hours.
export function openStoryCreate(onCreated) {
  const body = el('div', { class: 'col', style: { gap: '14px' } });
  let compressed = null;
  const dropzone = el('div', { class: 'photo-drop' });
  const dropIcon = el('div', { class: 'photo-drop__icon' });
  dropIcon.innerHTML = icon('camera', { size: 22 });
  dropzone.append(dropIcon);
  dropzone.append(el('div', { text: 'Добавьте историю', style: { fontWeight: '700' } }));
  dropzone.append(el('div', { class: 'field__hint', text: 'История исчезнет через 24 часа' }));
  const fileInput = el('input', {
    attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' },
    style: { display: 'none' }
  });
  const preview = el('div', { class: 'post-create__preview hidden' });
  body.append(dropzone, fileInput, preview);

  async function handleFile(file) {
    if (!file) return;
    try {
      compressed = await compressImage(file, 1080, 0.86);
      preview.innerHTML = '';
      preview.append(el('img', { attrs: { src: compressed.dataUrl, alt: 'Предпросмотр истории' } }));
      preview.classList.remove('hidden');
      dropzone.classList.add('hidden');
    } catch (err) {
      toast(err.message || 'Не удалось обработать фото', 'error');
    }
  }
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });

  const captionField = el('label', { class: 'field' });
  captionField.append(el('span', { class: 'field__label', text: 'Подпись' }));
  const caption = el('input', {
    class: 'input',
    attrs: { type: 'text', placeholder: 'Добавьте подпись…', maxlength: '200' }
  });
  captionField.append(caption);
  body.append(captionField);

  const footer = el('div', { class: 'row' });
  const modal = openModal({ title: 'Новая история', body, footer });
  const publish = button('Опубликовать', {
    variant: 'btn-primary',
    onClick: async () => {
      if (!compressed) {
        toast('Добавьте фото', 'error');
        return;
      }
      publish.disabled = true;
      try {
        const form = toFormData({ caption: caption.value.trim() }, compressed.blob, 'story.jpg');
        const data = await api.upload('/stories', form);
        toast('История опубликована на 24 часа', 'success');
        modal.close();
        if (onCreated) onCreated(data.story);
      } catch (err) {
        toast(err.message || 'Не удалось опубликовать историю', 'error');
        publish.disabled = false;
      }
    }
  });
  footer.append(button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }), publish);
  return modal;
}
