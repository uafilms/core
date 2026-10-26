import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { parseUfdubPlayerHtml } from './extract.js';
import { UFDUB_REFERER, UFDUB_UA } from './config.js';

export class UfdubVodExtractor implements VodExtractor {
  readonly name = 'ufdub';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes вигляду /master.m3u8?cdn=ufdub&id=451 або /video.mp4?cdn=ufdub&id=451
    if (targetUrl.includes('cdn=ufdub') || targetUrl.includes('/video.mp4') || targetUrl.includes('/master.m3u8')) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const id = parsed.searchParams.get('id');
          if (id) {
            targetUrl = `https://video.ufdub.com/V2/VP.php?ID=${encodeURIComponent(id)}`;
          }
        }
      } catch {
        // ignore
      }
    }

    if (targetUrl.startsWith('//')) {
      targetUrl = `https:${targetUrl}`;
    }

    // Якщо це прямий MP4 / blob
    if (targetUrl.includes('.mp4') || targetUrl.includes('UFDUB_UPLOAD')) {
      return {
        sources: [{
          title: 'UFDUB',
          url: targetUrl,
          mime: 'video/mp4',
        }],
      };
    }

    try {
      const html = await getHtml(targetUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || UFDUB_REFERER,
          'User-Agent': UFDUB_UA,
          ...options.headers,
        },
      });

      return parseUfdubPlayerHtml(html);
    } catch {
      return null;
    }
  }
}

export const ufdubVod = new UfdubVodExtractor();
export * from './config.js';
export * from './extract.js';
