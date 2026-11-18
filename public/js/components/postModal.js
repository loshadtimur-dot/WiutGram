import { api } from '../api.js?v=18';
import {
  el,
  avatarNode,
  openModal,
  confirmDialog,
  toast,
  formatNumber,
  timeAgo,
  svgIcon,
  ruleBadges
} from '../ui.js?v=18';
import { icon } from '../icons.js?v=18';
import { getState } from '../state.js?v=18';
import { navigate } from '../router.js?v=18';
import { likesLabel } from './postCard.js?v=18';

// Full Instagram-style post modal with comments, likes and views.
export function openPostModal(post, options = {}) {
  const me = getState().user;
  let liked = !!post.liked;
  let likes = Number(post.likes) || 0;
  let views = Number(post.views_count) || 0;
  let comments = [];
  let replyTo = null;

  const layout = el('div', { class: 'post-modal' });
  const mediaWrap = el('div', { class: 'post-modal__media' });
  const img = el('img', { attrs: { src: post.image_path, alt: post.caption || 'Пост' } });
  mediaWrap.append(img);
  const heart = el('div', { class: 'post-modal__heart' });
  heart.innerHTML = icon('heart', { size: 104, fill: true });
  mediaWrap.append(heart);
  layout.append(mediaWrap);

  const side = el('div', { class: 'post-modal__side' });
  const head = el('div', { class: 'post-modal__head' });
  const authorWrap = el('div', { class: 'post-card__author' });
  authorWrap.append(avatarNode(post.author, 'sm'));
  const authorText = el('div');
  const nameRow = el('div', { class: 'post-card__name' });
  nameRow.append(el('span', { text: post.author.display_name }));
  nameRow.append(ruleBadges(post.author));
  authorText.append(nameRow);
  if (post.location) {
    const place = el('div', { class: 'post-card__place' });
    place.innerHTML = icon('mapPin', { size: 11 });
    place.append(el('span', { text: post.location }));
    authorText.append(place);
  }
  authorWrap.append(authorText);
  authorWrap.addEventListener('click', () => {
    modal.close();
    navigate(`/u/${post.author.username}`);
  });
  head.append(authorWrap);
  if (post.user_id === me.id || me.role === 'owner' || me.role === 'admin') {
    const deleteBtn = el('button', { class: 'icon-btn-plain', attrs: { type: 'button', 'aria-label': 'Удалить пост' } });
    deleteBtn.innerHTML = icon('trash', { size: 17 });
    deleteBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Удалить пост?',
        message: 'Фото, лайки и комментарии будут удалены безвозвратно.',
        confirmText: 'Удалить',
        danger: true
      });
      if (!ok) return;
      try {
        await api.delete(`/posts/${post.id}`);
        toast('Пост удалён');
        modal.close();
        if (options.onDeleted) options.onDeleted(post);
      } catch (err) {
        toast(err.message || 'Не удалось удалить пост', 'error');
      }
    });
    head.append(deleteBtn);
  }
  side.append(head);

  const commentsEl = el('div', { class: 'post-modal__comments' });
  side.append(commentsEl);

  const stats = el('div', { class: 'post-modal__stats' });
  side.append(stats);

  const replyChip = el('div', { class: 'reply-chip hidden' });
  side.append(replyChip);

  const composer = el('form', { class: 'post-composer comment-composer' });
  const input = el('input', {
    attrs: { type: 'text', placeholder: 'Добавьте комментарий…', maxlength: '500', 'aria-label': 'Комментарий' }
  });
  const sendBtn = el('button', { attrs: { type: 'submit' }, text: 'Опубликовать' });
  sendBtn.disabled = true;
  composer.append(input, sendBtn);
  side.append(composer);
  layout.append(side);

  const modal = openModal({
    body: layout,
    size: 'full',
    flush: true,
    class: 'modal--post',
    title: undefined
  });

  function paintStats() {
    stats.innerHTML = '';
    const likeRow = el('div');
    const strong = el('strong', { text: `${formatNumber(likes)} ${likesLabel(likes)}` });
    likeRow.append(strong);
    stats.append(likeRow);
    stats.append(el('div', { class: 'post-card__views', text: `${formatNumber(views)} просмотров` }));
    if (post.caption) {
      const cap = el('div', { class: 'post-card__caption', style: { marginTop: '6px' } });
      cap.append(el('strong', { text: `${post.author.display_name} ` }));
      cap.append(el('span', { text: post.caption }));
      stats.append(cap);
    }
    stats.append(el('div', { class: 'post-card__time', text: timeAgo(post.created_at) }));

    const bar = el('div', { class: 'post-card__bar', style: { padding: '8px 0 0' } });
    const likeBtn = el('button', { class: `post-action ${liked ? 'is-liked' : ''}`, attrs: { type: 'button', 'aria-label': 'Нравится' } });
    likeBtn.innerHTML = icon('heart', { size: 24, fill: liked });
    likeBtn.addEventListener('click', toggleLike);
    const commentBtn = el('button', { class: 'post-action', attrs: { type: 'button', 'aria-label': 'Комментарий' } });
    commentBtn.innerHTML = icon('comment', { size: 23 });
    commentBtn.addEventListener('click', () => input.focus());
    const shareBtn = el('button', { class: 'post-action post-action--save', attrs: { type: 'button', 'aria-label': 'Поделиться' } });
    shareBtn.innerHTML = icon('share', { size: 21 });
    shareBtn.addEventListener('click', async () => {
      const link = `${window.location.origin}/u/${post.author.username}`;
      try {
        await navigator.clipboard.writeText(link);
        toast('Ссылка скопирована', 'success');
      } catch (err) {
        toast(link);
      }
    });
    bar.append(likeBtn, commentBtn, shareBtn);
    stats.append(bar);
  }

  async function toggleLike() {
    liked = !liked;
    likes += liked ? 1 : -1;
    paintStats();
    try {
      const data = liked
        ? await api.post(`/posts/${post.id}/like`)
        : await api.delete(`/posts/${post.id}/like`);
      likes = data.likes;
      if (options.onChanged) options.onChanged({ liked, likes });
      paintStats();
    } catch (err) {
      liked = !liked;
      likes += liked ? 1 : -1;
      paintStats();
      toast('Не удалось изменить лайк', 'error');
    }
  }

  function commentNode(comment) {
    const node = el('div', { class: `comment ${comment.parent_id ? 'comment--reply' : ''}` });
    node.append(avatarNode(comment.author, 'sm'));
    const body = el('div', { class: 'comment__body' });
    const text = el('div');
    text.append(el('span', { class: 'comment__author', text: comment.author.display_name }));
    text.append(el('span', { text: comment.body }));
    body.append(text);
    const meta = el('div', { class: 'comment__meta' });
    meta.append(el('span', { text: timeAgo(comment.created_at) }));

    const likeBtn = el('button', {
      class: `comment__like ${comment.liked ? 'is-liked' : ''}`,
      attrs: { type: 'button', 'aria-label': 'Лайк комментария' }
    });
    likeBtn.innerHTML = icon('heart', { size: 14, fill: comment.liked });
    likeBtn.addEventListener('click', async () => {
      try {
        const data = await api.post(`/comments/${comment.id}/like`);
        comment.liked = data.liked;
        comment.likes = data.likes;
        const countSpan = likeBtn.querySelector('.comment-like-count');
        if (countSpan) countSpan.textContent = data.likes > 0 ? String(data.likes) : '';
        likeBtn.classList.toggle('is-liked', data.liked);
        likeBtn.innerHTML = icon('heart', { size: 14, fill: data.liked });
        if (data.likes > 0) likeBtn.append(el('span', { class: 'comment-like-count', text: String(data.likes) }));
      } catch (err) {
        toast('Не удалось поставить лайк', 'error');
      }
    });
    meta.append(likeBtn);

    if (comment.likes > 0) {
      meta.append(el('span', { text: `${comment.likes}` }));
    }

    const replyBtn = el('button', { text: 'Ответить', attrs: { type: 'button' } });
    replyBtn.addEventListener('click', () => {
      replyTo = comment;
      replyChip.innerHTML = '';
      replyChip.append(el('span', { text: `Ответ на комментарий ${comment.author.display_name}` }));
      const cancel = el('button', { attrs: { type: 'button', 'aria-label': 'Отменить ответ' } });
      cancel.innerHTML = icon('x', { size: 12 });
      cancel.addEventListener('click', () => {
        replyTo = null;
        replyChip.classList.add('hidden');
      });
      replyChip.append(cancel);
      replyChip.classList.remove('hidden');
      input.focus();
    });
    meta.append(replyBtn);

    if (comment.author.id === me.id || post.user_id === me.id || me.role === 'owner' || me.role === 'admin') {
      const delBtn = el('button', { text: 'Удалить', attrs: { type: 'button' } });
      delBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Удалить комментарий?',
          message: 'Комментарий и ответы на него исчезнут.',
          confirmText: 'Удалить',
          danger: true
        });
        if (!ok) return;
        try {
          await api.delete(`/comments/${comment.id}`);
          comments = comments.filter((item) => item.id !== comment.id && item.parent_id !== comment.id);
          paintComments();
        } catch (err) {
          toast(err.message || 'Не удалось удалить комментарий', 'error');
        }
      });
      meta.append(delBtn);
    }

    body.append(meta);
    node.append(body);
    return node;
  }

  function paintComments() {
    commentsEl.innerHTML = '';
    if (!comments.length) {
      commentsEl.append(
        el('div', { class: 'empty', style: { padding: '24px 10px' } }, [
          el('div', { class: 'empty__emoji', text: '💬', style: { fontSize: '30px' } }),
          el('div', { class: 'empty__title', text: 'Комментариев пока нет' }),
          el('div', { class: 'empty__text', text: 'Будьте первым, кто поддержит этот пост.' })
        ])
      );
      return;
    }
    const roots = comments.filter((comment) => !comment.parent_id);
    for (const root of roots) {
      commentsEl.append(commentNode(root));
      for (const reply of comments.filter((comment) => comment.parent_id === root.id)) {
        commentsEl.append(commentNode(reply));
      }
    }
  }

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
  });

  composer.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    sendBtn.disabled = true;
    try {
      const data = await api.post(`/posts/${post.id}/comments`, {
        body,
        parent_id: replyTo ? replyTo.id : null
      });
      comments.push(data.comment);
      input.value = '';
      replyTo = null;
      replyChip.classList.add('hidden');
      paintComments();
      commentsEl.scrollTop = commentsEl.scrollHeight;
    } catch (err) {
      toast(err.message || 'Не удалось отправить комментарий', 'error');
    } finally {
      sendBtn.disabled = !input.value.trim();
    }
  });

  let lastTap = 0;
  mediaWrap.addEventListener('pointerup', () => {
    const now = Date.now();
    if (now - lastTap < 320 && !liked) {
      heart.classList.remove('is-beating');
      void heart.offsetWidth;
      heart.classList.add('is-beating');
      toggleLike();
    }
    lastTap = now;
  });
  mediaWrap.addEventListener('dblclick', (event) => {
    event.preventDefault();
    if (!liked) {
      heart.classList.remove('is-beating');
      void heart.offsetWidth;
      heart.classList.add('is-beating');
      toggleLike();
    }
  });

  paintStats();
  paintComments();

  api
    .post(`/posts/${post.id}/view`)
    .then((data) => {
      views = data.views;
      paintStats();
    })
    .catch(() => {});

  api
    .get(`/posts/${post.id}/comments`)
    .then((data) => {
      comments = data.comments || [];
      paintComments();
    })
    .catch(() => {});

  return modal;
}
