import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { parseHdvbPlayerHtml, normalizeHdvbUrl } from './extract.js';
import { HDVB_HOST_HINT, HDVB_REFERER } from './config.js';

export class HdvbVodExtractor implements VodExtractor {
  readonly name = 'hdvb';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes /master.m3u8?cdn=hdvb&url=...
    if (targetUrl.includes('cdn=hdvb') || (targetUrl.includes('/master.m3u8') && !targetUrl.includes('cdn='))) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        }
      } catch {
        // ignore
      }
    }

    const normalizedUrl = normalizeHdvbUrl(targetUrl);

    // Якщо це прямий m3u8 (і не наш проксі)
    if (normalizedUrl.includes('.m3u8') && !normalizedUrl.includes('/master.m3u8')) {
      return {
        sources: [{
          title: 'HDVB',
          url: normalizedUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    try {
      const referer = options.referer || (normalizedUrl.includes(HDVB_HOST_HINT) ? HDVB_REFERER : undefined);
      const html = await getHtml(normalizedUrl, {
        signal: options.signal,
        headers: {
          ...(referer ? { 'Referer': referer } : {}),
          ...options.headers,
        },
      });

      return this.parsePlayerHtml(html, normalizedUrl);
    } catch {
      return null;
    }
  }

  parsePlayerHtml(html: string, pageUrl: string): VodExtractionResult | null {
    return parseHdvbPlayerHtml(html, pageUrl);
  }
}

export const hdvbVod = new HdvbVodExtractor();

export * from './config.js';
export * from './extract.js';
