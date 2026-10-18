import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { httpRequest } from '../../../utils/http.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import { buildBunnyDirectSource, buildBunnyEmbedSource, parseBunnyEmbedHtml } from './extract.js';
import {
  BUNNY_KNOWN_CDN_HOST,
  BUNNY_KNOWN_LIBRARY_ID,
  BUNNY_REFERER,
  BUNNY_TIMEOUT,
  BUNNY_UA,
} from './config.js';

export class BunnyVodExtractor implements VodExtractor {
  readonly name = 'bunny';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    const trimmed = url.trim();

    // 1. Пряме HLS посилання на Bunny CDN (*.b-cdn.net/*.m3u8)
    if (trimmed.includes('b-cdn.net') && trimmed.includes('.m3u8')) {
      return {
        sources: [buildBunnyDirectSource(trimmed)],
      };
    }

    // 2. Bunny Stream iframe / embed player (mediadelivery.net/embed/...)
    if (trimmed.includes('mediadelivery.net/embed/')) {
      const match = trimmed.match(/mediadelivery\.net\/embed\/(\d+)\/([a-f0-9-]+)/i);
      const libraryId = match ? match[1] : '';
      const videoId = match ? match[2] : '';

      // Спробувати спарсити content-src та poster з embed сторінки
      let playlistUrl: string | null = null;
      let posterUrl: string | null = null;

      try {
        const res = await httpRequest(trimmed, {
          headers: {
            'User-Agent': BUNNY_UA,
            Referer: BUNNY_REFERER,
          },
          timeout: BUNNY_TIMEOUT,
        });

        const html = typeof res.data === 'string' ? res.data : '';
        const parsed = parseBunnyEmbedHtml(html);
        playlistUrl = parsed.playlistUrl;
        posterUrl = parsed.posterUrl;
      } catch {
        // Якщо запит впав (наприклад, блокування), будуємо fallback або lazy
      }

      // Відомий хост Bunny для library 404113 або дефолтний шаблон
      if (!playlistUrl && libraryId === BUNNY_KNOWN_LIBRARY_ID && videoId) {
        playlistUrl = `${BUNNY_KNOWN_CDN_HOST}/${videoId}/playlist.m3u8`;
      }

      const streamUrl = playlistUrl || buildLazyMasterUrl('bunny', { url: trimmed });

      return {
        sources: [
          buildBunnyEmbedSource({
            streamUrl,
            embedUrl: trimmed,
            id: videoId || libraryId,
            posterUrl,
          }),
        ],
      };
    }

    return null;
  }
}

export const bunnyVod = new BunnyVodExtractor();

export * from './config.js';
export * from './extract.js';
