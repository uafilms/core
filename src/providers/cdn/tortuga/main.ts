import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import type { Season } from '../../../types/media.js';
import { getHtml } from '../../../utils/http.js';
import { parseTortugaEmbed, parseTortugaPlayerHtml, parseTortugaVod } from './extract.js';
import { TORTUGA_ORIGIN, TORTUGA_REFERER } from './config.js';

export class TortugaVodExtractor implements VodExtractor {
  readonly name = 'tortuga';

  /**
   * Головний метод витягування потоків з Tortuga VOD / Embed сторінок
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes вигляду /master.m3u8?cdn=tortuga&type=vod&id=123
    if (targetUrl.includes('cdn=tortuga') || (targetUrl.includes('/master.m3u8') && targetUrl.includes('tortuga'))) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const id = parsed.searchParams.get('id');
          const type = parsed.searchParams.get('type') || 'vod';
          if (id) {
            targetUrl = `https://tortuga.tw/${type}/${id}`;
          }
        }
      } catch {
        // ігноруємо помилку парсингу URL
      }
    }

    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    }

    // Якщо це прямий m3u8
    if (targetUrl.includes('.m3u8') && !targetUrl.includes('/master.m3u8')) {
      return {
        sources: [{
          title: 'Tortuga',
          url: targetUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    try {
      const html = await getHtml(targetUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || TORTUGA_REFERER,
          'Origin': TORTUGA_ORIGIN,
          ...options.headers,
        },
      });

      return parseTortugaPlayerHtml(html, targetUrl);
    } catch {
      return null;
    }
  }

  /**
   * Парсинг фільму (/vod/)
   */
  async parseVod(vodUrl: string, options: VodExtractionOptions = {}): Promise<{ file: string; poster?: string | null; subtitle?: string | null } | null> {
    return parseTortugaVod(vodUrl, options);
  }

  /**
   * Парсинг серіалу (/embed/)
   */
  async parseEmbed(embedUrl: string, options: VodExtractionOptions = {}): Promise<Season[] | null> {
    return parseTortugaEmbed(embedUrl, options);
  }
}

export const tortugaVod = new TortugaVodExtractor();
export * from './config.js';
export * from './extract.js';
export { decodeTortuga } from './decrypt.js';
