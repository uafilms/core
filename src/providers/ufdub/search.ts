import * as cheerio from 'cheerio';
import type { MediaType, SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://ufdub.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0';

export async function searchUfdub(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const formData = new URLSearchParams();
  formData.append('do', 'search');
  formData.append('subaction', 'search');
  formData.append('story', searchTerm);

  try {
    const res = await httpRequest<string>({
      url: `${BASE_URL}/index.php?do=search`,
      method: 'POST',
      data: formData.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/`,
        'User-Agent': UA,
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data) {
      return [];
    }

    const $ = cheerio.load(res.data);
    const results: SearchResult[] = [];

    $('.short').each((_, el) => {
      const $card = $(el);
      const $link = $card.find('a.short-t').first();
      let href = $link.attr('href') || $card.find('.ps-link[data-link]').attr('data-link');
      const rawTitle = $link.text().trim() || $card.find('.short-t').text().trim();
      if (!href || !rawTitle) return;

      if (!href.startsWith('http')) {
        href = `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      let title = rawTitle;
      let originalTitle: string | undefined;

      if (title.includes(' / ')) {
        const parts = title.split(' / ');
        title = parts[0].trim();
        originalTitle = parts.slice(1).join(' / ').trim();
      }

      let poster = $card.find('.short-i img').first().attr('src');
      if (poster && !poster.startsWith('http')) {
        poster = `${BASE_URL}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      const isMovie = href.includes('/film/');
      const type: MediaType = isMovie ? 'movie' : 'tv';

      const fullText = $card.text();
      const yearMatch = fullText.match(/\b(19\d\d|20\d\d)\b/) || href.match(/-(\d{4})\.html/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      results.push({
        id: href,
        title,
        originalTitle,
        year,
        type,
        url: href,
        poster,
      });
    });

    return rankSearchResults(results, searchTerm, options?.year, options?.type);
  } catch {
    return [];
  }
}
