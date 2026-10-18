import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { httpRequest } from '../../../utils/http.js';
import { bunnyVod } from '../bunny/main.js';
import {
  buildAniWorldDailymotionSource,
  buildAniWorldDirectSource,
  buildAniWorldLazySource,
  parseAniWorldEpisodeId,
  type AniWorldEpisodeApiResponse,
} from './extract.js';
import { ANIWORLD_API_BASE, ANIWORLD_REFERER, ANIWORLD_TIMEOUT, ANIWORLD_UA } from './config.js';

export class AniWorldVodExtractor implements VodExtractor {
  readonly name = 'aniworld';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    const trimmed = url.trim();

    // 1. Посилання з lazy параметром: /master.m3u8?cdn=aniworld&episodeId=123
    const episodeId = parseAniWorldEpisodeId(trimmed);

    if (episodeId) {
      try {
        const res = await httpRequest(`${ANIWORLD_API_BASE}/${episodeId}/`, {
          headers: {
            'User-Agent': ANIWORLD_UA,
            Referer: ANIWORLD_REFERER,
          },
          timeout: ANIWORLD_TIMEOUT,
        });

        const data = res.data as AniWorldEpisodeApiResponse;
        if (data && data.source_url) {
          const sourceUrl = data.source_url.trim();

          // BunnyCDN mediadelivery
          if (sourceUrl.includes('mediadelivery.net')) {
            const bunnyRes = await bunnyVod.extract(sourceUrl, options);
            if (bunnyRes) return bunnyRes;
          }

          // Dailymotion
          if (sourceUrl.includes('dailymotion.com')) {
            return {
              sources: [buildAniWorldDailymotionSource(sourceUrl)],
            };
          }

          // Direct M3U8
          if (sourceUrl.includes('.m3u8')) {
            return {
              sources: [buildAniWorldDirectSource(sourceUrl)],
            };
          }
        }
      } catch {
        // Fallback lazy stream
      }

      // Якщо API тимчасово недоступне — повертаємо lazy stream
      return {
        sources: [buildAniWorldLazySource(episodeId)],
      };
    }

    // 2. Якщо це напряму BunnyCDN
    if (trimmed.includes('mediadelivery.net') || trimmed.includes('b-cdn.net')) {
      return bunnyVod.extract(trimmed, options);
    }

    return null;
  }
}

export const aniWorldVod = new AniWorldVodExtractor();

export * from './config.js';
export * from './extract.js';
