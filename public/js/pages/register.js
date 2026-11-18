import { api, compressImage, setToken } from '../api.js?v=18';
import { el, button, passwordField, toast, svgIcon, openModal } from '../ui.js?v=18';
import { setUser, getState } from '../state.js?v=18';
import { navigate } from '../router.js?v=18';
import { icon } from '../icons.js?v=18';

const FALLBACK_DISTRICTS = [
  'Алмазарский', 'Бектемирский', 'Мирабадский', 'Мирзо-Улугбекский', 'Сергелийский', 'Учтепинский',
  'Чилансарский', 'Шайхантахурский', 'Юнусабадский', 'Яккасарайский', 'Яшнабадский', 'Янгихаётский'
];

const COURSE_OPTIONS = [
  ['1', '1 курс'],
  ['2', '2 курс'],
  ['3', '3 курс'],
  ['4', '4 курс'],
  ['5', '5 курс'],
  ['6', '6 курс'],
  ['master', 'Магистратура'],
  ['graduate', 'Выпускник'],
  ['phd', 'Аспирант']
];

const FALLBACK_INTERESTS = [
  { id: 'travel', label: 'Путешествия', emoji: '✈️' },
  { id: 'music', label: 'Музыка', emoji: '🎧' },
  { id: 'movies', label: 'Кино', emoji: '🎬' },
  { id: 'sport', label: 'Спорт', emoji: '🏋️' },
  { id: 'games', label: 'Игры', emoji: '🎮' },
  { id: 'coffee', label: 'Кофе', emoji: '☕' },
  { id: 'books', label: 'Книги', emoji: '📚' },
  { id: 'photo', label: 'Фото', emoji: '📷' },
  { id: 'it', label: 'IT', emoji: '💻' },
  { id: 'dance', label: 'Танцы', emoji: '💃' },
  { id: 'cooking', label: 'Кулинария', emoji: '🍳' },
  { id: 'yoga', label: 'Йога', emoji: '🧘' },
  { id: 'anime', label: 'Аниме', emoji: '🌸' },
  { id: 'dogs', label: 'Собаки', emoji: '🐶' },
  { id: 'cats', label: 'Коты', emoji: '🐱' },
  { id: 'fashion', label: 'Мода', emoji: '👗' },
  { id: 'cars', label: 'Автомобили', emoji: '🚗' },
  { id: 'art', label: 'Искусство', emoji: '🎨' },
  { id: 'business', label: 'Бизнес', emoji: '💼' }
];

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

function passwordScore(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Za-zа-яА-Я]/.test(value) && /\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9а-яА-Я]/.test(value)) score += 1;
  return Math.min(4, score);
}

export default async function RegisterPage(ctx) {
  const data = {
    email: '',
    password: '',
    username: '',
    display_name: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    agreed: false,
    gender: '',
    interested_in: 'everyone',
    looking_for: '',
    university_id: null,
    faculty: '',
    course: '',
    district: '',
    interests: [],
    photos: [],
    bio: ''
  };

  let districts = FALLBACK_DISTRICTS;
  let universities = [];
  let interests = FALLBACK_INTERESTS;
  let firstUser = false;
  let stepIndex = 0;
  let busy = false;

  try {
    const [reference, firstInfo, universityList] = await Promise.all([
      api.get('/settings/reference'),
      api.get('/auth/first-user'),
      api.get('/universities')
    ]);
    if (reference.districts && reference.districts.length) districts = reference.districts;
    if (reference.interests && reference.interests.length) interests = reference.interests;
    universities = universityList.universities || [];
    firstUser = !!firstInfo.first;
  } catch (err) {
    districts = FALLBACK_DISTRICTS;
    interests = FALLBACK_INTERESTS;
  }

  const root = el('div', { class: 'auth' });
  const intro = el('div', { class: 'auth__intro' });
  const introTitle = el('h1');
  introTitle.innerHTML = 'Создайте профиль<br /><span>для знакомств в Ташкенте</span>';
  intro.append(introTitle);
  intro.append(
    el('p', {
      text: '8 коротких шагов: контакты, учёба, интересы и фото. Всё занимает пару минут.'
    })
  );
  const introPoints = el('div', { class: 'auth__points' });
  for (const [iconName, text] of [
    ['shield', 'Только 18+ и настоящие люди'],
    ['camera', 'До 9 фото, первое — главное'],
    ['graduation', 'Студенты из разных университетов']
  ]) {
    const point = el('div', { class: 'auth__point' });
    const iconWrap = el('div', { class: 'auth__point-icon' });
    iconWrap.innerHTML = icon(iconName, { size: 17 });
    point.append(iconWrap, el('span', { text }));
    introPoints.append(point);
  }
  intro.append(introPoints);
  root.append(intro);

  const panel = el('div', { class: 'auth__panel' });
  const wizard = el('div', { class: 'wizard' });
  wizard.style.padding = '0';

  const top = el('div', { class: 'wizard__top' });
  const backIcon = el('button', {
    class: 'btn-icon',
    attrs: { type: 'button', 'aria-label': 'Назад' }
  });
  backIcon.innerHTML = icon('arrowLeft', { size: 19 });
  top.append(backIcon);
  const progress = el('div', { class: 'wizard__progress' });
  const stepLabel = el('div', { class: 'wizard__step' });
  top.append(progress, stepLabel);
  wizard.append(top);

  const body = el('div', { class: 'wizard__body' });
  wizard.append(body);
  const errorBox = el('div', { class: 'field__error hidden', attrs: { role: 'alert' } });
  wizard.append(errorBox);
  const actions = el('div', { class: 'wizard__actions' });
  wizard.append(actions);
  panel.append(wizard);

  const footer = el('div', { class: 'auth__footer' });
  footer.append(el('span', { text: 'Уже есть аккаунт? ' }));
  footer.append(el('a', { text: 'Войти', attrs: { href: '/login' } }));
  panel.append(footer);
  root.append(panel);

  const stepTitle = (title, sub) => {
    const frag = document.createDocumentFragment();
    frag.append(el('h2', { class: 'wizard__title', text: title }));
    if (sub) frag.append(el('p', { class: 'wizard__sub', text: sub }));
    return frag;
  };

  const optionCard = (label, emoji, value, group, current) => {
    const card = el('button', {
      class: `option-card ${current === value ? 'is-selected' : ''}`,
      attrs: { type: 'button' }
    });
    card.append(el('span', { class: 'option-card__emoji', text: emoji }));
    card.append(el('span', { text: label }));
    card.addEventListener('click', () => {
      if (group === 'gender') data.gender = value;
      if (group === 'interested_in') data.interested_in = value;
      if (group === 'looking_for') data.looking_for = value;
      renderStep();
    });
    return card;
  };

  /* ---- Step renderers ---- */
  function stepAccount() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Создайте аккаунт', 'Email и пароль нужны для входа. Username виден другим.'));
    if (firstUser) {
      const hint = el('div', { class: 'auth__owner-hint' });
      const crown = el('span', { class: 'role-icon role-icon--owner' });
      crown.innerHTML = icon('crown', { size: 20, fill: true });
      hint.append(crown);
      const text = el('span');
      text.innerHTML = 'Вы первый! <strong>Этот аккаунт станет аккаунтом владельца сайта</strong> — с полным доступом к админ-панели.';
      hint.append(text);
      frag.append(hint);
    }

    const emailField = el('label', { class: 'field' });
    emailField.append(el('span', { class: 'field__label', text: 'Email' }));
    const emailInput = el('input', {
      class: 'input',
      attrs: { type: 'email', placeholder: 'you@example.com', autocomplete: 'email', inputmode: 'email' }
    });
    emailInput.value = data.email;
    emailInput.addEventListener('input', () => {
      data.email = emailInput.value.trim();
    });
    emailField.append(emailInput);
    frag.append(emailField);

    const pass = passwordField('Пароль', { autocomplete: 'new-password', hint: 'Минимум 8 символов' });
    pass.input.value = data.password;
    const meter = el('div', { class: 'password-meter' });
    const bars = [];
    for (let i = 0; i < 4; i += 1) {
      const bar = el('div', { class: 'password-meter__bar' });
      bars.push(bar);
      meter.append(bar);
    }
    pass.field.append(meter);
    const updateMeter = () => {
      const score = passwordScore(pass.input.value);
      bars.forEach((bar, index) => {
        bar.className = 'password-meter__bar';
        if (index < score) {
          bar.classList.add(score <= 1 ? 'is-on-weak' : score <= 2 ? 'is-on-medium' : 'is-on-strong');
        }
      });
    };
    pass.input.addEventListener('input', () => {
      data.password = pass.input.value;
      updateMeter();
    });
    updateMeter();
    frag.append(pass.field);

    const usernameField = el('label', { class: 'field' });
    const labelRow = el('span', { class: 'field__label' });
    labelRow.append(el('span', { text: 'Username' }));
    const usernameHint = el('span', { class: 'field__hint' });
    labelRow.append(usernameHint);
    usernameField.append(labelRow);
    const usernameInput = el('input', {
      class: 'input',
      attrs: {
        type: 'text',
        placeholder: 'uni_lover',
        autocomplete: 'username',
        autocapitalize: 'none',
        maxlength: '20'
      }
    });
    usernameInput.value = data.username;
    let checkTimer = null;
    usernameInput.addEventListener('input', () => {
      const value = usernameInput.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
      if (usernameInput.value !== value) usernameInput.value = value;
      data.username = value;
      usernameHint.textContent = '';
      usernameHint.classList.remove('copy-ok');
      clearTimeout(checkTimer);
      if (value.length < 3) return;
      usernameHint.textContent = 'Проверяем…';
      checkTimer = setTimeout(async () => {
        try {
          const result = await api.get(`/auth/username-check?username=${encodeURIComponent(value)}`);
          usernameHint.textContent = result.available ? 'свободен' : 'занят';
          usernameHint.classList.toggle('copy-ok', !!result.available);
        } catch (err) {
          usernameHint.textContent = '';
        }
      }, 400);
    });
    usernameField.append(usernameInput);
    usernameField.append(el('span', { class: 'field__hint', text: '3–20 символов: латиница, цифры, точка, _' }));
    frag.append(usernameField);
    return frag;
  }

  function stepAbout() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Как вас зовут?', 'Имя и дата рождения видны в профиле. Регистрация строго с 18 лет.'));

    const nameField = el('label', { class: 'field' });
    nameField.append(el('span', { class: 'field__label', text: 'Имя' }));
    const nameInput = el('input', {
      class: 'input',
      attrs: { type: 'text', placeholder: 'Как к вам обращаться', maxlength: '40' }
    });
    nameInput.value = data.display_name;
    nameInput.addEventListener('input', () => {
      data.display_name = nameInput.value;
    });
    nameField.append(nameInput);
    frag.append(nameField);

    const birthField = el('div', { class: 'field' });
    birthField.append(el('span', { class: 'field__label', text: 'Дата рождения' }));
    const row = el('div', { class: 'field-row-3' });
    const daySelect = el('select', { class: 'select', attrs: { 'aria-label': 'День' } });
    daySelect.append(el('option', { text: 'День', attrs: { value: '' } }));
    for (let day = 1; day <= 31; day += 1) {
      daySelect.append(el('option', { text: String(day), attrs: { value: String(day) } }));
    }
    daySelect.value = data.birth_day;
    daySelect.addEventListener('change', () => {
      data.birth_day = daySelect.value;
    });

    const monthSelect = el('select', { class: 'select', attrs: { 'aria-label': 'Месяц' } });
    monthSelect.append(el('option', { text: 'Месяц', attrs: { value: '' } }));
    MONTHS.forEach((month, index) => {
      monthSelect.append(el('option', { text: month, attrs: { value: String(index + 1) } }));
    });
    monthSelect.value = data.birth_month;
    monthSelect.addEventListener('change', () => {
      data.birth_month = monthSelect.value;
    });

    const yearSelect = el('select', { class: 'select', attrs: { 'aria-label': 'Год' } });
    yearSelect.append(el('option', { text: 'Год', attrs: { value: '' } }));
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 18; year >= currentYear - 80; year -= 1) {
      yearSelect.append(el('option', { text: String(year), attrs: { value: String(year) } }));
    }
    yearSelect.value = data.birth_year;
    yearSelect.addEventListener('change', () => {
      data.birth_year = yearSelect.value;
    });
    row.append(daySelect, monthSelect, yearSelect);
    birthField.append(row);
    birthField.append(el('span', { class: 'field__hint', text: 'Мы не показываем дату рождения другим — только возраст' }));
    frag.append(birthField);

    const check = el('label', { class: 'checkbox' });
    const checkbox = el('input', { attrs: { type: 'checkbox' } });
    checkbox.checked = data.agreed;
    checkbox.addEventListener('change', () => {
      data.agreed = checkbox.checked;
    });
    check.append(checkbox);
    const checkText = el('span');
    checkText.innerHTML =
      'Мне есть 18 лет, я принимаю <a href="/rules" target="_blank" style="color:var(--brand-1);font-weight:700">Правила</a> и <a href="/privacy" target="_blank" style="color:var(--brand-1);font-weight:700">Политику конфиденциальности</a>';
    check.append(checkText);
    frag.append(check);
    return frag;
  }

  function stepGender() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Ваш пол', 'Это поможет показывать вас тем, кому вы интересны.'));
    const genderGrid = el('div', { class: 'option-grid' });
    genderGrid.append(optionCard('Мужчина', '👨', 'male', 'gender', data.gender));
    genderGrid.append(optionCard('Женщина', '👩', 'female', 'gender', data.gender));
    genderGrid.append(optionCard('Другое', '🌈', 'other', 'gender', data.gender));
    frag.append(genderGrid);

    frag.append(el('h3', { text: 'Кого показывать', style: { marginTop: '8px' } }));
    const interestsGrid = el('div', { class: 'option-grid' });
    interestsGrid.append(optionCard('Мужчин', '👨', 'male', 'interested_in', data.interested_in));
    interestsGrid.append(optionCard('Женщин', '👩', 'female', 'interested_in', data.interested_in));
    interestsGrid.append(optionCard('Всех', '✨', 'everyone', 'interested_in', data.interested_in));
    frag.append(interestsGrid);
    return frag;
  }

  function stepLooking() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Что вы ищете?', 'Честность помогает находить своих людей.'));
    const grid = el('div', { class: 'option-grid' });
    const options = [
      ['Отношения', '❤️', 'relationship'],
      ['Свидания', '🌹', 'dating'],
      ['Дружба', '🤝', 'friends'],
      ['Просто общение', '💬', 'chat'],
      ['Пока не знаю', '🤷', 'not_sure']
    ];
    for (const [label, emoji, value] of options) {
      grid.append(optionCard(label, emoji, value, 'looking_for', data.looking_for));
    }
    frag.append(grid);
    return frag;
  }

  function stepUniversity() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Где вы учитесь', 'Город: Ташкент. Найдите свой университет в списке.'));

    const search = el('input', {
      class: 'input',
      attrs: { type: 'search', placeholder: 'Поиск по названию или аббревиатуре', 'aria-label': 'Поиск университета' }
    });
    frag.append(search);

    const list = el('div', { class: 'university-list', attrs: { role: 'radiogroup', 'aria-label': 'Университеты' } });
    const renderList = () => {
      const query = search.value.trim().toLowerCase();
      list.innerHTML = '';
      const filtered = universities.filter((university) => {
        if (!query) return true;
        return (
          university.short_name.toLowerCase().includes(query) ||
          university.name.toLowerCase().includes(query) ||
          (university.name_en || '').toLowerCase().includes(query)
        );
      });
      if (!filtered.length) {
        list.append(el('p', { class: 'field__hint', text: 'Ничего не найдено. Попробуйте другой запрос.' }));
        return;
      }
      for (const university of filtered) {
        const item = el('button', {
          class: `university-option ${data.university_id === university.id ? 'is-selected' : ''}`,
          attrs: { type: 'button', role: 'radio', 'aria-checked': String(data.university_id === university.id) }
        });
        item.append(el('span', { class: 'university-option__short', text: university.short_name }));
        item.append(el('span', { class: 'university-option__name', text: university.name }));
        item.addEventListener('click', () => {
          data.university_id = university.id;
          if (university.is_system) data.course = '';
          renderList();
        });
        list.append(item);
      }
    };
    search.addEventListener('input', renderList);
    renderList();
    frag.append(list);

    if (getState().site.allow_university_requests) {
      const requestLink = el('button', { class: 'link-btn', attrs: { type: 'button' }, text: 'Нет моего университета?' });
      requestLink.addEventListener('click', () => openUniversityRequest());
      frag.append(requestLink);
    }

    const facultyLabel = el('div', { class: 'field__label', text: 'Факультет (необязательно)' });
    const faculty = el('input', { class: 'input', attrs: { maxlength: '80', placeholder: 'Например, информационные технологии' } });
    faculty.value = data.faculty;
    faculty.addEventListener('input', () => { data.faculty = faculty.value; });
    frag.append(facultyLabel, faculty);

    const courseLabel = el('div', { class: 'field__label', text: 'Курс' });
    const course = el('select', { class: 'select' });
    course.append(el('option', { text: 'Не указан', attrs: { value: '' } }));
    for (const [value, label] of COURSE_OPTIONS) course.append(el('option', { text: label, attrs: { value } }));
    course.value = data.course;
    course.addEventListener('change', () => { data.course = course.value; });
    frag.append(courseLabel, course);

    const districtLabel = el('div', { class: 'field__label', text: 'Район Ташкента (необязательно)' });
    const district = el('select', { class: 'select' });
    district.append(el('option', { text: 'Не указан', attrs: { value: '' } }));
    districts.forEach((name) => district.append(el('option', { text: name, attrs: { value: name } })));
    district.value = data.district;
    district.addEventListener('change', () => { data.district = district.value; });
    frag.append(districtLabel, district);

    frag.append(el('p', { class: 'field__hint', text: 'Университет и район видны в профиле. Район можно скрыть в настройках.' }));
    return frag;
  }

  function openUniversityRequest() {
    const body = el('div', { class: 'col', style: { gap: '12px' } });
    const name = el('input', { class: 'input', attrs: { maxlength: '120', placeholder: 'Полное название университета' } });
    const short = el('input', { class: 'input', attrs: { maxlength: '12', placeholder: 'Аббревиатура' } });
    body.append(name, short);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Заявка на университет', body, footer });
    footer.append(button('Отмена', { variant: 'btn-ghost', onClick: () => modal.close() }));
    footer.append(
      button('Отправить', {
        variant: 'btn-primary',
        onClick: async (event) => {
          event.target.disabled = true;
          try {
            await api.post('/universities/requests', { name: name.value, short_name: short.value });
            toast('Заявка отправлена владельцу', 'success');
            modal.close();
          } catch (err) {
            toast(err.message || 'Не удалось отправить заявку', 'error');
            event.target.disabled = false;
          }
        }
      })
    );
  }

  function stepInterests() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Ваши интересы', 'Выберите от 3 до 10 — по ним мы ищем совпадения.'));
    const counter = el('div', { class: 'field__hint' });
    const chips = el('div', { class: 'chips' });
    const refresh = () => {
      counter.textContent = `Выбрано ${data.interests.length} из 10`;
      chips.querySelectorAll('.chip').forEach((chip) => {
        chip.classList.toggle('is-active', data.interests.includes(chip.dataset.value));
      });
    };
    for (const interest of interests) {
      const chip = el('button', {
        class: 'chip',
        attrs: { type: 'button', 'data-value': interest.id }
      });
      chip.append(el('span', { text: interest.emoji }));
      chip.append(el('span', { text: interest.label }));
      chip.addEventListener('click', () => {
        const index = data.interests.indexOf(interest.id);
        if (index >= 0) data.interests.splice(index, 1);
        else if (data.interests.length < 10) data.interests.push(interest.id);
        else toast('Максимум 10 интересов', 'error');
        refresh();
      });
      chips.append(chip);
    }
    frag.append(counter, chips);
    requestAnimationFrame(refresh);
    return frag;
  }

  function stepPhotos() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Добавьте фото', 'От 1 до 9 фото. Первое станет главным. Перетащите фото, чтобы изменить порядок.'));
    const grid = el('div', { class: 'photo-grid' });
    const drop = el('div', { class: 'photo-drop' });
    const dropIcon = el('div', { class: 'photo-drop__icon' });
    dropIcon.innerHTML = icon('upload', { size: 22 });
    drop.append(dropIcon);
    drop.append(el('div', { text: 'Перетащите фото сюда или нажмите', style: { fontWeight: '600' } }));
    drop.append(el('div', { class: 'field__hint', text: 'JPG, PNG или WEBP · до 8 МБ · сжимаем автоматически' }));

    const input = el('input', {
      attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: 'multiple' },
      style: { display: 'none' }
    });

    async function addFiles(files) {
      const list = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
      if (!list.length) return;
      if (data.photos.length + list.length > 9) {
        toast('Максимум 9 фото', 'error');
      }
      for (const file of list) {
        if (data.photos.length >= 9) break;
        try {
          const compressed = await compressImage(file);
          data.photos.push({ dataUrl: compressed.dataUrl, preview: compressed.dataUrl });
        } catch (err) {
          toast(err.message || 'Не удалось обработать фото', 'error');
        }
      }
      renderStep();
    }

    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = '';
    });
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('is-dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragover'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-dragover');
      addFiles(event.dataTransfer.files);
    });

    frag.append(drop, input);

    let dragIndex = null;
    data.photos.forEach((photo, index) => {
      const tile = el('div', { class: 'photo-tile', attrs: { draggable: 'true' } });
      const img = el('img', { attrs: { src: photo.preview, alt: `Фото ${index + 1}` } });
      tile.append(img);
      if (index === 0) tile.append(el('span', { class: 'photo-tile__main', text: 'Главное' }));

      const handle = el('span', { class: 'photo-tile__drag', attrs: { title: 'Перетащить' } });
      handle.innerHTML = icon('grid', { size: 13 });
      tile.append(handle);

      const remove = el('button', {
        class: 'photo-tile__remove',
        attrs: { type: 'button', 'aria-label': 'Удалить фото' }
      });
      remove.innerHTML = icon('x', { size: 14 });
      remove.addEventListener('click', () => {
        data.photos.splice(index, 1);
        renderStep();
      });
      tile.append(remove);

      const move = (delta) => {
        const target = index + delta;
        if (target < 0 || target >= data.photos.length) return;
        const [item] = data.photos.splice(index, 1);
        data.photos.splice(target, 0, item);
        renderStep();
      };
      const left = el('button', {
        class: 'photo-tile__remove',
        attrs: { type: 'button', 'aria-label': 'Влево', title: 'Переместить назад' },
        style: { top: 'auto', bottom: '6px', right: '34px' }
      });
      left.innerHTML = icon('chevronLeft', { size: 13 });
      left.addEventListener('click', () => move(-1));
      const right = el('button', {
        class: 'photo-tile__remove',
        attrs: { type: 'button', 'aria-label': 'Вправо', title: 'Переместить вперёд' },
        style: { top: 'auto', bottom: '6px', right: '6px' }
      });
      right.innerHTML = icon('chevronRight', { size: 13 });
      right.addEventListener('click', () => move(1));
      tile.append(left, right);

      tile.addEventListener('dragstart', () => {
        dragIndex = index;
        tile.classList.add('is-dragging');
      });
      tile.addEventListener('dragend', () => {
        dragIndex = null;
        tile.classList.remove('is-dragging');
      });
      tile.addEventListener('dragover', (event) => event.preventDefault());
      tile.addEventListener('drop', (event) => {
        event.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        const [item] = data.photos.splice(dragIndex, 1);
        data.photos.splice(index, 0, item);
        renderStep();
      });
      grid.append(tile);
    });

    if (data.photos.length) frag.append(grid);
    return frag;
  }

  function stepBio() {
    const frag = document.createDocumentFragment();
    frag.append(stepTitle('Расскажите о себе', 'Пара живых строк повышает шансы на взаимность.'));
    const textarea = el('textarea', {
      class: 'textarea',
      attrs: { placeholder: 'Люблю кофе, долгие прогулки и хорошие фильмы…', maxlength: '500', rows: '5' }
    });
    textarea.value = data.bio;
    const counter = el('span', { class: 'field__hint', text: `${data.bio.length}/500` });
    textarea.addEventListener('input', () => {
      data.bio = textarea.value;
      counter.textContent = `${data.bio.length}/500`;
    });
    frag.append(textarea, counter);

    const summary = el('div', { class: 'auth__owner-hint' });
    summary.innerHTML = '<span>✨</span><span>Всё готово! Нажмите «Создать аккаунт» — и мы сразу откроем свайпы.</span>';
    frag.append(summary);
    return frag;
  }

  const STEPS = [
    { title: 'Аккаунт', render: stepAccount, nextLabel: 'Далее' },
    { title: 'О вас', render: stepAbout, nextLabel: 'Далее' },
    { title: 'Пол', render: stepGender, nextLabel: 'Далее' },
    { title: 'Цель', render: stepLooking, nextLabel: 'Далее' },
    { title: 'Учёба', render: stepUniversity, nextLabel: 'Далее' },
    { title: 'Интересы', render: stepInterests, nextLabel: 'Далее' },
    { title: 'Фото', render: stepPhotos, nextLabel: 'Далее' },
    { title: 'Био', render: stepBio, nextLabel: 'Создать аккаунт' }
  ];

  function validate(index) {
    if (index === 0) {
      const email = data.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) return 'Введите корректный email';
      if (data.password.length < 8) return 'Пароль должен содержать минимум 8 символов';
      if (!/^[a-z0-9._]{3,20}$/.test(data.username)) {
        return 'Username: 3–20 символов, латиница, цифры, точка или _';
      }
    }
    if (index === 1) {
      if (data.display_name.trim().length < 2) return 'Укажите имя (минимум 2 символа)';
      if (!data.birth_day || !data.birth_month || !data.birth_year) return 'Укажите дату рождения полностью';
      const date = new Date(
        Number(data.birth_year),
        Number(data.birth_month) - 1,
        Number(data.birth_day)
      );
      const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (Number.isNaN(age)) return 'Укажите корректную дату рождения';
      if (age < 18) return 'Регистрация доступна только с 18 лет';
      if (age > 100) return 'Проверьте год рождения';
      if (!data.agreed) return 'Подтвердите, что вам есть 18 лет и вы принимаете правила';
    }
    if (index === 2) {
      if (!data.gender) return 'Выберите пол';
      if (!data.interested_in) return 'Выберите, кого показывать';
    }
    if (index === 3 && !data.looking_for) return 'Выберите, что вы ищете';
    if (index === 4 && !data.university_id) return 'Выберите университет';
    if (index === 5 && data.interests.length < 3) return 'Выберите минимум 3 интереса';
    if (index === 6 && data.photos.length < 1) return 'Добавьте хотя бы одно фото';
    return null;
  }

  function renderProgress() {
    progress.innerHTML = '';
    STEPS.forEach((step, index) => {
      const seg = el('div', { class: 'wizard__seg' });
      if (index < stepIndex) seg.classList.add('is-done');
      if (index === stepIndex) seg.classList.add('is-current');
      seg.append(el('span'));
      progress.append(seg);
    });
    stepLabel.textContent = `${stepIndex + 1} / ${STEPS.length}`;
  }

  function renderStep() {
    renderProgress();
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    body.innerHTML = '';
    body.append(STEPS[stepIndex].render());
    actions.innerHTML = '';
    if (stepIndex > 0) {
      actions.append(
        button('Назад', {
          variant: 'btn-secondary',
          onClick: () => {
            stepIndex -= 1;
            renderStep();
          }
        })
      );
    }
    const nextBtn = button(STEPS[stepIndex].nextLabel, {
      variant: 'btn-primary',
      onClick: () => next()
    });
    if (busy) nextBtn.disabled = true;
    actions.append(nextBtn);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function next() {
    const error = validate(stepIndex);
    if (error) {
      errorBox.textContent = error;
      errorBox.classList.remove('hidden');
      return;
    }
    if (stepIndex < STEPS.length - 1) {
      stepIndex += 1;
      renderStep();
      return;
    }
    await submit();
  }

  backIcon.addEventListener('click', () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      renderStep();
    } else {
      navigate('/login');
    }
  });

  // Explicit confirmation instead of silently jumping to another page.
  function showSuccess(response) {
    const user = response.user || {};
    document.title = 'Аккаунт создан — UNI Lovers';
    panel.innerHTML = '';
    const wrap = el('div', { class: 'wizard', style: { padding: '28px 22px', textAlign: 'center' } });
    const badge = el('div', {
      style: {
        width: '64px',
        height: '64px',
        margin: '0 auto 14px',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(253, 38, 122, 0.12)',
        color: 'var(--brand-1)'
      }
    });
    badge.innerHTML = icon('check', { size: 32 });
    wrap.append(badge);
    wrap.append(el('h2', { class: 'wizard__title', text: 'Аккаунт создан' }));
    wrap.append(el('p', { class: 'wizard__sub', text: `Добро пожаловать, ${user.display_name || data.display_name}!` }));
    wrap.append(
      el('p', {
        class: 'field__hint',
        text: `Вы уже вошли как @${user.username || data.username}. Войти снова можно по email ${
          user.email || data.email
        } и вашему паролю.`
      })
    );
    if (response.owner) {
      const ownerBox = el('div', { class: 'auth__owner-hint', style: { textAlign: 'left' } });
      const crown = el('span', { class: 'role-icon role-icon--owner' });
      crown.innerHTML = icon('crown', { size: 20, fill: true });
      ownerBox.append(crown);
      const text = el('span');
      text.innerHTML = 'Вы <strong>первый пользователь</strong> — этот аккаунт стал владельцем сайта. Админ-панель уже доступна.';
      ownerBox.append(text);
      wrap.append(ownerBox);
    }
    const actionsRow = el('div', {
      class: 'row',
      style: { justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }
    });
    actionsRow.append(
      button('Начать свайпы', {
        variant: 'btn-primary',
        icon: 'flame',
        onClick: () => navigate('/swipe', { replace: true })
      })
    );
    actionsRow.append(
      button('Заполнить профиль', {
        variant: 'btn-secondary',
        onClick: () => navigate('/profile/edit')
      })
    );
    if (response.owner) {
      actionsRow.append(
        button('Открыть админ-панель', {
          variant: 'btn-secondary',
          icon: 'shield',
          onClick: () => navigate('/admin')
        })
      );
    }
    wrap.append(actionsRow);
    const footer = el('div', { class: 'auth__footer' });
    footer.append(el('span', { text: 'Если выйдете, войти можно на странице ' }));
    footer.append(el('a', { text: 'входа', attrs: { href: '/login' } }));
    wrap.append(footer);
    panel.append(wrap);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (busy) return;
    busy = true;
    const submitBtn = actions.querySelector('.btn-primary');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Создаём аккаунт…';
    }
    errorBox.classList.add('hidden');
    try {
      const birthdate = `${data.birth_year}-${String(data.birth_month).padStart(2, '0')}-${String(
        data.birth_day
      ).padStart(2, '0')}`;
      const payload = {
        email: data.email.trim().toLowerCase(),
        password: data.password,
        username: data.username.trim().toLowerCase(),
        display_name: data.display_name.trim(),
        birthdate,
        gender: data.gender,
        interested_in: data.interested_in,
        looking_for: data.looking_for,
        university_id: data.university_id,
        faculty: data.faculty.trim() || null,
        course: data.course || null,
        district: data.district || null,
        interests: data.interests,
        bio: data.bio,
        photos: data.photos.map((photo) => photo.dataUrl)
      };
      const response = await api.post('/auth/register', payload);
      setToken(response.token);
      setUser(response.user);
      window.dispatchEvent(new CustomEvent('uni:auth-changed'));
      toast(response.owner ? 'Аккаунт создан — вы владелец сайта' : 'Аккаунт создан!', 'success');
      showSuccess(response);
    } catch (err) {
      const field = err.data && err.data.field;
      if (field === 'photos') stepIndex = 6;
      if (field === 'interests') stepIndex = 5;
      if (field === 'university_id' || field === 'course' || field === 'district') stepIndex = 4;
      if (field === 'birthdate') stepIndex = 1;
      if (field === 'email' || field === 'username' || field === 'password') stepIndex = 0;
      renderStep();
      errorBox.textContent = err.message || 'Не удалось создать аккаунт';
      errorBox.classList.remove('hidden');
    } finally {
      busy = false;
    }
  }

  renderStep();

  const backLink = el('a', { class: 'legal__back', attrs: { href: '/' } });
  backLink.append(svgIcon('arrowLeft', { size: 16 }));
  backLink.append(el('span', { text: 'На главную' }));
  panel.append(backLink);

  return root;
}
