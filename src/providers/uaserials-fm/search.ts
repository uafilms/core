import * as cheerio from 'cheerio';
import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import { UASERIALS_FM_BASE, UASERIALS_FM_SEARCH_URL, UASERIALS_FM_UA } from './config.js';

export async function searchUaSerialsFm(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const formData = new URLSearchParams({
    do: 'search',
    subaction: 'search',
    search_start: '0',
    full_search: '0',
    story: searchTerm,
  });

  try {
    const res = await httpRequest<string>({
      url: UASERIALS_FM_SEARCH_URL,
      method: 'POST',
      data: formData.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${UASERIALS_FM_BASE}/`,
        'User-Agent': UASERIALS_FM_UA,
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data) {
      return [];
    }

    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];

    $('.short-item, .short-cols').each((_, el) => {
      const $card = $(el);
      const $link = $card.find('a.short-img, a').first();
      let href = $link.attr('href');
      if (!href) return;
      if (!href.startsWith('http')) {
        href = `${UASERIALS_FM_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      const title =
        $card.find('.th-title').first().text().trim() ||
        $card.find('img').first().attr('alt')?.trim() ||
        $link.text().trim();
      if (!title) return;

      const origTitle = $card.find('.th-title-oname').first().text().trim() || undefined;

      const isMovie = href.includes('/films/') || href.includes('/fcartoon/');
      const type: 'movie' | 'tv' = isMovie ? 'movie' : 'tv';

      let poster =
        $card.find('img.lazyload').first().attr('data-src') ||
        $card.find('img').first().attr('data-src') ||
        $card.find('img').first().attr('src');
      if (poster && !poster.startsWith('http')) {
        poster = `${UASERIALS_FM_BASE}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      if (!results.some((r) => r.url === href)) {
        results.push({
          id: href,
          title,
          originalTitle: origTitle,
          type,
          url: href,
          poster,
        });
      }
    });

    return rankSearchResults(results, searchTerm, options?.year, options?.type);
  } catch {
    return [];
  }
}
