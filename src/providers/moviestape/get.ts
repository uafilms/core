import * as cheerio from 'cheerio';
import type { ProviderResult, SearchResult, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { getHtml } from '../../utils/http.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import { extractVod } from '../cdn/index.js';
import { searchMoviestape } from './search.js';

const BASE_URL = 'https://moviestape.lat';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const moviestapeCache = new Map<string, { result: ProviderResult; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getMoviestape(
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
    const results = await searchMoviestape(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
      season: options?.season,
      episode: options?.episode,
      meta,
      clientIp: options?.clientIp,
    });
    if (results.length > 0) {
      pageUrl = results[0].url || results[0].id;
    }
  }

  if (!pageUrl) {
    return null;
  }

  if (!pageUrl.startsWith('http')) {
    pageUrl = `${BASE_URL}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
  }

  const cacheKey = `${pageUrl}:${options?.clientIp || 'default'}`;
  const cached = moviestapeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const html = await getHtml(pageUrl, {
      signal: options?.signal,
      headers: {
        'Referer': `${BASE_URL}/`,
        'User-Agent': UA,
      },
    });

    if (!html || typeof html !== 'string') {
      return null;
    }

    const $ = cheerio.load(html);

    if (meta) {
      const h1Text = $('h1').text();
      const yearMatch = h1Text.match(/\((\d{4})/);
      const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      if (meta.year && pageYear && Math.abs(meta.year - pageYear) >= 3) {
        return null;
      }

      const isAnimePage = pageUrl.includes('/anime/');
      if (meta.isAnime === false && isAnimePage) {
        return null;
      }

      const isCartoonPage = pageUrl.includes('/multfilmiv/') || pageUrl.includes('/multserialy/');
      const isMetaAnimation =
        Boolean(meta.isAnime) ||
        Boolean(meta.genres?.some((g) => /анімац|мульт|animation/i.test(g)));

      if (!isMetaAnimation && (isCartoonPage || isAnimePage)) {
        return null;
      }
    }

    const iframeUrls: string[] = [];

    $('iframe').each((_, el) => {
      let src = $(el).attr('src');
      if (!src) return;
      if (src.startsWith('//')) src = `https:${src}`;
      if (!iframeUrls.includes(src)) iframeUrls.push(src);
    });

    // Fallback regex for sniplyo/creavio stream.php
    if (iframeUrls.length === 0) {
      const matches = html.matchAll(/https?:\/\/(?:sniplyo|creavio)\.online\/stream\.php\?[^"'\s]+/gi);
      for (const m of matches) {
        if (!iframeUrls.includes(m[0])) {
          iframeUrls.push(m[0]);
        }
      }
    }

    if (iframeUrls.length === 0) {
      return null;
    }

    const allMovieSources: StreamSource[] = [];
    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

    for (const iframeSrc of iframeUrls) {
      try {
        const vodResult = await extractVod(iframeSrc, {
          referer: pageUrl,
          signal: options?.signal,
          clientIp: options?.clientIp,
        });

        if (!vodResult) continue;

        if (vodResult.sources && vodResult.sources.length > 0) {
          allMovieSources.push(...vodResult.sources);
        }

        if (vodResult.seasons && vodResult.seasons.length > 0) {
          for (const s of vodResult.seasons) {
            if (!seasonsMap.has(s.season)) {
              seasonsMap.set(s.season, new Map());
            }
            const epMap = seasonsMap.get(s.season)!;
            for (const ep of s.episodes) {
              if (!epMap.has(ep.episode)) {
                epMap.set(ep.episode, []);
              }
              epMap.get(ep.episode)!.push(...ep.sources);
            }
          }
        }
      } catch {
        // ignore extractor errors
      }
    }

    if (seasonsMap.size > 0) {
      const seasons = [];
      for (const [seasonNum, epMap] of seasonsMap.entries()) {
        const episodes = [];
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
        provider: 'moviestape',
        type: 'tv',
        seasons: sortSeasons(seasons),
      };

      moviestapeCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    if (allMovieSources.length > 0) {
      const result: ProviderResult = {
        provider: 'moviestape',
        type: 'movie',
        sources: sortSources(allMovieSources),
      };

      moviestapeCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    return null;
  } catch {
    return null;
  }
}
