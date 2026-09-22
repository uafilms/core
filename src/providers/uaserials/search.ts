import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import type { SearchResult } from '../../types/media.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://uaserials.com';

export async function searchUASerials(query: string, year?: number): Promise<SearchResult[]> {
  const formData = new URLSearchParams();
  formData.append('do', 'search');
  formData.append('subaction', 'search');
  formData.append('story', query);

  const response = await httpRequest<string>({
    url: `${BASE_URL}/index.php?do=search`,
    method: 'POST',
    data: formData.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE_URL}/`,
    },
  });

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  // Modern BEM layout: a.uas-card
  $('.uas-card, a.uas-card').each((_, el) => {
    const url = $(el).attr('href') || $(el).find('a').attr('href');
    const title = $(el).find('.uas-card__title').text().trim();
    const origTitle = $(el).find('.uas-card__orig, .uas-card__orig-title').text().trim() || undefined;
    const yearText = $(el).find('.uas-card__year').text().trim();
    const itemYear = yearText ? parseInt(yearText, 10) : undefined;
    const poster = $(el).find('.uas-card__poster img').attr('data-src') || $(el).find('img').attr('data-src') || $(el).find('img').attr('src');

    if (url && title) {
      results.push({
        id: url,
        title,
        originalTitle: origTitle,
        year: isNaN(itemYear || NaN) ? undefined : itemYear,
        url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
        poster: poster ? (poster.startsWith('http') ? poster : `${BASE_URL}${poster}`) : undefined,
      });
    }
  });

  // Fallback for older layout if present
  if (results.length === 0) {
    $('.short-item').each((_, el) => {
      const linkEl = $(el).find('.th-title a');
      const url = linkEl.attr('href');
      const title = linkEl.text().trim();
      const yearText = $(el).find('.th-series, .th-year').text().trim();
      const match = yearText.match(/\d{4}/);
      const itemYear = match ? parseInt(match[0], 10) : undefined;
      const poster = $(el).find('.th-img img').attr('src');

      if (url && title) {
        results.push({
          id: url,
          title,
          year: itemYear,
          url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
          poster: poster ? (poster.startsWith('http') ? poster : `${BASE_URL}${poster}`) : undefined,
        });
      }
    });
  }

  return rankSearchResults(results, query, year);
}

export const search = searchUASerials;

