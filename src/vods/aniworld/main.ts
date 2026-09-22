import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../types/vod.js';
import type { StreamSource } from '../../types/media.js';
import { httpRequest } from '../../utils/http.js';
import { bunnyVod } from '../bunny/main.js';

export interface AniWorldEpisodeApiResponse {
  id: number;
  episode: number;
  source_type: string;
  source_url: string;
}

export class AniWorldVodExtractor implements VodExtractor {
  readonly name = 'aniworld';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    const trimmed = url.trim();

    // 1. Посилання з lazy параметром: /master.m3u8?cdn=aniworld&episodeId=123
    let episodeId: string | null = null;
    const epMatch = trimmed.match(/episodeId=(\d+)/i) || trimmed.match(/\/episode\/(\d+)/i);
    if (epMatch) {
      episodeId = epMatch[1];
    }

    if (episodeId) {
      try {
        const res = await httpRequest(`https://api.aniworldua.com/api/v1/catalog/episode/${episodeId}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://aniworldua.com/',
          },
          timeout: 5000,
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
            const videoIdMatch = sourceUrl.match(/video=([a-zA-Z0-9]+)/i) || sourceUrl.match(/\/video\/([a-zA-Z0-9]+)/i);
            const videoId = videoIdMatch ? videoIdMatch[1] : '';

            const source: StreamSource = {
              title: 'AniWorld UA (ШІ)',
              url: sourceUrl,
              mime: 'text/html',
              lazy: {
                cdn: 'dailymotion',
                type: 'embed',
                id: videoId,
                url: sourceUrl,
              },
            };

            return {
              sources: [source],
            };
          }

          // Direct M3U8
          if (sourceUrl.includes('.m3u8')) {
            const source: StreamSource = {
              title: 'AniWorld UA (ШІ)',
              url: sourceUrl,
              mime: 'application/x-mpegURL',
            };
            return {
              sources: [source],
            };
          }
        }
      } catch {
        // Fallback lazy stream
      }

      // Якщо API тимчасово недоступне — повертаємо lazy stream
      return {
        sources: [
          {
            title: 'AniWorld UA (ШІ)',
            url: `/master.m3u8?cdn=aniworld&episodeId=${episodeId}`,
            mime: 'application/x-mpegURL',
            lazy: {
              cdn: 'aniworld',
              type: 'episode',
              id: episodeId,
              url: `/master.m3u8?cdn=aniworld&episodeId=${episodeId}`,
            },
          },
        ],
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
