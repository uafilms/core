import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import type { SearchResult, ProviderSearchOptions } from '../../types/index.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://uafix.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function searchUaflix(query: string, options?: ProviderSearchOptions | number): Promise<SearchResult[]> {
  const targetYear = typeof options === 'number' ? options : options?.year;
  const signal = typeof options === 'object' ? options?.signal : undefined;

  const formData = new URLSearchParams();
  formData.append('do', 'search');
  formData.append('subaction', 'search');
  formData.append('story', query);

  try {
    const response = await httpRequest<string>({
      url: `${BASE_URL}/index.php?do=search`,
      method: 'POST',
      data: formData.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/`,
        'User-Agent': UA,
      },
      signal,
    });

    const html = response.data;
    if (!html || typeof html !== 'string') {
      return [];
    }

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $('a.sres-wrap').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const rawTitle = $(el).find('h2').text().trim() || $(el).find('img').attr('alt')?.trim() || '';
      if (!rawTitle) return;

      // Extract titles if separated by /
      const titleParts = rawTitle.split('/').map(s => s.trim()).filter(Boolean);
      const title = titleParts[0] || rawTitle;
      const originalTitle = titleParts.length > 1 ? titleParts[titleParts.length - 1] : undefined;

      const descText = $(el).find('.sres-desc').text().trim();
      const combinedText = `${rawTitle} ${descText}`;
      const yearMatch = combinedText.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      let poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
      if (poster && poster.startsWith('/')) {
        poster = `${BASE_URL}${poster}`;
      }

      const isSerial = href.includes('/serials/');
      const mediaType = isSerial ? 'tv' : 'movie';

      results.push({
        id: href,
        title,
        originalTitle,
        year,
        type: mediaType,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        poster: poster?.startsWith('http') ? poster : undefined,
      });
    });

    return rankSearchResults(results, query, targetYear);
  } catch {
    return [];
  }
}

export const search = searchUaflix;
