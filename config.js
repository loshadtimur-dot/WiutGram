'use strict';

// Single source of truth for site-wide constants.

const CITY = 'Ташкент';

// Tashkent districts used instead of distances.
const DISTRICTS = [
  'Алмазарский',
  'Бектемирский',
  'Мирабадский',
  'Мирзо-Улугбекский',
  'Сергелийский',
  'Учтепинский',
  'Чилансарский',
  'Шайхантахурский',
  'Юнусабадский',
  'Яккасарайский',
  'Яшнабадский',
  'Янгихаётский'
];

// Stored values for the study year. Labels are shown in the UI.
const COURSES = [
  { value: '1', label: '1 курс' },
  { value: '2', label: '2 курс' },
  { value: '3', label: '3 курс' },
  { value: '4', label: '4 курс' },
  { value: '5', label: '5 курс' },
  { value: '6', label: '6 курс' },
  { value: 'master', label: 'Магистратура' },
  { value: 'graduate', label: 'Выпускник' },
  { value: 'phd', label: 'Аспирант' }
];
const COURSE_VALUES = COURSES.map((course) => course.value);
const COURSE_LABELS = COURSES.reduce((acc, course) => {
  acc[course.value] = course.label;
  return acc;
}, {});

const ROLES = ['owner', 'user'];

const MIN_OWNER_PASSWORD = 10;
const MIN_PASSWORD = 8;

const LIMITS = {
  superLikesPerDay: 5,
  maxPhotos: 9,
  maxBio: 500
};

// Wiutgram belongs to one campus only: Westminster International University
// in Tashkent. The list is intentionally a single entry.
const UNIVERSITY_SEED = [['WIUT', 'Вестминстерский международный университет в Ташкенте']];
const UNIVERSITY_NAME_EN = 'Westminster International University in Tashkent';
const SYSTEM_UNIVERSITY = null;

module.exports = {
  CITY,
  DISTRICTS,
  COURSES,
  COURSE_VALUES,
  COURSE_LABELS,
  ROLES,
  MIN_PASSWORD,
  MIN_OWNER_PASSWORD,
  LIMITS,
  UNIVERSITY_SEED,
  UNIVERSITY_NAME_EN,
  SYSTEM_UNIVERSITY
};
