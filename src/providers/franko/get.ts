import * as cheerio from 'cheerio';
import type { MediaType, ProviderResult, SearchResult } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { frankoVod } from '../../vods/franko/main.js';
import { searchFranko } from './search.js';

export async function getFrankoStreams(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult> {
  let pageUrl = '';
  let mediaType: MediaType = 'movie';

  if (typeof target === 'object' && target !== null) {
    pageUrl = target.url || '';
    mediaType = target.type || 'movie';
  } else {
    const raw = target.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      pageUrl = raw;
      if (raw.includes('/series/') || raw.includes('/serialy/')) {
        mediaType = 'tv';
      }
    } else {
      const searchResults = await searchFranko(raw, {
        signal: options?.signal,
        year: options?.meta?.year,
      });
      if (searchResults.length > 0) {
        pageUrl = searchResults[0].url || '';
        mediaType = searchResults[0].type || 'movie';
      }
    }
  }

  if (!pageUrl) {
    return { provider: 'franko', type: mediaType, seasons: [], sources: [] };
  }

  try {
    const res = await httpRequest<string>(pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        Referer: pageUrl,
      },
      signal: options?.signal,
      timeout: 8000,
    });

    const html = res.data;
    if (!html) {
      return { provider: 'franko', type: mediaType, seasons: [], sources: [] };
    }

    const $ = cheerio.load(html);
    const iframeSrc = $('iframe[src*="franko.uacdn.online"], iframe[src*="franko"]').attr('src');

    if (!iframeSrc) {
      return { provider: 'franko', type: mediaType, seasons: [], sources: [] };
    }

    const fullIframeSrc = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc;

    // Витягуємо потоки через VOD екстрактор Franko
    const extraction = await frankoVod.extract(fullIframeSrc, {
      signal: options?.signal,
    });

    if (!extraction) {
      return { provider: 'franko', type: mediaType, seasons: [], sources: [] };
    }

    return {
      provider: 'franko',
      type: extraction.seasons?.length ? 'tv' : 'movie',
      sources: extraction.sources || [],
      seasons: extraction.seasons || [],
    };
  } catch (err: any) {
    return {
      provider: 'franko',
      type: mediaType,
      seasons: [],
      sources: [],
      error: err.message,
    };
  }
}
