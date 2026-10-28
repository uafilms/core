import * as cheerio from 'cheerio';
import type { MediaType, SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';

const BASE_URL = 'https://moviestape.lat';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export async function searchMoviestape(
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
    let res = await httpRequest<string>({
      url: `${BASE_URL}/index.php?do=search`,
      method: 'POST',
      data: new URLSearchParams({
        do: 'search',
        subaction: 'search',
        story: searchTerm,
        titleonly: '3',
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/`,
        'User-Agent': UA,
      },
      signal: options?.signal,
    });

    let $ = cheerio.load(res.data || '');
    let searchTops = $('.search_top');

    // Fallback to full search if title-only search yielded no results
    if (searchTops.length === 0) {
      res = await httpRequest<string>({
        url: `${BASE_URL}/index.php?do=search`,
        method: 'POST',
        data: new URLSearchParams({
          do: 'search',
          subaction: 'search',
          story: searchTerm,
          titleonly: '0',
        }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${BASE_URL}/`,
          'User-Agent': UA,
        },
        signal: options?.signal,
      });
      $ = cheerio.load(res.data || '');
      searchTops = $('.search_top');
    }

    if (!res.data || searchTops.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];

    searchTops.each((_, el) => {
      const parent = $(el).parent();
      const link = $(el).find('h3 a').first();
      let href = link.attr('href');
      const rawTitle = link.text().trim();
      if (!href || !rawTitle) return;

      // Filter out news, persons, trailers, etc.
      if (!href.includes('/katalog_') && !href.includes('/anime/')) {
        return;
      }

      if (!href.startsWith('http')) {
        href = `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      }

      let poster = parent.find('img').first().attr('src');
      if (poster && (poster.includes('bttn_') || poster.includes('no_image'))) {
        poster = undefined;
      } else if (poster && !poster.startsWith('http')) {
        poster = `${BASE_URL}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      const isTv = href.includes('/katalog_serialiv/') || href.includes('/multserialy/');
      const type: MediaType = isTv ? 'tv' : 'movie';

      const isAnimeCard = href.includes('/anime/');
      const isCartoonCard = href.includes('/multfilmiv/') || href.includes('/multserialy/');

      if (options?.meta) {
        if (options.meta.isAnime === false && isAnimeCard) {
          return;
        }
        const isMetaAnimation =
          Boolean(options.meta.isAnime) ||
          Boolean(options.meta.genres?.some((g) => /анімац|мульт|animation/i.test(g)));

        if (!isMetaAnimation && (isCartoonCard || isAnimeCard)) {
          return;
        }
      }

      const parentText = parent.text();
      const yearMatch = rawTitle.match(/\((\d{4})\)/) || parentText.match(/\b(19\d\d|20\d\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      const cleanTitle = rawTitle.replace(/\s*\(\d{4}(?:\s*-\s*\d{4})?\).*/, '').trim();

      results.push({
        id: href,
        title: cleanTitle,
        year,
        type,
        url: href,
        poster,
      });
    });

    return rankSearchResults(
      results,
      searchTerm,
      options?.year,
      options?.type,
      options?.season,
      options?.episode
    );
  } catch {
    return [];
  }
}
