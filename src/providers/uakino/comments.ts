import * as cheerio from 'cheerio';
import { http2Request } from '../../utils/http2.js';
import { findByImdbId, searchTitles } from './db.js';
import { searchUakinoWeb } from './web.js';
import type { UakinoComment, UakinoCommentAuthor } from './types.js';

export { UakinoComment, UakinoCommentAuthor };

const BASE_URL = 'https://uakino.best';

// In-memory cache for resolved news IDs to accelerate repeated requests and pagination
const newsIdCache = new Map<string, string>();

/**
 * Parses raw DLE HTML comments tree returned by UaKino comments controller.
 */
export function parseUakinoComments(htmlContent: string): UakinoComment[] {
  if (!htmlContent || typeof htmlContent !== 'string') return [];

  const $ = cheerio.load(htmlContent);

  const parseList = ($container: cheerio.Cheerio<any>): UakinoComment[] => {
    const items: UakinoComment[] = [];

    $container.children('li.comments-tree-item').each((_, el) => {
      const $el = $(el);

      // Comment ID
      const fullId = $el.attr('id') || '';
      const commentId = fullId.replace('comments-tree-item-', '');

      // Author & Meta
      const $top = $el.find('.comm-top').first();
      const authorEl = $top.find('.comm-author a');
      const authorName = authorEl.length
        ? authorEl.text().trim()
        : $top.find('.comm-author').text().trim();
      const group = $top.find('.comm-group').text().trim() || undefined;

      let avatar = $top.find('.comm-av img').attr('src');
      if (avatar) {
        if (avatar.startsWith('//')) {
          avatar = 'https:' + avatar;
        } else if (avatar.startsWith('/')) {
          avatar = `${BASE_URL}${avatar}`;
        }
      }

      const ratingText = $top.find('.comm-rate span').text().trim();
      const parsedRating = parseInt(ratingText, 10);
      const rating = isNaN(parsedRating) ? 0 : parsedRating;

      // Text body
      const $body = $el.find('.comm-body').first();
      const $textContainer = $body.find('.comm-text');

      // Unwrap nested div with id^='comm-id-'
      const $innerDiv = $textContainer.find("div[id^='comm-id-']");
      if ($innerDiv.length > 0) {
        $innerDiv.replaceWith($innerDiv.contents());
      }

      // Replace <br> with newlines
      $textContainer.find('br').replaceWith('\n');

      const textContent = $textContainer.text()?.trim() || '';

      // Date
      const $dateContainer = $el.find('.comm-bottom .comm-date').first();
      const dateStr = $dateContainer.clone().children().remove().end().text().trim();

      // Nested replies recursion
      const $childrenList = $el.children('ol.comments-tree-list');
      const replies = $childrenList.length > 0 ? parseList($childrenList) : [];

      if (commentId || textContent || authorName) {
        items.push({
          id: commentId || String(items.length + 1),
          author: {
            name: authorName || 'Гість',
            avatar: avatar || undefined,
            group: group,
          },
          text: textContent,
          date: dateStr,
          rating,
          replies,
        });
      }
    });

    return items;
  };

  const $rootList = $('ol.comments-tree-list').first();
  if ($rootList.length > 0) {
    return parseList($rootList);
  }

  const $directItems = $('li.comments-tree-item');
  if ($directItems.length > 0) {
    const $parent = $directItems.parent();
    return parseList($parent);
  }

  return [];
}

/**
 * Resolves Uakino news_id using newsId, imdbId, title, originalTitle, or web fallback.
 */
export async function resolveUakinoNewsId(params: {
  newsId?: string;
  imdbId?: string;
  title?: string;
  originalTitle?: string;
  year?: number;
}): Promise<string | null> {
  const { newsId, imdbId, title, originalTitle, year } = params;

  if (newsId && /^\d+$/.test(newsId.trim())) {
    return newsId.trim();
  }

  const cleanImdb = imdbId?.trim();
  if (cleanImdb) {
    const cached = newsIdCache.get(`imdb:${cleanImdb}`);
    if (cached) return cached;

    try {
      const rows = await findByImdbId(cleanImdb);
      if (rows && rows.length > 0 && rows[0].id) {
        const idStr = String(rows[0].id);
        newsIdCache.set(`imdb:${cleanImdb}`, idStr);
        return idStr;
      }
    } catch {
      // ignore db error, proceed to title search
    }
  }

  const cleanTitle = title?.trim();
  const cleanOrig = originalTitle?.trim();

  const titleKey = `title:${cleanTitle || ''}:${cleanOrig || ''}:${year || ''}`;
  const cachedTitle = newsIdCache.get(titleKey);
  if (cachedTitle) return cachedTitle;

  // Search local DB by Ukrainian title
  if (cleanTitle) {
    try {
      const rows = await searchTitles(cleanTitle, year);
      if (rows && rows.length > 0 && rows[0].id) {
        const idStr = String(rows[0].id);
        newsIdCache.set(titleKey, idStr);
        if (cleanImdb) newsIdCache.set(`imdb:${cleanImdb}`, idStr);
        return idStr;
      }
    } catch {
      // ignore
    }
  }

  // Search local DB by original title
  if (cleanOrig && cleanOrig !== cleanTitle) {
    try {
      const rows = await searchTitles(cleanOrig, year);
      if (rows && rows.length > 0 && rows[0].id) {
        const idStr = String(rows[0].id);
        newsIdCache.set(titleKey, idStr);
        if (cleanImdb) newsIdCache.set(`imdb:${cleanImdb}`, idStr);
        return idStr;
      }
    } catch {
      // ignore
    }
  }

  // Fallback to web search
  if (cleanTitle) {
    try {
      const webRes = await searchUakinoWeb(cleanTitle, { year });
      if (webRes && webRes.length > 0 && webRes[0].id) {
        const idStr = String(webRes[0].id);
        newsIdCache.set(titleKey, idStr);
        if (cleanImdb) newsIdCache.set(`imdb:${cleanImdb}`, idStr);
        return idStr;
      }
    } catch {
      // ignore
    }
  }

  if (cleanOrig && cleanOrig !== cleanTitle) {
    try {
      const webRes = await searchUakinoWeb(cleanOrig, { year });
      if (webRes && webRes.length > 0 && webRes[0].id) {
        const idStr = String(webRes[0].id);
        newsIdCache.set(titleKey, idStr);
        if (cleanImdb) newsIdCache.set(`imdb:${cleanImdb}`, idStr);
        return idStr;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Fetches comments for given newsId from UaKino DLE controller.
 */
export async function fetchUakinoComments(
  newsId: string,
  page = 1
): Promise<{ comments: UakinoComment[]; hasMore: boolean; navigation?: string }> {
  const cstart = Math.max(1, page);
  const url = `${BASE_URL}/engine/ajax/controller.php?mod=comments&cstart=${cstart}&news_id=${encodeURIComponent(
    newsId
  )}&skin=uakino&massact=disable`;

  try {
    const res = await http2Request<string | { navigation?: string; comments?: string; error?: boolean }>(
      url,
      {
        method: 'GET',
        headers: {
          accept: 'application/json, text/javascript, */*; q=0.01',
          referer: `${BASE_URL}/`,
          'x-requested-with': 'XMLHttpRequest',
        },
      }
    );

    const raw = res.data;
    let commentsHtml = '';
    let navHtml = '';

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        commentsHtml = parsed.comments || '';
        navHtml = parsed.navigation || '';
      } catch {
        commentsHtml = raw;
      }
    } else if (raw && typeof raw === 'object') {
      commentsHtml = raw.comments || '';
      navHtml = raw.navigation || '';
    }

    const comments = parseUakinoComments(commentsHtml);
    const hasMore =
      comments.length >= 20 ||
      navHtml.includes(`dle_comments('${cstart + 1}')`) ||
      navHtml.includes(`dle_comments("${cstart + 1}")`) ||
      navHtml.includes(`cstart=${cstart + 1}`);

    return { comments, hasMore, navigation: navHtml };
  } catch (err) {
    return { comments: [], hasMore: false };
  }
}
