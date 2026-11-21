'use strict';

// Selecting a post together with author info and counters. First parameter is the viewer id.
const POST_FIELDS = `p.*,
  u.username AS author_username,
  u.display_name AS author_name,
  u.avatar_path AS author_avatar,
  u.is_verified AS author_verified,
  u.role AS author_role,
  u.is_demo AS author_demo,
  (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments_count,
  (SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = ?) AS liked_by_me`;

function mapPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    image_path: row.image_path,
    kind: row.post_kind === 'video' ? 'video' : 'image',
    caption: row.caption || '',
    location: row.location || '',
    created_at: row.created_at,
    views_count: row.views_count || 0,
    likes: row.likes_count || 0,
    comments: row.comments_count || 0,
    liked: !!row.liked_by_me,
    author: {
      id: row.user_id,
      username: row.author_username,
      display_name: row.author_name,
      avatar_path: row.author_avatar,
      is_verified: !!row.author_verified,
      role: row.author_role,
      is_demo: !!row.author_demo
    }
  };
}

const COMMENT_FIELDS = `c.*,
  u.username AS commenter_username,
  u.display_name AS commenter_name,
  u.avatar_path AS commenter_avatar,
  (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes_count,
  (SELECT 1 FROM comment_likes cl2 WHERE cl2.comment_id = c.id AND cl2.user_id = ?) AS liked_by_me`;

function mapComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    post_id: row.post_id,
    parent_id: row.parent_id,
    body: row.body,
    created_at: row.created_at,
    likes: row.likes_count || 0,
    liked: !!row.liked_by_me,
    author: {
      id: row.user_id,
      username: row.commenter_username,
      display_name: row.commenter_name,
      avatar_path: row.commenter_avatar
    }
  };
}

module.exports = { POST_FIELDS, mapPost, COMMENT_FIELDS, mapComment };
