import * as cheerio from 'cheerio';
import type { SearchResult, MediaType } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';

const BAMBOO_URL = 'https://bambooua.com';

export async function searchBamboo(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const searchUrl = `${BAMBOO_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(searchTerm)}`;

  try {
    const res = await httpRequest<string>({
      url: searchUrl,
      method: 'GET',
      headers: {
        'Referer': `${BAMBOO_URL}/`,
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data) {
      return [];
    }

    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];

    $('article').each((_, el) => {
      const $card = $(el);
      const $link = $card.find('a.link-title, a[href*="/dorama/"], a[href*="/cinema/"]').first();
      let href = $link.attr('href');
      if (!href || (!href.includes('/dorama/') && !href.includes('/cinema/'))) return;

      if (!href.startsWith('http')) {
        href = `${BAMBOO_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      const title = $card.find('.title h2, .title, h2, a.link-title').first().text().trim();
      if (!title) return;

      const origTitle = $card.find('.cat-orig, .orig-title, .original-title, .cat-card__orig').text().trim() || undefined;
      const textBlock = $card.find('.text, .year, .cat-year').text();
      const yearMatch = textBlock.match(/\b(19\d\d|20\d\d)\b/) || href.match(/-(\d{4})\.html/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      let poster = $card.find('.poster img:not(.no-poster)').first().attr('src') ||
                   $card.find('img').first().attr('src');
      if (poster && poster.startsWith('/')) {
        poster = `${BAMBOO_URL}${poster}`;
      }

      const isMovie = href.includes('/cinema/');
      const type: MediaType = isMovie ? 'movie' : 'tv';

      results.push({
        id: href,
        title,
        originalTitle: origTitle,
        year,
        type,
        url: href,
        poster,
      });
    });

    return rankSearchResults(results, searchTerm, options?.year);
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return [];
  }
}
