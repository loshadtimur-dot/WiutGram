import { api, compressImage, toFormData } from '../api.js?v=25';
import {
  el,
  avatarNode,
  button,
  iconButton,
  toast,
  formatNumber,
  timeAgo,
  emptyState,
  loadingRow,
  confirmDialog,
  openModal,
  ruleBadges,
  genderLabel,
  looksForLabel,
  initials,
  gradientFor,
  svgIcon,
  plural
} from '../ui.js?v=25';
import { icon } from '../icons.js?v=25';
import { getState, patchUser, refreshMe, setCounts } from '../state.js?v=25';
import { navigate } from '../router.js?v=25';
import { openPostModal } from '../components/postModal.js?v=25';
import { openPostCreate, openStoryCreate } from '../components/postCreate.js?v=25';
import { createStoryRail, openStoryViewer } from '../components/storyViewer.js?v=25';
import { lineChartNode, barChartNode, legendDot } from '../components/charts.js?v=25';
import { openReportDialog, openBlockConfirm } from '../components/report.js?v=25';
import { showMatchScreen } from '../components/match.js?v=25';
import { mountAdBanner } from '../components/adBanner.js?v=25';
import { badgeNode, applyNameGift } from '../components/cosmetics.js?v=25';
import { glassSvg } from '../components/glass.js?v=25';
import { decorPanelNode, bannerNode, bannerPlaceholder, openBannerGallery, openStatusPicker } from '../components/decor.js?v=25';
import { openGiftViewer } from '../components/giftViewer.js?v=25';

export default async function ProfilePage(ctx) {
  const me = getState().user;
  const username = (ctx.params.username || me.username).toLowerCase();
  const isSelfRoute = !ctx.params.username;

  let profileData;
  try {
    profileData = await api.get(`/users/${encodeURIComponent(username)}`);
  } catch (err) {
    const wrap = el('div', { class: 'empty', style: { minHeight: '50vh' } });
    wrap.append(el('div', { class: 'empty__emoji', text: '🔒' }));
    wrap.append(el('div', { class: 'empty__title', text: 'Профиль недоступен' }));
    wrap.append(el('div', { class: 'empty__text', text: err.message || 'Возможно, пользователь скрыл профиль или заблокировал вас.' }));
    wrap.append(button('К свайпам', { onClick: () => navigate('/swipe') }));
    return wrap;
  }

  const isSelf = profileData.is_self || username === me.username;
  const profile = profileData.user;
  const counts = profileData.counts || { posts: 0 };
  const root = el('div', { class: 'profile-page' });
  const cosmetics = profileData.cosmetics || {
    banner: null,
    badges: [],
    gifts: [],
    equipped_gift: null,
    follow: { followers: 0, following: 0 }
  };
  const profileGift = cosmetics.equipped_gift || null;
  if (profileGift) {
    root.dataset.giftRarity = profileGift.rarity;
    root.classList.add('has-gift-bg');
  }
  let following = !!profileData.is_following;
  const decorState =
    profileData.decor || { banner: null, background: null, status: null, custom_banner_path: null };
  const profileGifts = profileData.gifts || [];
  const giftStats = profileData.gift_stats || { total: 0, top_givers: [] };
  const giftCount = giftStats.total || profileGifts.length;
  if (decorState.background) {
    root.style.background = decorState.background.theme;
    root.classList.add('has-background', `bg-pattern-${decorState.background.pattern || 'dots'}`);
  }

  let posts = [];
  let feeds = [];
  let highlights = [];
  let activeTab = 'posts';
  let postsOffset = 0;
  let hasMorePosts = false;
  let statsRendered = false;

  /* ---------- Header ---------- */
  const header = el('div', { class: 'profile-header' });
  const avatarCol = el('div', { class: 'profile-avatar-col' });
  const avatarHolder = el('div', { class: 'avatar-holder' });
  avatarCol.append(avatarHolder);
  if (isSelf) {
    const addStory = el('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button' } });
    addStory.innerHTML = icon('camera', { size: 14 });
    addStory.append(el('span', { text: 'История' }));
    addStory.addEventListener('click', () => openStoryCreate(() => loadStories()));
    avatarCol.append(addStory);
  }
  header.append(avatarCol);

  const info = el('div', { class: 'profile-info' });
  const nameRow = el('div', { class: 'profile-name-row' });
  const nameText = el('div', { class: 'profile-username', text: profile.display_name });
  if (cosmetics.equipped_gift) applyNameGift(nameText, cosmetics.equipped_gift);
  nameRow.append(nameText);
  if (decorState.status) {
    const statusBubble = el('button', { class: 'status-bubble', attrs: { type: 'button' } });
    statusBubble.innerHTML = glassSvg(decorState.status.emoji, 18);
    statusBubble.append(el('span', { text: decorState.status.text || decorState.status.name }));
    statusBubble.title = decorState.status.name;
    if (isSelf) {
      statusBubble.addEventListener('click', () => openStatusPicker(() => window.location.reload()));
    }
    nameRow.append(statusBubble);
  }
  nameRow.append(ruleBadges(profile));
  if (getState().online.get(profile.id)) {
    const online = el('span', { class: 'tag' });
    online.append(el('span', { class: 'online-dot' }));
    online.append(el('span', { text: 'в сети' }));
    nameRow.append(online);
  }
  info.append(nameRow);
  info.append(el('div', { class: 'field__hint', text: `@${profile.username}` }));
  if (cosmetics.badges.length) {
    const badgeRow = el('div', { class: 'profile-badges' });
    cosmetics.badges.forEach((badge) => badgeRow.append(badgeNode(badge, 'md')));
    info.append(badgeRow);
  }

  const stats = el('div', { class: 'profile-stats' });
  const statValue = {};
  const addStat = (key, label, value) => {
    const node = el('div', { class: 'stat' });
    const valueEl = el('div', { class: 'stat__value', text: formatNumber(value) });
    node.append(valueEl);
    node.append(el('div', { class: 'stat__label', text: label }));
    statValue[key] = valueEl;
    stats.append(node);
    return node;
  };
  if (isSelf) {
    addStat('posts', 'Посты', counts.posts || 0).addEventListener('click', () => switchTab('posts'));
    addStat('followers', 'Подписчики', cosmetics.follow.followers || 0);
    addStat('following', 'Подписки', cosmetics.follow.following || 0);
    addStat('matches', 'Матчи', counts.matches || 0).addEventListener('click', () => navigate('/chats'));

  } else {
    addStat('posts', 'Публикации', counts.posts || 0);
    addStat('followers', 'Подписчики', cosmetics.follow.followers || 0);
    if (profile.age) addStat('age', 'Возраст', profile.age);
    if (profile.university_chip || profile.university) {
      const uniStat = el('div', { class: 'stat' });
      const chipText = profile.university_chip || profile.university.short_name || profile.university.name;
      uniStat.append(el('div', { class: 'stat__value', text: chipText, style: { fontSize: '15px' } }));
      uniStat.append(el('div', { class: 'stat__label', text: 'Университет' }));
      stats.append(uniStat);
    }
  }
  info.append(stats);

  const actions = el('div', { class: 'profile-actions' });
  if (isSelf) {
    actions.append(
      button('Редактировать профиль', {
        variant: 'btn-secondary',
        onClick: () => navigate('/profile/edit')
      })
    );
    const shareBtn = button('Поделиться профилем', {
      variant: 'btn-outline',
      onClick: async () => {
        const link = `${window.location.origin}/u/${profile.username}`;
        try {
          await navigator.clipboard.writeText(link);
          toast('Ссылка на профиль скопирована', 'success');
        } catch (err) {
          toast(link);
        }
      }
    });
    actions.append(shareBtn);
    actions.append(button('Настройки', { variant: 'btn-ghost', onClick: () => navigate('/settings') }));
    actions.append(
      button('Купить подарок', {
        variant: 'btn-secondary',
        icon: 'gift',
        onClick: () => navigate('/shop?tab=gift')
      })
    );
    if (me.role === 'owner') {
      actions.append(
        button('Админ-панель', {
          variant: 'btn-secondary',
          icon: 'shield',
          onClick: () => navigate('/admin')
        })
      );
    }
    const addPost = iconButton('plus', { label: 'Создать пост', onClick: () => openPostCreate(() => reloadPosts()) });
    actions.append(addPost);
  } else {
    const likeBtn = button('Лайк', {
      variant: 'btn-primary',
      icon: 'heart',
      onClick: () => respond('like')
    });
    const superBtn = button('Суперлайк', { variant: 'btn-outline', onClick: () => respond('super') });
    likeBtn.querySelector('.role-icon')?.classList.add('like');
    if (profileData.my_swipe) {
      likeBtn.disabled = true;
      likeBtn.textContent = profileData.my_swipe === 'nope' ? 'Вы пропустили' : 'Вы лайкнули';
      superBtn.classList.add('hidden');
    }
    const followBtn = button(following ? 'Вы подписаны' : 'Подписаться', {
      variant: following ? 'btn-ghost' : 'btn-secondary',
      icon: 'users'
    });
    followBtn.addEventListener('click', async () => {
      followBtn.disabled = true;
      try {
        const result = following
          ? await api.delete(`/follows/${encodeURIComponent(profile.username)}`)
          : await api.post(`/follows/${encodeURIComponent(profile.username)}`);
        following = !!result.following;
        followBtn.textContent = following ? 'Вы подписаны' : 'Подписаться';
        followBtn.className = `btn ${following ? 'btn-ghost' : 'btn-secondary'}`;
        if (statValue.followers) statValue.followers.textContent = formatNumber(result.followers || 0);
      } catch (err) {
        toast(err.message || 'Не удалось изменить подписку', 'error');
      } finally {
        followBtn.disabled = false;
      }
    });
    actions.append(followBtn);
    actions.append(likeBtn, superBtn);
    if (profileData.match) {
      actions.append(
        button('Написать', {
          variant: 'btn-secondary',
          icon: 'chat',
          onClick: async () => {
            try {
              const data = await api.post('/conversations/dm', { username: profile.username });
              navigate(`/chat/${data.conversation.id}`);
            } catch (err) {
              toast(err.message || 'Не удалось открыть чат', 'error');
            }
          }
        })
      );
    }
    const menuBtn = iconButton('moreVertical', { label: 'Действия' });
    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const existing = document.querySelector('.profile-menu');
      if (existing) {
        existing.remove();
        return;
      }
      const menu = el('div', { class: 'menu profile-menu' });
      const reportItem = el('button', { class: 'menu__item', attrs: { type: 'button' } });
      reportItem.innerHTML = icon('flag', { size: 16 });
      reportItem.append(el('span', { text: 'Пожаловаться' }));
      reportItem.addEventListener('click', () => {
        menu.remove();
        openReportDialog({ user: profile });
      });
      const blockItem = el('button', { class: 'menu__item menu__item--danger', attrs: { type: 'button' } });
      blockItem.innerHTML = icon('block', { size: 16 });
      blockItem.append(el('span', { text: 'Заблокировать' }));
      blockItem.addEventListener('click', async () => {
        menu.remove();
        const done = await openBlockConfirm(profile);
        if (done) navigate('/swipe');
      });
      menu.append(reportItem, blockItem);
      const rect = menuBtn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
      document.body.append(menu);
      setTimeout(() => {
        const close = () => {
          menu.remove();
          document.removeEventListener('click', close);
        };
        document.addEventListener('click', close);
      }, 0);
    });
    actions.append(menuBtn);
  }
  info.append(actions);

  const bio = el('div', { class: 'profile-bio' });
  if (profile.bio) bio.append(el('div', { text: profile.bio }));
  const metaRow = el('div', { class: 'profile-bio__meta' });
  const metaItem = (iconName, text) => {
    const item = el('span');
    item.innerHTML = icon(iconName, { size: 13 });
    item.append(el('span', { text }));
    return item;
  };
  if (profile.job) metaRow.append(metaItem('briefcase', profile.job));
  if (profile.education) metaRow.append(metaItem('graduation', profile.education));
  if (profile.location) metaRow.append(metaItem('mapPin', profile.location));
  if (profile.university) metaRow.append(metaItem('graduation', profile.university_chip || profile.university.name));
  if (profile.height) metaRow.append(metaItem('user', `${profile.height} см`));
  metaRow.append(metaItem('heart', looksForLabel(profile.looking_for)));
  if (!isSelf) metaRow.append(metaItem('users', genderLabel(profile.gender)));
  if (profile.instagram_link) {
    const link = el('a', {
      class: 'profile-bio__link',
      text: '@instagram',
      attrs: { href: profile.instagram_link, target: '_blank', rel: 'noopener noreferrer nofollow' }
    });
    metaRow.append(link);
  }
  bio.append(metaRow);
  if (profile.interests && profile.interests.length) {
    const chips = el('div', { class: 'chips', style: { marginTop: '2px' } });
    const labels = {
      travel: '✈️ Путешествия', music: '🎧 Музыка', movies: '🎬 Кино', sport: '🏋️ Спорт',
      games: '🎮 Игры', coffee: '☕ Кофе', books: '📚 Книги', photo: '📷 Фото', it: '💻 IT',
      dance: '💃 Танцы', cooking: '🍳 Кулинария', yoga: '🧘 Йога', anime: '🌸 Аниме',
      dogs: '🐶 Собаки', cats: '🐱 Коты', fashion: '👗 Мода', cars: '🚗 Автомобили',
      art: '🎨 Искусство', business: '💼 Бизнес', football: '⚽ Футбол', nature: '🌿 Природа',
      languages: '🌍 Языки'
    };
    for (const interest of profile.interests) {
      chips.append(el('span', { class: 'chip chip--static', text: labels[interest] || interest }));
    }
    bio.append(chips);
  }
  if (!isSelf && profileData.my_swipe === null) {
    bio.append(el('div', { class: 'field__hint', text: 'Вы ещё не свайпнули этот профиль — он может появиться в вашей колоде.' }));
  }
  info.append(bio);
  header.append(info);
  const bannerHost = el('div');
  function renderBanner() {
    bannerHost.innerHTML = '';
    if (decorState.banner || decorState.custom_banner_path) {
      const wrap = el('div', { class: 'profile-banner-wrap' });
      wrap.append(bannerNode(decorState.banner, decorState.custom_banner_path));
      bannerHost.append(wrap);
    } else if (isSelf) {
      bannerHost.append(bannerPlaceholder(() => openBannerGallery(() => window.location.reload())));
    } else {
      const wrap = el('div', { class: 'profile-banner-wrap' });
      const neutral = bannerNode(null, null);
      neutral.style.opacity = '0.55';
      wrap.append(neutral);
      bannerHost.append(wrap);
    }
  }
  renderBanner();
  root.append(bannerHost);
  root.append(header);

  if (isSelf) {
    const decorBlock = el('div', { class: 'card card-pad', style: { marginBottom: '12px' } });
    const decorTitle = el('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '8px' } });
    decorTitle.append(el('strong', { text: 'Оформление профиля', style: { fontSize: '14px' } }));
    decorTitle.append(
      button('Магазин', { variant: 'btn-ghost btn-sm', onClick: () => navigate('/shop') })
    );
    decorBlock.append(decorTitle);
    decorBlock.append(
      decorPanelNode({
        decor: decorState,
        giftsCount: giftCount,
        onOpen: (kind) => {
          if (kind === 'gifts') navigate('/shop?tab=gift');
            else window.location.reload();
        }
      })
    );
    root.append(decorBlock);
  }

  const visibleGifts = profileGifts;
  const giftsSection = el('div', { class: 'profile-gifts' });
  const giftsHead = el('div', { class: 'profile-gifts__head' });
  giftsHead.innerHTML = icon('gift', { size: 18 });
  giftsHead.append(el('span', { text: `Подарки${giftCount ? ` · ${giftCount}` : ''}` }));
  const giftsHeadActions = el('div', { class: 'row' });
  if (isSelf) {
    giftsHeadActions.append(
      button('Купить подарок', { variant: 'btn-primary btn-sm', onClick: () => navigate('/shop?tab=gift') })
    );
  } else {
    giftsHeadActions.append(
      button('Подарить', {
        variant: 'btn-primary btn-sm',
        onClick: () => navigate('/shop?tab=gift')
      })
    );
  }
  if (visibleGifts.length > 6) {
    giftsHeadActions.append(
      button('Показать все', { variant: 'btn-ghost btn-sm', onClick: () => openAllGifts(visibleGifts) })
    );
  }
  giftsHead.append(giftsHeadActions);
  giftsSection.append(giftsHead);
  if (visibleGifts.length) {
    const rail = el('div', { class: 'profile-gifts__rail' });
    for (const gift of visibleGifts.slice(0, 14)) {
      const card = el('button', { class: 'gift-mini', attrs: { type: 'button', title: gift.name } });
      const art = el('div', { class: 'gift-mini__art' });
      art.innerHTML = gift.svg || '';
      card.append(art);
      card.append(el('span', { class: 'gift-mini__name', text: gift.name }));
      if (gift.is_pinned) card.append(el('span', { class: 'gift-mini__pin', text: '★' }));
      if (gift.edition_number) card.append(el('span', { class: 'gift-mini__edition', text: `№${gift.edition_number}` }));
      card.addEventListener('click', () =>
        openGiftViewer(gift.id, { onChanged: () => window.location.reload() })
      );
      rail.append(card);
    }
    giftsSection.append(rail);
  } else {
    giftsSection.append(
      el('div', {
        class: 'profile-gifts__empty',
        text: isSelf
          ? 'Пока нет подарков. Выберите подарок в магазине — он появится здесь после оплаты.'
          : 'У пользователя пока нет открытых подарков.'
      })
    );
  }
  root.append(giftsSection);

  function openAllGifts(list) {
    const grid = el('div', { class: 'shop-grid' });
    const modal = openModal({ title: `Подарки · ${giftCount}`, body: grid, size: 'wide' });
    for (const gift of list) {
      const card = el('button', { class: 'shop-card shop-card--gift', attrs: { type: 'button' } });
      const art = el('div', { class: 'shop-card__art' });
      art.innerHTML = gift.svg || '';
      card.append(art);
      const info = el('div', { class: 'shop-card__body' });
      info.append(el('div', { class: 'shop-card__title', text: gift.name }));
      info.append(el('div', { class: 'people-card__meta', text: gift.sender ? gift.sender.display_name : 'Скрытый отправитель' }));
      card.append(info);
      card.addEventListener('click', () => {
        modal.close();
        openGiftViewer(gift.id, { onChanged: () => window.location.reload() });
      });
      grid.append(card);
    }
  }

  if (isSelf) root.append(superlikesCard());

  // Shows the super like balance and leads to the purchase page.
  function superlikesCard() {
    const card = el('div', {
      class: 'card card-pad',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap'
      }
    });
    const left = el('div');
    const head = el('div', { class: 'row', style: { alignItems: 'center', gap: '6px', fontWeight: '700' } });
    head.innerHTML = icon('star', { size: 18 });
    head.append(el('span', { text: 'Суперлайки' }));
    left.append(head);
    const balance = el('div', { class: 'field__hint', text: 'Загружаем баланс…' });
    left.append(balance);
    const buy = button('', {
      variant: 'btn-primary',
      onClick: () => navigate('/superlikes')
    });
    buy.append(svgIcon('star', { size: 18 }), el('span', { text: 'Купить пакет' }));
    card.append(left, buy);
    api
      .get('/superlikes')
      .then((data) => {
        balance.textContent = `Осталось ${data.balance} · бесплатных сегодня ${data.daily} · купленных ${data.bonus}`;
        buy.innerHTML = '';
        buy.append(svgIcon('star', { size: 18 }));
        if (data.settings && data.settings.enabled) {
          buy.append(
            el('span', {
              text: `Купить ${data.settings.quantity} за ${Number(data.settings.price).toLocaleString('ru-RU')} сум`
            })
          );
        } else {
          buy.append(el('span', { text: 'Покупка недоступна' }));
          buy.disabled = true;
        }
      })
      .catch(() => {
        balance.textContent = 'Не удалось загрузить баланс';
      });
    return card;
  }

  /* ---------- Stories ring & highlights ---------- */
  const highlightsRow = el('div', { class: 'highlights' });
  root.append(highlightsRow);

  function renderAvatar() {
    avatarHolder.innerHTML = '';
    const feed = feeds.find((item) => item.user.id === profile.id);
    if (feed && feed.stories.length) {
      const ring = el('div', { class: `avatar-ring avatar-ring--story ${feed.all_viewed ? 'avatar-ring--seen' : ''}` });
      const inner = avatarNode(profile, 'xxl');
      ring.append(inner);
      ring.addEventListener('click', () => {
        const index = feeds.indexOf(feed);
        openStoryViewer(feeds, index, 0, { onClose: () => loadStories() });
      });
      avatarHolder.append(ring);
    } else {
      avatarHolder.append(avatarNode(profile, 'xxl'));
    }
    if (isSelf) {
      const corner = el('button', {
        class: decorState.status ? 'status-add status-add--emoji' : 'status-add',
        attrs: { type: 'button', 'aria-label': 'Эмодзи-статус', title: 'Эмодзи-статус' }
      });
      if (decorState.status) corner.innerHTML = glassSvg(decorState.status.emoji, 18);
      else corner.innerHTML = icon('plus', { size: 15 });
      corner.addEventListener('click', () => openStatusPicker(() => window.location.reload()));
      avatarHolder.append(corner);
    }
  }

  function renderHighlights() {
    highlightsRow.innerHTML = '';
    if (isSelf) {
      const add = el('div', { class: 'highlight highlight--add' });
      const ring = el('div', { class: 'highlight__ring' });
      const inner = el('div', { class: 'highlight__avatar' });
      inner.innerHTML = icon('plus', { size: 22 });
      ring.append(inner);
      add.append(ring, el('div', { class: 'highlight__title', text: 'Новая' }));
      add.addEventListener('click', () => openHighlightCreate());
      highlightsRow.append(add);
    }
    for (const highlight of highlights) {
      const node = el('div', { class: 'highlight' });
      const ring = el('div', { class: 'highlight__ring' });
      const inner = el('div', { class: 'highlight__avatar' });
      if (highlight.cover_path) {
        let src = highlight.cover_path;
        const img = el('img', { attrs: { src, alt: highlight.title, loading: 'lazy' } });
        img.addEventListener('error', () => img.remove());
        inner.append(img);
      } else {
        inner.textContent = initials(highlight.title);
      }
      ring.append(inner);
      node.append(ring, el('div', { class: 'highlight__title', text: highlight.title }));
      node.addEventListener('click', () => {
        if (!highlight.items || !highlight.items.length) {
          toast('Истории этой подборки уже истекли');
          return;
        }
        const pseudoFeed = [
          {
            user: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_path: profile.avatar_path },
            stories: highlight.items.map((item) => ({
              id: item.id,
              media_path: item.media_path,
              caption: item.caption,
              created_at: item.created_at,
              viewed: true,
              is_mine: isSelf
            })),
            all_viewed: true
          }
        ];
        openStoryViewer(pseudoFeed, 0, 0, {});
      });
      if (isSelf) {
        node.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          const ok = await confirmDialog({
            title: 'Удалить подборку?',
            message: `Подборка «${highlight.title}» будет удалена.`,
            confirmText: 'Удалить',
            danger: true
          });
          if (!ok) return;
          try {
            await api.delete(`/highlights/${highlight.id}`);
            highlights = highlights.filter((item) => item.id !== highlight.id);
            renderHighlights();
          } catch (err) {
            toast(err.message || 'Не удалось удалить подборку', 'error');
          }
        });
        node.title = 'Правая кнопка мыши — удалить подборку';
      }
      highlightsRow.append(node);
    }
  }

  async function openHighlightCreate() {
    let ownStories = [];
    try {
      const data = await api.get('/stories/mine');
      ownStories = data.stories || [];
    } catch (err) {
      toast('Не удалось загрузить истории', 'error');
    }
    if (!ownStories.length) {
      toast('Сначала добавьте историю', 'error');
      return;
    }
    const body = el('div', { class: 'col' });
    const titleField = el('label', { class: 'field' });
    titleField.append(el('span', { class: 'field__label', text: 'Название подборки' }));
    const titleInput = el('input', { class: 'input', attrs: { maxlength: '30', placeholder: 'Например: Лето' } });
    titleField.append(titleInput);
    body.append(titleField);
    const selected = new Set(ownStories.map((story) => story.id));
    const grid = el('div', { class: 'photo-grid' });
    for (const story of ownStories) {
      const tile = el('div', { class: 'photo-tile' });
      tile.append(el('img', { attrs: { src: story.media_path, alt: 'История' } }));
      tile.style.border = '2px solid var(--brand-1)';
      tile.addEventListener('click', () => {
        if (selected.has(story.id)) selected.delete(story.id);
        else selected.add(story.id);
        tile.style.border = selected.has(story.id) ? '2px solid var(--brand-1)' : '1px solid var(--border)';
        tile.style.opacity = selected.has(story.id) ? '1' : '0.5';
      });
      grid.append(tile);
    }
    body.append(el('div', { class: 'field__hint', text: 'Выберите истории для подборки' }), grid);
    const footer = el('div', { class: 'row' });
    const modal = openModal({ title: 'Новая подборка', body, footer });
    footer.append(
      button('Отмена', { variant: 'btn-secondary', onClick: () => modal.close() }),
      button('Создать', {
        variant: 'btn-primary',
        onClick: async () => {
          try {
            const data = await api.post('/highlights', {
              title: titleInput.value.trim(),
              story_ids: [...selected]
            });
            highlights.push({ ...data.highlight, items: data.highlight.items || [] });
            renderHighlights();
            modal.close();
            toast('Подборка создана', 'success');
          } catch (err) {
            toast(err.message || 'Не удалось создать подборку', 'error');
          }
        }
      })
    );
  }

  /* ---------- Tabs ---------- */
  const tabs = el('div', { class: 'profile-tabs' });
  const tabButtons = {};
  const tabDefs = [
    { id: 'posts', label: 'Посты', icon: 'grid' },
    { id: 'photos', label: 'Фото профиля', icon: 'image' }
  ];
  if (isSelf) tabDefs.push({ id: 'stats', label: 'Статистика', icon: 'chart' });

  const content = el('div');
  for (const def of tabDefs) {
    const btn = el('button', { class: 'profile-tab', attrs: { type: 'button' } });
    btn.innerHTML = icon(def.icon, { size: 16 });
    btn.append(el('span', { text: def.label }));
    btn.addEventListener('click', () => switchTab(def.id));
    tabButtons[def.id] = btn;
    tabs.append(btn);
  }
  // Advertising slot between the profile header and the tabs.
  const adHost = el('div', { class: 'ad-slot-host ad-slot-host--profile' });
  const adBanner = mountAdBanner(adHost, 'profile');
  root.append(adHost, tabs, content);

  function switchTab(tabId) {
    activeTab = tabId;
    Object.entries(tabButtons).forEach(([id, btn]) => btn.classList.toggle('is-active', id === tabId));
    content.innerHTML = '';
    if (tabId === 'posts') renderPosts();
    if (tabId === 'photos') renderPhotos();
    if (tabId === 'stats') renderStats();
  }

  /* ---------- Posts ---------- */
  function postTile(post) {
    const tile = el('div', { class: 'post-tile' });
    const img =
      post.kind === 'video'
        ? el('video', { attrs: { src: post.image_path, muted: 'muted', playsinline: 'playsinline', preload: 'metadata' } })
        : el('img', { attrs: { src: post.image_path, alt: post.caption || 'Пост', loading: 'lazy' } });
    tile.append(img);
    const views = el('span', { class: 'post-tile__views' });
    views.innerHTML = icon('eye', { size: 11 });
    views.append(el('span', { text: formatNumber(post.views_count) }));
    tile.append(views);
    const overlay = el('div', { class: 'post-tile__overlay' });
    const likes = el('span');
    likes.innerHTML = icon('heart', { size: 18, fill: true });
    likes.append(el('span', { text: formatNumber(post.likes) }));
    const comments = el('span');
    comments.innerHTML = icon('comment', { size: 18, fill: true });
    comments.append(el('span', { text: formatNumber(post.comments) }));
    overlay.append(likes, comments);
    tile.append(overlay);
    tile.addEventListener('click', () => {
      openPostModal(post, {
        onDeleted: (deleted) => {
          posts = posts.filter((item) => item.id !== deleted.id);
          renderPosts();
        }
      });
    });
    return tile;
  }

  function renderPosts() {
    content.innerHTML = '';
    if (!posts.length) {
      const empty = el('div', { class: 'profile-grid-empty' });
      empty.append(el('div', { class: 'empty__emoji', text: '📷' }));
      empty.append(el('div', { class: 'empty__title', text: isSelf ? 'Пока нет постов' : 'Постов пока нет' }));
      empty.append(
        el('div', {
          class: 'empty__text',
          text: isSelf ? 'Поделитесь моментом — пост появится в вашей сетке и в ленте «Обзор».' : 'Загляните позже.'
        })
      );
      if (isSelf) {
        empty.append(button('Создать пост', { variant: 'btn-primary', onClick: () => openPostCreate(() => reloadPosts()) }));
      }
      content.append(empty);
      return;
    }
    const grid = el('div', { class: 'posts-grid' });
    for (const post of posts) grid.append(postTile(post));
    content.append(grid);
    if (hasMorePosts) {
      content.append(
        el('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } }, [
          button('Показать ещё', { variant: 'btn-secondary', onClick: loadMorePosts })
        ])
      );
    }
  }

  async function loadMorePosts() {
    try {
      const data = await api.get(`/feed?username=${encodeURIComponent(profile.username)}&limit=18&offset=${posts.length}`);
      posts = posts.concat(data.posts || []);
      hasMorePosts = !!data.has_more;
      renderPosts();
    } catch (err) {
      toast(err.message || 'Не удалось загрузить посты', 'error');
    }
  }

  async function reloadPosts() {
    try {
      const data = await api.get(`/feed?username=${encodeURIComponent(profile.username)}&limit=18`);
      posts = data.posts || [];
      hasMorePosts = !!data.has_more;
      if (activeTab === 'posts') renderPosts();
      statValue.posts.textContent = formatNumber(posts.length);
    } catch (err) {
      toast(err.message || 'Не удалось загрузить посты', 'error');
    }
  }

  /* ---------- Profile photos ---------- */
  function renderPhotos() {
    content.innerHTML = '';
    const grid = el('div', { class: 'profile-photos-grid' });
    (profile.photos || []).forEach((photo) => {
      const tile = el('div', { class: 'profile-photo' });
      tile.append(el('img', { attrs: { src: photo.path, alt: 'Фото профиля', loading: 'lazy' } }));
      if (photo.path === profile.avatar_path) {
        tile.append(el('span', { class: 'profile-photo__badge', text: 'Главное' }));
      }
      if (isSelf) {
        const del = el('button', { class: 'profile-photo__del', attrs: { type: 'button', 'aria-label': 'Удалить фото' } });
        del.innerHTML = icon('trash', { size: 14 });
        del.addEventListener('click', async (event) => {
          event.stopPropagation();
          const ok = await confirmDialog({
            title: 'Удалить фото?',
            message: 'Фото исчезнет из профиля.',
            confirmText: 'Удалить',
            danger: true
          });
          if (!ok) return;
          try {
            const data = await api.delete(`/users/me/photos/${photo.id}`);
            profile.photos = data.user.photos;
            profile.avatar_path = data.user.avatar_path;
            patchUser({ photos: data.user.photos, avatar_path: data.user.avatar_path });
            renderAvatar();
            renderPhotos();
          } catch (err) {
            toast(err.message || 'Не удалось удалить фото', 'error');
          }
        });
        tile.append(del);
        if (photo.path !== profile.avatar_path) {
          const makeMain = el('button', {
            class: 'profile-photo__badge',
            attrs: { type: 'button' },
            style: { border: 'none', cursor: 'pointer' }
          });
          makeMain.textContent = 'Сделать главным';
          makeMain.addEventListener('click', async (event) => {
            event.stopPropagation();
            try {
              const data = await api.put('/users/me/avatar', { photo_id: photo.id });
              profile.photos = data.user.photos;
              profile.avatar_path = data.user.avatar_path;
              patchUser({ photos: data.user.photos, avatar_path: data.user.avatar_path });
              renderAvatar();
              renderPhotos();
              toast('Главное фото обновлено', 'success');
            } catch (err) {
              toast(err.message || 'Не удалось обновить фото', 'error');
            }
          });
          tile.append(makeMain);
        }
      }
      grid.append(tile);
    });

    if (isSelf && (profile.photos || []).length < 9) {
      const addTile = el('div', { class: 'profile-photo' });
      addTile.style.display = 'grid';
      addTile.style.placeItems = 'center';
      addTile.style.cursor = 'pointer';
      addTile.style.border = '2px dashed var(--border-strong)';
      addTile.innerHTML = icon('plus', { size: 26 });
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
          const form = toFormData({}, compressed.blob, 'photo.jpg');
          const data = await api.upload('/users/me/photos', form);
          profile.photos = data.user.photos;
          patchUser({ photos: data.user.photos });
          renderPhotos();
          toast('Фото добавлено', 'success');
        } catch (err) {
          toast(err.message || 'Не удалось загрузить фото', 'error');
        }
      });
      addTile.addEventListener('click', () => input.click());
      addTile.append(input);
      grid.append(addTile);
    }

    if (!grid.children.length) {
      content.append(
        emptyState('🖼️', 'Нет фото профиля', 'Добавьте фото — профиль показывается в свайпах.', null)
      );
    } else {
      content.append(grid);
    }
  }

  /* ---------- Statistics ---------- */
  async function renderStats(range = 7) {
    content.innerHTML = '';
    content.append(loadingRow('Считаем статистику…'));

    let stats;
    let viewers = [];
    let likers = [];
    let storyViewers = [];
    try {
      const [statsData, viewersData, likersData, mineStories] = await Promise.all([
        api.get(`/users/me/stats?range=${range}`),
        api.get('/users/me/viewers'),
        api.get('/users/me/post-likers'),
        api.get('/stories/mine').catch(() => ({ stories: [] }))
      ]);
      stats = statsData;
      viewers = viewersData.viewers || [];
      likers = likersData.users || [];
      if (mineStories.stories && mineStories.stories.length) {
        const latest = mineStories.stories[0];
        const storyViews = await api.get(`/stories/${latest.id}/viewers`).catch(() => ({ viewers: [] }));
        storyViewers = storyViewers.concat(storyViewers, storyViews.viewers || []);
      }
    } catch (err) {
      content.innerHTML = '';
      content.append(emptyState('😕', 'Статистика недоступна', err.message || ''));
      return;
    }
    statsRendered = true;
    content.innerHTML = '';
    const statsSection = el('div', { class: 'stats-section' });
    content.append(statsSection);

    const rangeRow = el('div', { class: 'section__head' });
    rangeRow.append(el('div', { class: 'section__title', text: 'Ваша статистика' }));
    const segmented = el('div', { class: 'segmented' });
    [7, 30].forEach((days) => {
      const item = el('button', {
        class: `segmented__item ${range === days ? 'is-active' : ''}`,
        text: `${days} дней`,
        attrs: { type: 'button' }
      });
      item.addEventListener('click', () => renderStats(days));
      segmented.append(item);
    });
    rangeRow.append(segmented);
    statsSection.append(rangeRow);

    const kpis = el('div', { class: 'stats-kpis' });
    const kpi = (label, value, accent) => {
      const node = el('div', { class: `kpi ${accent ? 'kpi--accent' : ''}` });
      node.append(el('div', { class: 'kpi__value', text: value }));
      node.append(el('div', { class: 'kpi__label', text: label }));
      return node;
    };
    kpis.append(
      kpi('Просмотры профиля', formatNumber(stats.totals.profile_views), true),
      kpi('Лайки профиля', formatNumber(stats.totals.likes_received)),
      kpi('Суперлайки', formatNumber(stats.totals.super_likes_received)),
      kpi('Матчи', formatNumber(stats.totals.matches))
    );
    kpis.append(
      kpi('Взаимность', `${stats.reciprocity}%`),
      kpi('Лайки постов', formatNumber(stats.totals.posts_likes)),
      kpi('Просмотры постов', formatNumber(stats.totals.posts_views)),
      kpi('Просмотры историй', formatNumber(stats.totals.story_views))
    );
    statsSection.append(kpis);

    const giftCard = el('div', { class: 'chart-card gift-summary' });
    giftCard.append(el('div', { class: 'section__title', text: 'Подарки' }));
    giftCard.append(
      el('div', {
        class: 'gift-summary__total',
        text: `Всего получено: ${formatNumber(giftStats.total || 0)}`
      })
    );
    if ((giftStats.top_givers || []).length) {
      giftCard.append(el('div', { class: 'gift-summary__label', text: 'Топ дарителей' }));
      const donors = el('div', { class: 'gift-summary__list' });
      for (const entry of giftStats.top_givers) {
        if (!entry.user) continue;
        const row = el('div', { class: 'gift-summary__row' });
        row.append(avatarNode(entry.user, { size: 'xs' }));
        row.append(
          el('span', {
            class: 'gift-summary__name',
            text: entry.user.display_name || `@${entry.user.username}`
          })
        );
        row.append(el('span', { class: 'gift-summary__count', text: `${entry.count} ✦` }));
        donors.append(row);
      }
      giftCard.append(donors);
    }
    statsSection.append(giftCard);

    const viewChart = el('div', { class: 'chart-card' });
    const viewHead = el('div', { class: 'chart-card__head' });
    viewHead.append(el('div', { class: 'chart-card__title', text: 'Просмотры профиля' }));
    viewHead.append(el('div', { class: 'chart-card__value', text: `Всего ${formatNumber(stats.totals.profile_views)}` }));
    viewChart.append(viewHead);
    viewChart.append(lineChartNode(stats.series.profile_views));
    statsSection.append(viewChart);

    const likesChart = el('div', { class: 'chart-card' });
    const likesHead = el('div', { class: 'chart-card__head' });
    likesHead.append(el('div', { class: 'chart-card__title', text: 'Лайки и матчи по дням' }));
    const legend = el('div', { class: 'row' });
    legend.append(legendDot('#FD267A', 'Лайки'), legendDot('#1BA8FF', 'Матчи'));
    likesHead.append(legend);
    likesChart.append(likesHead);
    likesChart.append(barChartNode(stats.series.likes));
    statsSection.append(likesChart);

    const topPosts = el('div', { class: 'chart-card' });
    topPosts.append(el('div', { class: 'chart-card__title', text: 'Топ постов по лайкам' }));
    const topList = el('div', { class: 'top-posts' });
    if (!stats.top_posts.length) {
      topList.append(el('div', { class: 'field__hint', text: 'Пока нет постов' }));
    }
    for (const post of stats.top_posts) {
      const row = el('div', { class: 'top-post' });
      const imgWrap = el('div', { class: 'top-post__img' });
      imgWrap.append(
        post.kind === 'video'
          ? el('video', { attrs: { src: post.image_path, muted: 'muted', playsinline: 'playsinline', preload: 'metadata' } })
          : el('img', { attrs: { src: post.image_path, alt: '', loading: 'lazy' } })
      );
      row.append(imgWrap);
      const body = el('div', { class: 'list-row__body' });
      body.append(el('div', { class: 'top-post__caption', text: post.caption || 'Без подписи' }));
      const meta = el('div', { class: 'top-post__meta' });
      meta.append(el('span', { text: `${formatNumber(post.likes)} лайков` }));
      meta.append(el('span', { text: `${formatNumber(post.views_count)} просмотров` }));
      meta.append(el('span', { text: `${formatNumber(post.comments)} комментариев` }));
      body.append(meta);
      row.append(body);
      row.addEventListener('click', () => {
        openPostModal({
          ...post,
          user_id: profile.id,
          author: {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_path: profile.avatar_path,
            is_verified: profile.is_verified,
            role: profile.role
          },
          liked: false
        }, { onDeleted: () => reloadPosts() });
      });
      topList.append(row);
    }
    topPosts.append(topList);
    statsSection.append(topPosts);

    const viewersCard = el('div', { class: 'chart-card', attrs: { id: 'stats-viewers' } });
    viewersCard.append(el('div', { class: 'chart-card__title', text: 'Кто смотрел мой профиль' }));
    if (!viewers.length) {
      viewersCard.append(el('div', { class: 'field__hint', text: 'Пока никто не смотрел — заполните профиль и фото.' }));
    }
    for (const item of viewers) {
      const row = el('div', { class: 'list-row' });
      row.append(avatarNode(item.user, 'sm'));
      const body = el('div', { class: 'list-row__body' });
      const title = el('div', { class: 'list-row__title' });
      title.append(el('span', { text: item.user.display_name }));
      if (item.user.is_verified) {
        const badge = el('span', { class: 'verified' });
        badge.innerHTML = icon('verified', { size: 13, fill: true });
        title.append(badge);
      }
      body.append(title);
      body.append(el('div', { class: 'list-row__meta', text: timeAgo(item.viewed_at) }));
      row.append(body);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => navigate(`/u/${item.user.username}`));
      viewersCard.append(row);
    }
    statsSection.append(viewersCard);

    const likersCard = el('div', { class: 'chart-card' });
    likersCard.append(el('div', { class: 'chart-card__title', text: 'Кто лайкнул мои посты' }));
    if (!likers.length) {
      likersCard.append(el('div', { class: 'field__hint', text: 'Лайков постов пока нет.' }));
    }
    for (const item of likers) {
      const row = el('div', { class: 'list-row' });
      row.append(avatarNode(item.user, 'sm'));
      const body = el('div', { class: 'list-row__body' });
      body.append(el('div', { class: 'list-row__title', text: item.user.display_name }));
      body.append(
        el('div', {
          class: 'list-row__meta',
          text: `${item.likes_count} ${plural(item.likes_count, 'лайк', 'лайка', 'лайков')} · ${timeAgo(item.liked_at)}`
        })
      );
      row.append(body);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => navigate(`/u/${item.user.username}`));
      likersCard.append(row);
    }
    statsSection.append(likersCard);

    const storyCard = el('div', { class: 'chart-card' });
    storyCard.append(el('div', { class: 'chart-card__title', text: 'Кто смотрел мои истории' }));
    if (!storyViewers.length) {
      storyCard.append(el('div', { class: 'field__hint', text: 'Нет просмотров последней истории или историй пока нет.' }));
    }
    for (const item of storyViewers) {
      const row = el('div', { class: 'list-row' });
      row.append(avatarNode(item.user, 'sm'));
      const body = el('div', { class: 'list-row__body' });
      body.append(el('div', { class: 'list-row__title', text: item.user.display_name }));
      body.append(el('div', { class: 'list-row__meta', text: timeAgo(item.viewed_at) }));
      row.append(body);
      storyCard.append(row);
    }
    statsSection.append(storyCard);
  }

  /* ---------- Actions on another profile ---------- */
  async function respond(action) {
    try {
      const result = await api.post('/swipes', { to_id: profile.id, action });
      profileData.my_swipe = action;
      actions.querySelectorAll('.btn-primary').forEach((btn) => {
        if (btn.textContent.includes('Лайк')) {
          btn.disabled = true;
          btn.textContent = 'Вы лайкнули';
        }
      });
      if (result.is_match && result.match) {
        showMatchScreen(result.match, { me: getState().user });
      } else {
        toast(action === 'super' ? 'Суперлайк отправлен ⭐' : 'Лайк отправлен');
      }
      const meCounts = await api.get('/auth/me').catch(() => null);
      if (meCounts) setCounts(meCounts.counts || {});
    } catch (err) {
      toast(err.message || 'Не удалось отправить реакцию', 'error');
    }
  }

  /* ---------- Boot ---------- */
  async function loadStories() {
    try {
      const data = await api.get('/stories');
      feeds = data.feeds || [];
      renderAvatar();
    } catch (err) {
      renderAvatar();
    }
  }

  renderAvatar();
  renderHighlights();
  switchTab('posts');

  const [feedData, storiesData, highlightsData] = await Promise.all([
    api
      .get(`/feed?username=${encodeURIComponent(profile.username)}&limit=18`)
      .catch(() => ({ posts: [], has_more: false })),
    api.get('/stories').catch(() => ({ feeds: [] })),
    api.get(`/highlights?username=${encodeURIComponent(profile.username)}`).catch(() => ({ highlights: [] }))
  ]);
  posts = feedData.posts || [];
  hasMorePosts = !!feedData.has_more;
  feeds = storiesData.feeds || [];
  highlights = highlightsData.highlights || [];

  renderAvatar();
  renderHighlights();
  if (activeTab === 'posts') renderPosts();

  if (postsTotal() !== (counts.posts || 0)) {
    counts.posts = postsTotal();
    if (statValue.posts) statValue.posts.textContent = formatNumber(counts.posts);
  }

  function postsTotal() {
    return posts.length + (hasMorePosts ? 1 : 0) <= (counts.posts || 0) ? counts.posts || 0 : posts.length;
  }

  return {
    el: root,
    title: profile.display_name,
    cleanup() {
      adBanner.destroy();
    }
  };
}
