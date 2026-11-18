import { api } from '../api.js?v=18';
import {
  el,
  avatarNode,
  formatNumber,
  timeAgo,
  svgIcon,
  toast
} from '../ui.js?v=18';
import { icon } from '../icons.js?v=18';
import { getState } from '../state.js?v=18';
import { navigate } from '../router.js?v=18';
import { openPostModal } from './postModal.js?v=18';

// Instagram-like feed card.
export function createPostCard(post, options = {}) {
  const me = getState().user;
  const card = el('article', { class: 'post-card' });
  let liked = !!post.liked;
  let likes = Number(post.likes) || 0;
  let views = Number(post.views_count) || 0;

  const head = el('div', { class: 'post-card__head' });
  const author = el('div', { class: 'post-card__author' });
  author.append(avatarNode(post.author, 'sm'));
  const authorText = el('div');
  const nameRow = el('div', { class: 'post-card__name' });
  nameRow.append(el('span', { text: post.author.display_name }));
  if (post.author.is_verified) {
    const verified = el('span', { class: 'verified' });
    verified.innerHTML = icon('verified', { size: 14, fill: true });
    nameRow.append(verified);
  }
  if (post.author.role === 'owner') {
    const crown = el('span', { class: 'role-icon role-icon--owner' });
    crown.innerHTML = icon('crown', { size: 13, fill: true });
    nameRow.append(crown);
  }
  authorText.append(nameRow);
  if (post.location) {
    const place = el('div', { class: 'post-card__place' });
    place.innerHTML = icon('mapPin', { size: 11 });
    place.append(el('span', { text: post.location }));
    authorText.append(place);
  }
  author.append(authorText);
  author.addEventListener('click', () => navigate(`/u/${post.author.username}`));
  head.append(author);

  const more = el('button', { class: 'icon-btn-plain', attrs: { type: 'button', 'aria-label': 'Открыть пост' } });
  more.innerHTML = icon('moreVertical', { size: 18 });
  more.addEventListener('click', () => openPostModal({ ...post, liked, likes, views_count: views }, {
    onDeleted: options.onDeleted,
    onChanged: (patch) => {
      if (patch.liked !== undefined) liked = patch.liked;
      if (patch.likes !== undefined) likes = patch.likes;
      paint();
    }
  }));
  head.append(more);
  card.append(head);

  const media = el('div', { class: 'post-card__media' });
  const img = el('img', {
    attrs: { src: post.image_path, alt: post.caption || 'Пост', loading: 'lazy' }
  });
  media.append(img);
  const heart = el('div', { class: 'post-card__heart' });
  heart.innerHTML = icon('heart', { size: 96, fill: true });
  media.append(heart);

  const likeAction = async () => {
    if (liked) return;
    liked = true;
    likes += 1;
    heart.classList.remove('is-beating');
    void heart.offsetWidth;
    heart.classList.add('is-beating');
    paint();
    try {
      const data = await api.post(`/posts/${post.id}/like`);
      likes = data.likes;
      paint();
    } catch (err) {
      liked = false;
      likes -= 1;
      paint();
      toast('Не удалось поставить лайк', 'error');
    }
  };
  media.addEventListener('dblclick', likeAction);
  media.addEventListener('click', (event) => {
    if (event.target === media || event.target === img) openPostModal(post, { onDeleted: options.onDeleted });
  });
  card.append(media);

  const bar = el('div', { class: 'post-card__bar' });
  const heartBtn = el('button', { class: 'post-action', attrs: { type: 'button', 'aria-label': 'Нравится' } });
  const commentBtn = el('button', { class: 'post-action', attrs: { type: 'button', 'aria-label': 'Комментарии' } });
  const shareBtn = el('button', { class: 'post-action post-action--save', attrs: { type: 'button', 'aria-label': 'Поделиться' } });
  commentBtn.innerHTML = icon('comment', { size: 22 });
  shareBtn.innerHTML = icon('share', { size: 21 });
  bar.append(heartBtn, commentBtn, shareBtn);

  heartBtn.addEventListener('click', async () => {
    liked = !liked;
    likes += liked ? 1 : -1;
    paint();
    try {
      const data = liked
        ? await api.post(`/posts/${post.id}/like`)
        : await api.delete(`/posts/${post.id}/like`);
      likes = data.likes;
      paint();
    } catch (err) {
      liked = !liked;
      likes += liked ? 1 : -1;
      paint();
      toast('Не удалось изменить лайк', 'error');
    }
  });
  commentBtn.addEventListener('click', () => openPostModal(post, { onDeleted: options.onDeleted }));
  shareBtn.addEventListener('click', async () => {
    const link = `${window.location.origin}/u/${post.author.username}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка на профиль скопирована', 'success');
    } catch (err) {
      toast(link);
    }
  });
  card.append(bar);

  const body = el('div', { class: 'post-card__body' });
  const likesEl = el('div', { class: 'post-card__likes' });
  const viewsEl = el('div', { class: 'post-card__views' });
  const caption = el('div', { class: 'post-card__caption' });
  const commentsBtn = el('button', { class: 'post-card__comments-btn' });
  const timeEl = el('div', { class: 'post-card__time' });
  body.append(likesEl, viewsEl, caption, commentsBtn, timeEl);
  card.append(body);

  function paint() {
    heartBtn.innerHTML = icon(liked ? 'heart' : 'heart', { size: 23, fill: liked });
    heartBtn.classList.toggle('is-liked', liked);
    likesEl.textContent = `${formatNumber(likes)} ${likesLabel(likes)}`;
    viewsEl.textContent = `${formatNumber(views)} просмотров`;
    if (post.caption) {
      caption.innerHTML = '';
      const strong = el('strong', { text: post.author.display_name });
      caption.append(strong, el('span', { text: post.caption }));
    }
    commentsBtn.textContent = post.comments
      ? `Посмотреть все комментарии (${post.comments})`
      : 'Добавить комментарий';
    commentsBtn.classList.toggle('hidden', !post.comments);
    timeEl.textContent = timeAgo(post.created_at);
  }
  paint();

  // Register a unique view when the card becomes visible.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.disconnect();
      api
        .post(`/posts/${post.id}/view`)
        .then((data) => {
          views = data.views;
          viewsEl.textContent = `${formatNumber(views)} просмотров`;
        })
        .catch(() => {});
    }
  }, { threshold: 0.6 });
  observer.observe(media);

  if (me && post.author.id === me.id) {
    // Own posts are still fully interactive; deletion lives in the post modal.
  }

  return card;
}

export function likesLabel(count) {
  const n = Math.abs(Number(count) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return 'лайков';
  if (n1 > 1 && n1 < 5) return 'лайка';
  if (n1 === 1) return 'лайк';
  return 'лайков';
}
