import * as cheerio from 'cheerio';
import type {
  Episode,
  ProviderResult,
  SearchResult,
  Season,
  StreamSource,
} from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { getHtml } from '../../utils/http.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import { extractVod } from '../cdn/index.js';
import { searchKlon } from './search.js';
import { KLON_BASE_URL, KLON_UA } from './config.js';

const klonCache = new Map<string, { result: ProviderResult; timestamp: number }>();
const KLON_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function extractIframeUrls($: cheerio.CheerioAPI): string[] {
  const iframes: string[] = [];

  $('.film-player iframe, #watch-player iframe, article iframe, iframe').each((_, el) => {
    let src = $(el).attr('data-src') || $(el).attr('src');
    if (!src) return;
    src = src.trim();
    if (src.startsWith('//')) {
      src = `https:${src}`;
    }
    if (!src.startsWith('http')) return;

    if (
      src.includes('youtube.com') ||
      src.includes('youtu.be') ||
      src.includes('vimeo.com')
    ) {
      return;
    }

    if (!iframes.includes(src)) {
      iframes.push(src);
    }
  });

  return iframes;
}

export async function getKlon(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let pageUrl = '';
  const meta = options?.meta;

  if (typeof target === 'object') {
    pageUrl = target.url || target.id;
  } else if (target.startsWith('http://') || target.startsWith('https://')) {
    pageUrl = target;
  } else if (meta?.title) {
    const results = await searchKlon(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
    });
    if (results.length > 0) {
      pageUrl = results[0].url || results[0].id;
    }
  }

  if (!pageUrl) {
    return null;
  }

  if (!pageUrl.startsWith('http')) {
    pageUrl = `${KLON_BASE_URL}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
  }

  const cached = klonCache.get(pageUrl);
  if (cached && Date.now() - cached.timestamp < KLON_CACHE_TTL) {
    return cached.result;
  }

  try {
    const html = await getHtml(pageUrl, {
      signal: options?.signal,
      headers: {
        'Referer': `${KLON_BASE_URL}/`,
        'User-Agent': KLON_UA,
      },
    });

    if (!html || typeof html !== 'string') {
      return null;
    }

    const $ = cheerio.load(html);
    const iframes = extractIframeUrls($);

    if (iframes.length === 0) {
      return null;
    }

    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();
    const movieSources: StreamSource[] = [];

    for (const iframe of iframes) {
      const vodResult = await extractVod(iframe, {
        signal: options?.signal,
      });

      if (!vodResult) continue;

      if (vodResult.sources && vodResult.sources.length > 0) {
        movieSources.push(...vodResult.sources);
      }

      if (vodResult.seasons && vodResult.seasons.length > 0) {
        for (const season of vodResult.seasons) {
          if (!seasonsMap.has(season.season)) {
            seasonsMap.set(season.season, new Map());
          }
          const epMap = seasonsMap.get(season.season)!;
          for (const ep of season.episodes) {
            if (!epMap.has(ep.episode)) {
              epMap.set(ep.episode, []);
            }
            epMap.get(ep.episode)!.push(...ep.sources);
          }
        }
      }
    }

    if (seasonsMap.size > 0) {
      const seasons: Season[] = [];
      for (const [seasonNum, epMap] of seasonsMap.entries()) {
        const episodes: Episode[] = [];
        for (const [epNum, sources] of epMap.entries()) {
          episodes.push({
            episode: epNum,
            sources: sortSources(sources),
          });
        }
        episodes.sort((a, b) => a.episode - b.episode);
        seasons.push({
          season: seasonNum,
          episodes,
        });
      }

      const result: ProviderResult = {
        provider: 'klon',
        type: 'tv',
        seasons: sortSeasons(seasons),
      };

      klonCache.set(pageUrl, { result, timestamp: Date.now() });
      return result;
    }

    if (movieSources.length > 0) {
      const result: ProviderResult = {
        provider: 'klon',
        type: 'movie',
        sources: sortSources(movieSources),
      };

      klonCache.set(pageUrl, { result, timestamp: Date.now() });
      return result;
    }

    return null;
  } catch {
    return null;
  }
}
