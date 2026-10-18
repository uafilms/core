import type { StreamSource } from '../../../types/media.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import { ANIWORLD_SOURCE_TITLE } from './config.js';

export interface AniWorldEpisodeApiResponse {
  id: number;
  episode: number;
  source_type: string;
  source_url: string;
}

/** Витягує id епізоду з lazy-посилання або embed URL. */
export function parseAniWorldEpisodeId(url: string): string | null {
  const epMatch = url.match(/episodeId=(\d+)/i) || url.match(/\/episode\/(\d+)/i);
  return epMatch ? epMatch[1] : null;
}

/** Джерело-заглушка, яке тягне епізод через наш проксі, коли API недоступне. */
export function buildAniWorldLazySource(episodeId: string): StreamSource {
  const lazyUrl = buildLazyMasterUrl('aniworld', { episodeId });
  return {
    title: ANIWORLD_SOURCE_TITLE,
    url: lazyUrl,
    mime: 'application/x-mpegURL',
    lazy: {
      cdn: 'aniworld',
      type: 'episode',
      id: episodeId,
      url: lazyUrl,
    },
  };
}

/** Dailymotion-вставка з API-відповіді. */
export function buildAniWorldDailymotionSource(sourceUrl: string): StreamSource {
  const videoIdMatch = sourceUrl.match(/video=([a-zA-Z0-9]+)/i) || sourceUrl.match(/\/video\/([a-zA-Z0-9]+)/i);
  const videoId = videoIdMatch ? videoIdMatch[1] : '';

  return {
    title: ANIWORLD_SOURCE_TITLE,
    url: sourceUrl,
    mime: 'text/html',
    lazy: {
      cdn: 'dailymotion',
      type: 'embed',
      id: videoId,
      url: sourceUrl,
    },
  };
}

/** Пряме m3u8-посилання з API-відповіді. */
export function buildAniWorldDirectSource(sourceUrl: string): StreamSource {
  return {
    title: ANIWORLD_SOURCE_TITLE,
    url: sourceUrl,
    mime: 'application/x-mpegURL',
  };
}
