import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import type { SearchResult, MediaType } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://eneyida.tv';

export async function searchEneyida(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const formData = new URLSearchParams();
  formData.append('do', 'search');
  formData.append('subaction', 'search');
  formData.append('story', query);

  const response = await httpRequest<string>({
    url: `${BASE_URL}/index.php?do=search`,
    method: 'POST',
    data: formData.toString(),
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${BASE_URL}/`,
    },
  });

  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];

  $('article').each((_, el) => {
    const linkEl = $(el).find('.short_title, a.short_img, a').first();
    const href = linkEl.attr('href');
    if (!href) return;

    const title = $(el).find('.short_title').text().trim() ||
      $(el).find('h2').text().trim() ||
      linkEl.text().trim();

    const subtitleText = $(el).find('.short_subtitle').text().trim();
    const fullText = $(el).text();

    // Витягуємо рік
    const yearLink = $(el).find('.short_subtitle a[href*="/year/"]').text().trim();
    const yearMatch = (yearLink || subtitleText || fullText).match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

    // Витягуємо оригінальну назву
    let originalTitle: string | undefined;
    if (subtitleText) {
      const origPart = subtitleText.replace(/^(?:\d{4}|\s|[•\/\-])+/, '').trim();
      if (origPart.length > 0) {
        originalTitle = origPart;
      }
    }

    // Витягуємо постер
    const img = $(el).find('.short_img img, img').first();
    const posterSrc = img.attr('data-src') || img.attr('src');
    const poster = posterSrc
      ? (posterSrc.startsWith('http') ? posterSrc : `${BASE_URL}${posterSrc}`)
      : undefined;

    // Визначаємо тип
    let type: MediaType = 'movie';
    if (/(?:сезон|серія|серіал)/i.test(fullText) || /(?:сезон|серія|серіал)/i.test(title)) {
      type = 'tv';
    }

    results.push({
      id: href,
      title,
      originalTitle,
      year,
      type,
      url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
      poster,
    });
  });

  return rankSearchResults(results, query, options?.year);
}
