import type { Episode, ProviderResult, SearchResult, Season, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import { searchKinostrain } from './search.js';

const API_BASE_URL = 'https://api.kinostrain.com/api';
const SITE_BASE_URL = 'https://kinostrain.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0';

/** Лише українські CDN-плеєри (зарубіжні vidsrc, collaps тощо відфільтровуємо) */
const ALLOWED_CDNS = new Set(['ashdi', 'tortuga']);

interface KinostrainPlayerLink {
  name: string;
  link: string;
}

interface KinostrainSeason {
  number: number;
  playerData?: Record<string, any> | null;
}

interface KinostrainContentData {
  id: number;
  slug: string;
  type: string;
  name: string;
  originalName?: string | null;
  seasons?: KinostrainSeason[] | null;
}

interface KinostrainContentResponse {
  data: KinostrainContentData;
}

const contentCache = new Map<string, { result: ProviderResult; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function extractIdFromLink(link: string): { type: 'vod' | 'embed' | 'serial'; id: string } | null {
  const match = link.match(/\/(vod|embed|serial)\/([a-zA-Z0-9_-]+)/i);
  if (match) {
    return {
      type: match[1].toLowerCase() as 'vod' | 'embed' | 'serial',
      id: match[2],
    };
  }
  return null;
}

function buildStreamSource(cdn: string, item: KinostrainPlayerLink): StreamSource | null {
  if (!item.link) return null;

  const info = extractIdFromLink(item.link);
  const type = info?.type || 'vod';
  const id = info?.id || item.link;
  const cdnName = cdn.toLowerCase();
  const lazyUrl = `/master.m3u8?cdn=${cdnName}&type=${type}&id=${encodeURIComponent(id)}`;

  return {
    title: item.name || (cdnName === 'ashdi' ? 'Ashdi' : 'Tortuga'),
    url: lazyUrl,
    mime: 'application/x-mpegURL',
    lazy: {
      cdn: cdnName,
      type,
      id,
      url: lazyUrl,
      directUrl: item.link,
    },
  };
}

export async function getKinostrain(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let slug = '';
  const meta = options?.meta;
  const reqSeason = options?.season || 1;

  if (typeof target === 'object') {
    slug = (target.details?.slug as string) || target.id;
  } else if (target.startsWith('http://') || target.startsWith('https://')) {
    const urlMatch = target.match(/kinostrain\.com\/(?:serials|movies|content|cartoon-movies)\/([a-zA-Z0-9_-]+)/i);
    if (urlMatch) {
      slug = urlMatch[1];
    }
  } else if (target && !target.includes('/')) {
    slug = target;
  }

  if (!slug && meta?.title) {
    const results = await searchKinostrain(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
    });
    if (results.length > 0) {
      slug = (results[0].details?.slug as string) || results[0].id;
    }
  }

  if (!slug) {
    return null;
  }

  const cacheKey = `${slug}_s${reqSeason}`;
  const cached = contentCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const apiUrl = `${API_BASE_URL}/content/${slug}${reqSeason > 1 ? `?season=${reqSeason}` : ''}`;

  try {
    const res = await httpRequest<KinostrainContentResponse>({
      url: apiUrl,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Referer': `${SITE_BASE_URL}/`,
        'Accept': 'application/json',
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data || !res.data.data) {
      return null;
    }

    const content = res.data.data;
    const isSerial = content.type === 'serial';
    const seasonsList = content.seasons || [];

    // Знаходимо сезон з наявними даними плеєра (пріоритет: запитаний сезон)
    let targetSeasonObj = seasonsList.find((s) => s.number === reqSeason && s.playerData);
    if (!targetSeasonObj) {
      targetSeasonObj = seasonsList.find((s) => s.playerData);
    }

    const playerData = targetSeasonObj?.playerData;
    if (!playerData) {
      return null;
    }

    // Серіал: playerData має ключі епізодів ("1", "2", ...)
    if (isSerial) {
      const episodes: Episode[] = [];

      for (const [epKey, cdnMap] of Object.entries(playerData)) {
        const epNum = parseInt(epKey, 10);
        if (isNaN(epNum)) continue;

        const sources: StreamSource[] = [];

        if (cdnMap && typeof cdnMap === 'object') {
          for (const [cdnName, items] of Object.entries(cdnMap)) {
            if (!ALLOWED_CDNS.has(cdnName.toLowerCase())) continue;
            if (!Array.isArray(items)) continue;

            for (const item of items) {
              const src = buildStreamSource(cdnName, item);
              if (src) sources.push(src);
            }
          }
        }

        if (sources.length > 0) {
          episodes.push({
            episode: epNum,
            sources: sortSources(sources),
          });
        }
      }

      if (episodes.length === 0) {
        return null;
      }

      episodes.sort((a, b) => a.episode - b.episode);

      const seasonNumber = targetSeasonObj?.number || reqSeason;
      const result: ProviderResult = {
        provider: 'kinostrain',
        type: 'tv',
        seasons: sortSeasons([
          {
            season: seasonNumber,
            episodes,
          },
        ]),
      };

      contentCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    // Фільм: playerData містить прямі ключі CDN ({ ashdi: [...], tortuga: [...] })
    const sources: StreamSource[] = [];

    for (const [cdnName, items] of Object.entries(playerData)) {
      if (!ALLOWED_CDNS.has(cdnName.toLowerCase())) continue;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const src = buildStreamSource(cdnName, item);
        if (src) sources.push(src);
      }
    }

    if (sources.length === 0) {
      return null;
    }

    const result: ProviderResult = {
      provider: 'kinostrain',
      type: 'movie',
      sources: sortSources(sources),
    };

    contentCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch {
    return null;
  }
}
