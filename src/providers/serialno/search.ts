import * as cheerio from 'cheerio';
import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://serialno.tv';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0';

export async function searchSerialno(
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

    $('.th-item').each((_, el) => {
      const $card = $(el);
      const $link = $card.find('a.th-in').first();
      let href = $link.attr('href');
      if (!href) return;
      if (!href.startsWith('http')) {
        href = `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      const title = $card.find('.th-title').first().text().trim();
      if (!title) return;

      const yearText = $card
        .find('.th-tip-list li')
        .filter((_, li) => $(li).text().includes('Рік:'))
        .text();
      const yearMatch = yearText.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      let poster =
        $card.find('.th-img img, .th-tip-img img').first().attr('data-src') ||
        $card.find('.th-img img, .th-tip-img img').first().attr('src');
      if (poster && !poster.startsWith('http')) {
        poster = `${BASE_URL}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      results.push({
        id: href,
        title,
        year,
        type: 'tv',
        url: href,
        poster,
      });
    });

    return rankSearchResults(results, searchTerm, options?.year, options?.type);
  } catch {
    return [];
  }
}
