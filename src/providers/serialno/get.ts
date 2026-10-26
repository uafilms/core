import * as cheerio from 'cheerio';
import type { Episode, ProviderResult, SearchResult, Season, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { getHtml } from '../../utils/http.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import { extractVod } from '../cdn/index.js';
import { searchSerialno } from './search.js';

const BASE_URL = 'https://serialno.tv';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0';

interface PlayerTab {
  label: string;
  iframeSrc: string;
}

const serialCache = new Map<string, { result: ProviderResult; timestamp: number }>();
const SERIAL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function extractPlayerTabs($: cheerio.CheerioAPI): PlayerTab[] {
  const tabs: PlayerTab[] = [];
  const labels: string[] = [];

  $('.tabs-sel span').each((_, el) => {
    labels.push($(el).text().trim());
  });

  const boxes = $('.tabs-b.video-box, .video-box');
  boxes.each((idx, el) => {
    let iframeSrc = $(el).find('iframe').attr('src');
    if (!iframeSrc) return;
    if (iframeSrc.startsWith('//')) {
      iframeSrc = `https:${iframeSrc}`;
    }

    if (iframeSrc.includes('youtube.com') || iframeSrc.includes('youtu.be') || iframeSrc.includes('vimeo.com')) {
      return;
    }

    const label = labels[idx] || `Плеєр ${idx + 1}`;
    if (/трейлер|trailer/i.test(label)) {
      return;
    }

    tabs.push({ label, iframeSrc });
  });

  return tabs;
}

export async function getSerialno(
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
    const results = await searchSerialno(meta.title, {
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
    pageUrl = `${BASE_URL}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
  }

  const cached = serialCache.get(pageUrl);
  if (cached && Date.now() - cached.timestamp < SERIAL_CACHE_TTL) {
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
    const playerTabs = extractPlayerTabs($);
    if (playerTabs.length === 0) {
      return null;
    }

    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();
    const allMovieSources: StreamSource[] = [];

    await Promise.allSettled(
      playerTabs.map(async (tab) => {
        try {
          const vodRes = await extractVod(tab.iframeSrc, {
            referer: pageUrl,
            signal: options?.signal,
          });

          if (vodRes?.seasons && vodRes.seasons.length > 0) {
            for (const s of vodRes.seasons) {
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
          } else if (vodRes?.sources && vodRes.sources.length > 0) {
            allMovieSources.push(...vodRes.sources);
          }
        } catch {
          // ignore extractor errors
        }
      })
    );

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
        provider: 'serialno',
        type: 'tv',
        seasons: sortSeasons(seasons),
      };

      serialCache.set(pageUrl, { result, timestamp: Date.now() });
      return result;
    }

    if (allMovieSources.length > 0) {
      const result: ProviderResult = {
        provider: 'serialno',
        type: 'movie',
        sources: sortSources(allMovieSources),
      };
      return result;
    }

    return null;
  } catch {
    return null;
  }
}
