import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../types/vod.js';
import type { StreamSource } from '../../types/media.js';
import { httpRequest } from '../../utils/http.js';

export class BunnyVodExtractor implements VodExtractor {
  readonly name = 'bunny';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    const trimmed = url.trim();

    // 1. Пряме HLS посилання на Bunny CDN (*.b-cdn.net/*.m3u8)
    if (trimmed.includes('b-cdn.net') && trimmed.includes('.m3u8')) {
      const source: StreamSource = {
        title: 'BunnyCDN HLS',
        url: trimmed,
        mime: 'application/x-mpegURL',
        lazy: {
          cdn: 'bunny',
          type: 'direct',
          id: trimmed,
          url: trimmed,
        },
      };

      return {
        sources: [source],
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://aniworldua.com/',
          },
          timeout: 4000,
        });

        const html = typeof res.data === 'string' ? res.data : '';
        const m3u8Match = html.match(/content-src="([^"]+\.m3u8)"/) || html.match(/(https?:\/\/[^\s"'<>]+\.b-cdn\.net\/[^\s"'<>]+\.m3u8)/);
        if (m3u8Match) {
          playlistUrl = m3u8Match[1];
        }

        const posterMatch = html.match(/src="(https?:\/\/[^\s"'<>]+\.b-cdn\.net\/[^\s"'<>]+\.jpg)"/);
        if (posterMatch) {
          posterUrl = posterMatch[1];
        }
      } catch {
        // Якщо запит впав (наприклад, блокування), будуємо fallback або lazy
      }

      // Відомий хост Bunny для library 404113 або дефолтний шаблон
      if (!playlistUrl && libraryId === '404113' && videoId) {
        playlistUrl = `https://vz-667cdfa2-2fc.b-cdn.net/${videoId}/playlist.m3u8`;
      }

      const streamUrl = playlistUrl || `/master.m3u8?cdn=bunny&url=${encodeURIComponent(trimmed)}`;

      const source: StreamSource = {
        title: 'BunnyCDN',
        url: streamUrl,
        mime: 'application/x-mpegURL',
        poster: posterUrl || undefined,
        lazy: {
          cdn: 'bunny',
          type: 'embed',
          id: videoId || libraryId,
          url: trimmed,
        },
      };

      return {
        sources: [source],
      };
    }

    return null;
  }
}

export const bunnyVod = new BunnyVodExtractor();
