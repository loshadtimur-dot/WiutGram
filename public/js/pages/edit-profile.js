import { api, compressImage, toFormData } from '../api.js?v=19';
import { el, button, toast, confirmDialog, svgIcon, initials } from '../ui.js?v=19';
import { icon } from '../icons.js?v=19';
import { getState, refreshMe, patchUser } from '../state.js?v=19';
import { navigate } from '../router.js?v=19';

const LOOKING_FOR = [
  ['relationship', 'Отношения'],
  ['dating', 'Свидания'],
  ['friends', 'Дружба'],
  ['chat', 'Просто общение'],
  ['not_sure', 'Пока не знаю']
];

const INTEREST_LABELS = {
  travel: ['Путешествия', '✈️'], music: ['Музыка', '🎧'], movies: ['Кино', '🎬'], sport: ['Спорт', '🏋️'],
  games: ['Игры', '🎮'], coffee: ['Кофе', '☕'], books: ['Книги', '📚'], photo: ['Фото', '📷'],
  it: ['IT', '💻'], dance: ['Танцы', '💃'], cooking: ['Кулинария', '🍳'], yoga: ['Йога', '🧘'],
  anime: ['Аниме', '🌸'], dogs: ['Собаки', '🐶'], cats: ['Коты', '🐱'], fashion: ['Мода', '👗'],
  cars: ['Автомобили', '🚗'], art: ['Искусство', '🎨'], business: ['Бизнес', '💼'],
  football: ['Футбол', '⚽'], nature: ['Природа', '🌿'], languages: ['Языки', '🌍']
};

export default async function EditProfilePage() {
  const me = getState().user;
  const root = el('div', { class: 'settings-page' });

  const head = el('div', { class: 'section__head' });
  const headText = el('div');
  headText.append(el('h1', { text: 'Редактирование профиля', style: { fontSize: '24px', letterSpacing: '-0.03em' } }));
  headText.append(el('p', { class: 'section__subtitle', text: 'Чем полнее профиль, тем больше взаимных лайков.' }));
  head.append(headText);
  head.append(
    button('Назад к профилю', { variant: 'btn-ghost', onClick: () => navigate('/profile') })
  );
  root.append(head);

  let profile;
  let reference = { cities: [], interests: [], languages: [] };
  try {
    const [meData, referenceData] = await Promise.all([
      api.get('/users/me'),
      api.get('/settings/reference').catch(() => reference)
    ]);
    profile = meData.user;
    reference = referenceData;
  } catch (err) {
    root.append(el('div', { class: 'empty', text: err.message || 'Не удалось загрузить профиль' }));
    return root;
  }

  const form = { ...profile, interests: [...(profile.interests || [])], languages: [...(profile.languages || [])] };

  /* Photos */
  const photosCard = el('section', { class: 'settings-section' });
  const photosHead = el('div', { class: 'settings-section__head' });
  photosHead.innerHTML = icon('camera', { size: 18 });
  photosHead.append(el('h2', { text: 'Фото профиля' }));
  photosCard.append(photosHead);
  const photosBody = el('div', { class: 'settings-section__body' });
  photosCard.append(photosBody);

  function renderPhotos() {
    photosBody.innerHTML = '';
    photosBody.append(
      el('p', {
        class: 'field__hint',
        text: 'До 9 фото. Первое — главное, оно показывается в свайпах. Используйте стрелки, чтобы изменить порядок.'
      })
    );
    const grid = el('div', { class: 'photo-grid' });
    photosBody.append(grid);

    (form.photos || []).forEach((photo, index) => {
      const tile = el('div', { class: 'photo-tile' });
      tile.append(el('img', { attrs: { src: photo.path, alt: `Фото ${index + 1}` } }));
      if (index === 0) tile.append(el('span', { class: 'photo-tile__main', text: 'Главное' }));

      const remove = el('button', {
        class: 'photo-tile__remove',
        attrs: { type: 'button', 'aria-label': 'Удалить фото' }
      });
      remove.innerHTML = icon('x', { size: 14 });
      remove.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Удалить фото?',
          message: 'Фото исчезнет из профиля.',
          confirmText: 'Удалить',
          danger: true
        });
        if (!ok) return;
        try {
          const data = await api.delete(`/users/me/photos/${photo.id}`);
          form.photos = data.user.photos;
          form.avatar_path = data.user.avatar_path;
          patchUser({ photos: data.user.photos, avatar_path: data.user.avatar_path });
          renderPhotos();
        } catch (err) {
          toast(err.message || 'Не удалось удалить фото', 'error');
        }
      });
      tile.append(remove);

      if (index > 0) {
        const left = el('button', {
          class: 'photo-tile__remove',
          attrs: { type: 'button', 'aria-label': 'Влево' },
          style: { top: 'auto', bottom: '6px', right: '34px' }
        });
        left.innerHTML = icon('chevronLeft', { size: 13 });
        left.addEventListener('click', () => movePhoto(index, -1));
        tile.append(left);
      }
      if (index < form.photos.length - 1) {
        const right = el('button', {
          class: 'photo-tile__remove',
          attrs: { type: 'button', 'aria-label': 'Вправо' },
          style: { top: 'auto', bottom: '6px', right: '6px' }
        });
        right.innerHTML = icon('chevronRight', { size: 13 });
        right.addEventListener('click', () => movePhoto(index, 1));
        tile.append(right);
      }
      grid.append(tile);
    });

    if ((form.photos || []).length < 9) {
      const add = el('div', { class: 'photo-tile' });
      add.style.display = 'grid';
      add.style.placeItems = 'center';
      add.style.cursor = 'pointer';
      add.style.border = '2px dashed var(--border-strong)';
      add.innerHTML = icon('plus', { size: 24 });
      const input = el('input', {
        attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp' },
        style: { display: 'none' }
      });
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        try {
          const compressed = await compressImage(file);
          const data = await api.upload('/users/me/photos', toFormData({}, compressed.blob, 'photo.jpg'));
          form.photos = data.user.photos;
          form.avatar_path = data.user.avatar_path;
          patchUser({ photos: data.user.photos, avatar_path: data.user.avatar_path });
          renderPhotos();
          toast('Фото добавлено', 'success');
        } catch (err) {
          toast(err.message || 'Не удалось загрузить фото', 'error');
        }
      });
      add.addEventListener('click', () => input.click());
      add.append(input);
      grid.append(add);
    }
  }

  async function movePhoto(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= form.photos.length) return;
    const order = form.photos.map((photo) => photo.id);
    const [id] = order.splice(index, 1);
    order.splice(target, 0, id);
    try {
      const data = await api.put('/users/me/photos/order', { order });
      form.photos = data.user.photos;
      form.avatar_path = data.user.avatar_path;
      patchUser({ photos: data.user.photos, avatar_path: data.user.avatar_path });
      renderPhotos();
    } catch (err) {
      toast(err.message || 'Не удалось изменить порядок', 'error');
    }
  }
  renderPhotos();
  root.append(photosCard);

  /* Main info */
  const infoCard = el('section', { class: 'settings-section' });
  const infoHead = el('div', { class: 'settings-section__head' });
  infoHead.innerHTML = icon('user', { size: 18 });
  infoHead.append(el('h2', { text: 'Основная информация' }));
  infoCard.append(infoHead);
  const infoBody = el('div', { class: 'settings-section__body' });
  infoBody.style.gap = '14px';
  infoCard.append(infoBody);

  const field = (label) => {
    const wrap = el('label', { class: 'field' });
    wrap.append(el('span', { class: 'field__label', text: label }));
    return wrap;
  };

  const nameField = field('Имя');
  const nameInput = el('input', { class: 'input', attrs: { maxlength: '40' } });
  nameInput.value = form.display_name || '';
  nameInput.addEventListener('input', () => {
    form.display_name = nameInput.value;
  });
  nameField.append(nameInput);
  infoBody.append(nameField);

  const bioField = field('О себе');
  const bioInput = el('textarea', { class: 'textarea', attrs: { maxlength: '500', rows: '4' } });
  bioInput.value = form.bio || '';
  const bioCounter = el('span', { class: 'field__hint', text: `${bioInput.value.length}/500` });
  bioInput.addEventListener('input', () => {
    form.bio = bioInput.value;
    bioCounter.textContent = `${bioInput.value.length}/500`;
  });
  bioField.append(bioInput, bioCounter);
  infoBody.append(bioField);

  const row1 = el('div', { class: 'field-row' });
  const jobField = field('Работа');
  const jobInput = el('input', { class: 'input', attrs: { maxlength: '80', placeholder: 'Дизайнер' } });
  jobInput.value = form.job || '';
  jobInput.addEventListener('input', () => {
    form.job = jobInput.value;
  });
  jobField.append(jobInput);
  const educationField = field('Учёба');
  const educationInput = el('input', { class: 'input', attrs: { maxlength: '80', placeholder: 'НУУз' } });
  educationInput.value = form.education || '';
  educationInput.addEventListener('input', () => {
    form.education = educationInput.value;
  });
  educationField.append(educationInput);
  row1.append(jobField, educationField);
  infoBody.append(row1);

  const row2 = el('div', { class: 'field-row' });
  const heightField = field('Рост, см');
  const heightInput = el('input', { class: 'input', attrs: { type: 'number', min: '100', max: '250' } });
  heightInput.value = form.height || '';
  heightInput.addEventListener('input', () => {
    form.height = heightInput.value;
  });
  heightField.append(heightInput);
  const districtField = field('Район Ташкента');
  const districtSelect = el('select', { class: 'select' });
  districtSelect.append(el('option', { text: 'Не указан', attrs: { value: '' } }));
  (reference.districts || []).forEach((name) => {
    districtSelect.append(el('option', { text: name, attrs: { value: name } }));
  });
  districtSelect.value = form.district || '';
  districtSelect.addEventListener('change', () => {
    form.district = districtSelect.value;
  });
  districtField.append(districtSelect);
  row2.append(heightField, districtField);
  infoBody.append(row2);

  const studyRow = el('div', { class: 'field-row field-row--three' });
  const universityField = field('Университет');
  const universitySelect = el('select', { class: 'select' });
  universitySelect.append(el('option', { text: 'Не указан', attrs: { value: '' } }));
  (reference.universities || []).forEach((university) => {
    if (!university.is_active && university.id !== form.university_id) return;
    universitySelect.append(
      el('option', { text: `${university.short_name} — ${university.name}`, attrs: { value: String(university.id) } })
    );
  });
  universitySelect.value = form.university_id ? String(form.university_id) : '';
  universitySelect.addEventListener('change', () => {
    form.university_id = universitySelect.value ? Number(universitySelect.value) : null;
  });
  universityField.append(universitySelect);

  const facultyField = field('Факультет');
  const facultyInput = el('input', { class: 'input', attrs: { maxlength: '80', placeholder: 'Необязательно' } });
  facultyInput.value = form.faculty || '';
  facultyInput.addEventListener('input', () => {
    form.faculty = facultyInput.value;
  });
  facultyField.append(facultyInput);

  const courseField = field('Курс');
  const courseSelect = el('select', { class: 'select' });
  courseSelect.append(el('option', { text: 'Не указан', attrs: { value: '' } }));
  [
    ['1', '1 курс'], ['2', '2 курс'], ['3', '3 курс'], ['4', '4 курс'], ['5', '5 курс'], ['6', '6 курс'],
    ['master', 'Магистратура'], ['graduate', 'Выпускник'], ['phd', 'Аспирант']
  ].forEach(([value, label]) => courseSelect.append(el('option', { text: label, attrs: { value } })));
  courseSelect.value = form.course || '';
  courseSelect.addEventListener('change', () => {
    form.course = courseSelect.value;
  });
  courseField.append(courseSelect);
  studyRow.append(universityField, facultyField, courseField);
  infoBody.append(studyRow);

  const row3 = el('div', { class: 'field-row' });
  const lookingField = field('Что ищете');
  const lookingSelect = el('select', { class: 'select' });
  LOOKING_FOR.forEach(([value, label]) => lookingSelect.append(el('option', { text: label, attrs: { value } })));
  lookingSelect.value = form.looking_for || 'not_sure';
  lookingSelect.addEventListener('change', () => {
    form.looking_for = lookingSelect.value;
  });
  lookingField.append(lookingSelect);
  const instaField = field('Instagram');
  const instaInput = el('input', { class: 'input', attrs: { placeholder: '@username', maxlength: '200' } });
  instaInput.value = form.instagram_link || '';
  instaInput.addEventListener('input', () => {
    form.instagram_link = instaInput.value;
  });
  instaField.append(instaInput);
  row3.append(lookingField, instaField);
  infoBody.append(row3);
  root.append(infoCard);

  /* Interests */
  const interestCard = el('section', { class: 'settings-section' });
  const interestHead = el('div', { class: 'settings-section__head' });
  interestHead.innerHTML = icon('sparkles', { size: 18 });
  interestHead.append(el('h2', { text: 'Интересы' }));
  interestCard.append(interestHead);
  const interestBody = el('div', { class: 'settings-section__body' });
  interestBody.style.gap = '12px';
  interestCard.append(interestBody);
  const interestCounter = el('div', { class: 'field__hint' });
  const interestChips = el('div', { class: 'chips' });
  const refreshInterests = () => {
    interestCounter.textContent = `Выбрано ${form.interests.length} из 10`;
    interestChips.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('is-active', form.interests.includes(chip.dataset.value));
    });
  };
  for (const interest of reference.interests || []) {
    const chip = el('button', { class: 'chip', attrs: { type: 'button', 'data-value': interest.id } });
    chip.append(el('span', { text: interest.emoji }));
    chip.append(el('span', { text: interest.label }));
    chip.addEventListener('click', () => {
      const index = form.interests.indexOf(interest.id);
      if (index >= 0) form.interests.splice(index, 1);
      else if (form.interests.length >= 10) {
        toast('Максимум 10 интересов', 'error');
        return;
      } else form.interests.push(interest.id);
      refreshInterests();
    });
    interestChips.append(chip);
  }
  interestBody.append(interestCounter, interestChips);
  refreshInterests();
  root.append(interestCard);

  /* Languages */
  const languagesCard = el('section', { class: 'settings-section' });
  const languagesHead = el('div', { class: 'settings-section__head' });
  languagesHead.innerHTML = icon('globe', { size: 18 });
  languagesHead.append(el('h2', { text: 'Языки' }));
  languagesCard.append(languagesHead);
  const languagesBody = el('div', { class: 'settings-section__body' });
  languagesBody.style.gap = '12px';
  languagesCard.append(languagesBody);
  const languageChips = el('div', { class: 'chips' });
  const refreshLanguages = () => {
    languageChips.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('is-active', form.languages.includes(chip.dataset.value));
    });
  };
  for (const lang of reference.languages || []) {
    const chip = el('button', { class: 'chip', attrs: { type: 'button', 'data-value': lang } });
    chip.append(el('span', { text: lang }));
    chip.addEventListener('click', () => {
      const index = form.languages.indexOf(lang);
      if (index >= 0) form.languages.splice(index, 1);
      else if (form.languages.length >= 6) {
        toast('Максимум 6 языков', 'error');
        return;
      } else form.languages.push(lang);
      refreshLanguages();
    });
    languageChips.append(chip);
  }
  languagesBody.append(languageChips);
  refreshLanguages();
  root.append(languagesCard);

  /* Save */
  const saveRow = el('div', { class: 'row', style: { position: 'sticky', bottom: '12px', justifyContent: 'flex-end' } });
  const saveBtn = button('Сохранить изменения', {
    variant: 'btn-primary',
    class: 'btn-lg',
    onClick: async () => {
      if ((form.interests || []).length < 3) {
        toast('Выберите минимум 3 интереса', 'error');
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохраняем…';
      try {
        const payload = {
          display_name: form.display_name,
          bio: form.bio,
          job: form.job,
          education: form.education,
          height: form.height,
          university_id: form.university_id || null,
          faculty: form.faculty || null,
          course: form.course || null,
          district: form.district || null,
          interests: form.interests,
          languages: form.languages,
          looking_for: form.looking_for,
          instagram_link: form.instagram_link
        };
        await api.put('/users/me', payload);
        await refreshMe();
        toast('Профиль сохранён', 'success');
        navigate('/profile');
      } catch (err) {
        toast(err.message || 'Не удалось сохранить профиль', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить изменения';
      }
    }
  });
  saveRow.append(
    button('Отмена', { variant: 'btn-secondary', onClick: () => navigate('/profile') }),
    saveBtn
  );
  root.append(saveRow);

  return root;
}
