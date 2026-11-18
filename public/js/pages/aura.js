import { api } from '../api.js?v=21';
import { el, avatarNode, loadingRow, formatNumber } from '../ui.js?v=21';
import { icon } from '../icons.js?v=21';
import { getState } from '../state.js?v=21';
import { badgeNode } from '../components/cosmetics.js?v=21';

export default async function AuraPage() {
  const root = el('div', { class: 'aura-page' });
  const hero = el('div', { class: 'aura-hero' });
  hero.append(el('h1', { text: 'Aura Table' }));
  hero.append(
    el('p', {
      text: 'Таблица популярности Wiutgram: чем больше подписчиков, тем выше аура. Подписывайтесь на тех, кто вам интересен.'
    })
  );
  const rankHolder = el('div');
  hero.append(rankHolder);
  root.append(hero);

  const body = el('div');
  root.append(body);
  body.append(loadingRow());

  let data;
  try {
    data = await api.get('/aura?limit=100');
  } catch (err) {
    body.innerHTML = '';
    body.append(el('p', { class: 'field__hint', text: err.message || 'Не удалось загрузить таблицу' }));
    return root;
  }
  body.innerHTML = '';

  if (data.me) {
    const mine = el('div', { class: 'aura-my-rank' });
    mine.append(el('span', { text: `Ваше место: #${data.me.rank}` }));
    mine.append(el('span', { text: `${formatNumber(data.me.followers)} подписчиков` }));
    if (data.me.rank > 100) {
      mine.append(el('span', { class: 'field__hint', text: 'Поднимайтесь выше — подписки решают' }));
    }
    rankHolder.append(mine);
  }

  const leaders = data.leaders || [];
  if (!leaders.length) {
    body.innerHTML = '';
    body.append(el('p', { class: 'field__hint', text: 'Пока никто не подписался — станьте первым в Aura Table.' }));
    return root;
  }

  const podium = el('div', { class: 'aura-podium' });
  const top = leaders.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  for (const leader of leaders.length >= 3 ? order : []) {
    if (!leader) continue;
    const item = el('a', {
      class: `aura-podium__item ${leader.rank === 1 ? 'is-first' : ''}`,
      attrs: { href: `/u/${leader.username}`, 'data-link': '' }
    });
    item.append(avatarNode({ ...leader, avatar_path: leader.avatar_path }, 'lg'));
    item.append(el('div', { class: 'aura-podium__place', text: `#${leader.rank}` }));
    item.append(el('div', { style: { fontWeight: '800' }, text: leader.display_name }));
    item.append(el('div', { class: 'field__hint', text: `@${leader.username}` }));
    if (leader.badges && leader.badges.length) {
      const badges = el('div', { class: 'aura-badges' });
      leader.badges.slice(0, 5).forEach((badge) => badges.append(badgeNode(badge, 'sm')));
      item.append(badges);
    }
    item.append(el('div', { class: 'aura-row__followers', text: `${formatNumber(leader.followers)} подписчиков` }));
    podium.append(item);
  }
  if (leaders.length >= 3) body.append(podium);

  const list = el('div', { class: 'aura-list' });
  for (const leader of leaders) {
    const row = el('a', {
      class: `aura-row ${getState().user && getState().user.id === leader.id ? 'is-me' : ''}`,
      attrs: { href: `/u/${leader.username}`, 'data-link': '' }
    });
    row.append(el('div', { class: 'aura-row__rank', text: `#${leader.rank}` }));
    row.append(avatarNode(leader, 'sm'));
    const name = el('div', { class: 'aura-row__name' });
    const nameLine = el('strong');
    nameLine.append(el('span', { text: leader.display_name }));
    if (leader.role === 'owner') {
      const crown = el('span', { class: 'role-icon role-icon--owner', style: { marginLeft: '5px' } });
      crown.innerHTML = icon('crown', { size: 13, fill: true });
      nameLine.append(crown);
    }
    name.append(nameLine);
    name.append(el('span', { text: `@${leader.username}` }));
    row.append(name);
    if (leader.badges && leader.badges.length) {
      const badges = el('div', { class: 'aura-badges' });
      leader.badges.slice(0, 6).forEach((badge) => badges.append(badgeNode(badge, 'sm')));
      row.append(badges);
    }
    const followers = el('div', { class: 'aura-row__followers' });
    followers.append(el('span', { text: String(formatNumber(leader.followers)) }));
    followers.append(el('span', { text: ' подписчиков' }));
    row.append(followers);
    list.append(row);
  }
  body.append(list);

  if (data.total > leaders.length) {
    body.append(
      el('p', {
        class: 'field__hint',
        text: `Показаны первые ${leaders.length} из ${data.total} участников.`
      })
    );
  }
  return root;
}
