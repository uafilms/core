import * as cheerio from 'cheerio';
import type { MediaType, SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';

export const FRANKO_MIRRORS = [
  'https://uakino.watch',
  'https://uaserials.live',
  'https://uakinohd.my',
  'https://uaserials.digital',
  'https://uaserialshd.my',
  'https://uakino.productions',
];

/**
 * Виконує DLE пошук по мережі дзеркал Franko
 */
export async function searchFranko(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };

  // Спробувати кожне дзеркало до першого успішного результату
  for (const mirror of FRANKO_MIRRORS) {
    if (options?.signal?.aborted) break;

    try {
      const body = new URLSearchParams();
      body.append('do', 'search');
      body.append('subaction', 'search');
      body.append('story', cleanQuery);

      const res = await httpRequest<string>(`${mirror}/index.php?do=search`, {
        method: 'POST',
        data: body.toString(),
        headers: {
          ...headers,
          Referer: `${mirror}/`,
        },
        signal: options?.signal,
        timeout: 6000,
      });

      const html = res.data;
      if (!html) continue;

      const $ = cheerio.load(html);
      const items: SearchResult[] = [];

      $('.movie-item').each((_, el) => {
        const item = $(el);
        const titleLink = item.find('a.movie-title');
        const href = titleLink.attr('href');
        const title = titleLink.text().trim();
        if (!href || !title) return;

        // Повна URL посилання
        const fullUrl = href.startsWith('http') ? href : `${mirror}${href.startsWith('/') ? '' : '/'}${href}`;

        // ID з URL: наприклад 17327-chornobil.html -> 17327
        const idMatch = href.match(/\/(\d+)-/);
        const id = idMatch ? idMatch[1] : fullUrl;

        // Медіа тип
        let type: MediaType = 'movie';
        if (href.includes('/series/') || href.includes('/serialy/')) {
          type = 'tv';
        }

        // Рік
        const ratingText = item.find('.related-item-rating').text();
        const yearMatch = ratingText.match(/\b(19\d\d|20\d\d)\b/) || item.text().match(/Рік виходу:\s*(\d{4})/i);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

        // Постер
        let poster = item.find('.movie-img img').attr('src');
        if (poster && !poster.startsWith('http')) {
          poster = `${mirror}${poster.startsWith('/') ? '' : '/'}${poster}`;
        }

        // Оригінальна назва
        const deckTitle = item.find('.deck-title').text().trim();
        const originalTitle = deckTitle && deckTitle !== title ? deckTitle : undefined;

        items.push({
          id,
          title,
          originalTitle,
          year,
          type,
          poster: poster || undefined,
          url: fullUrl,
        });
      });

      if (items.length > 0) {
        return rankSearchResults(items, cleanQuery, options?.year);
      }
    } catch {
      // Переходимо до наступного дзеркала у разі помилки
      continue;
    }
  }

  return [];
}
