import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import type { SearchResult, MediaType } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://uaserials.my';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';

export async function searchUaSerialsMy(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    do: 'search',
    subaction: 'search',
    search_start: '0',
    full_search: '0',
    story: query,
  });

  const response = await httpRequest<string>({
    url: `${BASE_URL}/index.php?${params.toString()}`,
    method: 'GET',
    signal: options?.signal,
    headers: {
      'User-Agent': UA,
      'Referer': `${BASE_URL}/`,
    },
  });

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('.short-cols, .th-item').each((_, el) => {
    const linkEl = $(el).find('a.short-img, a').first();
    const href = linkEl.attr('href');
    if (!href || href === '/abuse.html' || href.includes('rules.html')) return;

    const title = $(el).find('.th-title').text().trim();
    const origTitle = $(el).find('.th-title-oname').text().trim() || undefined;
    const label = $(el).find('.short-label').text().trim().toLowerCase();

    // Визначаємо рік: з URL (напр. 2049-biycivskyi-klub-1999.html) або з тексту
    const urlYearMatch = href.match(/[-_](\d{4})\.html/);
    const textYearMatch = $(el).text().match(/\b(19\d\d|20\d\d)\b/);
    const yearStr = urlYearMatch?.[1] || textYearMatch?.[1];
    const year = yearStr ? parseInt(yearStr, 10) : undefined;

    // Витягуємо постер
    const img = $(el).find('img').first();
    const posterSrc = img.attr('data-src') || img.attr('src');
    const poster = posterSrc
      ? (posterSrc.startsWith('http') ? posterSrc : `${BASE_URL}${posterSrc}`)
      : undefined;

    // Визначаємо тип
    let type: MediaType = 'movie';
    if (label.includes('серіал') || label.includes('сезон') || href.includes('/series/')) {
      type = 'tv';
    }

    results.push({
      id: href,
      title: title || origTitle || '',
      originalTitle: origTitle,
      year,
      type,
      url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
      poster,
    });
  });

  return rankSearchResults(results, query, options?.year);
}
