'use strict';

// Interests shown during onboarding and profile editing.
const INTERESTS = [
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
  { id: 'business', label: 'Бизнес', emoji: '💼' },
  { id: 'football', label: 'Футбол', emoji: '⚽' },
  { id: 'nature', label: 'Природа', emoji: '🌿' },
  { id: 'languages', label: 'Языки', emoji: '🌍' }
];

const INTEREST_IDS = INTERESTS.map((i) => i.id);

const LANGUAGES = ['Узбекский', 'Русский', 'Английский', 'Каракалпакский', 'Таджикский', 'Турецкий', 'Корейский'];

const GENDERS = ['male', 'female', 'other'];
const INTERESTED_IN = ['male', 'female', 'everyone'];
// "relationship" and "dating" stay accepted for profiles created before the
// repositioning; the UI only offers friend-, chat- and project-oriented goals.
const LOOKING_FOR = ['relationship', 'dating', 'friends', 'chat', 'project', 'not_sure'];

module.exports = { INTERESTS, INTEREST_IDS, LANGUAGES, GENDERS, INTERESTED_IN, LOOKING_FOR };
