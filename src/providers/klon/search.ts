import * as cheerio from 'cheerio';
import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import { KLON_BASE_URL, KLON_SEARCH_URL, KLON_UA } from './config.js';

export async function searchKlon(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const formData = new URLSearchParams();
  formData.append('do', 'search');
  formData.append('subaction', 'search');
  formData.append('search_start', '0');
  formData.append('full_search', '0');
  formData.append('result_from', '1');
  formData.append('story', searchTerm);

  try {
    const res = await httpRequest<string>({
      url: KLON_SEARCH_URL,
      method: 'POST',
      data: formData.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${KLON_BASE_URL}/`,
        'User-Agent': KLON_UA,
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data) {
      return [];
    }

    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];

    $('.short-news__slide-item, .short-news__small').each((_, el) => {
      const $card = $(el);
      const $link = $card
        .find('a.short-news__small-card__link, a.card-link__style, a.link')
        .first();
      let href = $link.attr('href');
      if (!href) return;
      if (!href.startsWith('http')) {
        href = `${KLON_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      const title =
        $card.find('.card-link__text').first().text().trim() ||
        $card.find('.card-title__block a').first().text().trim() ||
        $card.find('img').first().attr('alt')?.replace(/^постер\s+/i, '').trim() ||
        $link.text().trim();
      if (!title) return;

      const subLabel = $card
        .find('.card-module__subscribe, .subscribe-label-module')
        .first()
        .text()
        .trim();
      const yearMatch = subLabel.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      const isTv =
        href.includes('/serialy/') ||
        href.includes('/multserialy/') ||
        /серіал/i.test(subLabel);
      const type: 'movie' | 'tv' = isTv ? 'tv' : 'movie';

      let poster =
        $card.find('img.card-poster__img').first().attr('data-src') ||
        $card.find('img.card-poster__img').first().attr('src') ||
        $card.find('img').first().attr('data-src') ||
        $card.find('img').first().attr('src');
      if (poster && !poster.startsWith('http')) {
        poster = `${KLON_BASE_URL}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      if (!results.some((r) => r.url === href)) {
        results.push({
          id: href,
          title,
          year,
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
