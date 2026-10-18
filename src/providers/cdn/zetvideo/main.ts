import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { parseZetVideoPlayerHtml } from './extract.js';
import { ZETVIDEO_BASE_URL, ZETVIDEO_REFERER, ZETVIDEO_UA } from './config.js';

export class ZetVideoVodExtractor implements VodExtractor {
  readonly name = 'zetvideo';

  /**
   * Extracts media streams from ZetVideo player or iframe URL
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Support lazy routes like /master.m3u8?cdn=zetvideo&type=vod&id=123
    if (targetUrl.includes('cdn=zetvideo') || (targetUrl.includes('/master.m3u8') && targetUrl.includes('zetvideo'))) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const id = parsed.searchParams.get('id');
          const type = parsed.searchParams.get('type') || 'vod';
          if (id) {
            targetUrl = `${ZETVIDEO_BASE_URL}/${type}/${id}`;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    }

    if (targetUrl.includes('.m3u8') && !targetUrl.includes('/master.m3u8')) {
      return {
        sources: [{
          title: 'ZetVideo',
          url: targetUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    try {
      const html = await getHtml(targetUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || ZETVIDEO_REFERER,
          'User-Agent': ZETVIDEO_UA,
          ...options.headers,
        },
      });

      return this.parsePlayerHtml(html, targetUrl);
    } catch {
      return null;
    }
  }

  /**
   * Parses HTML of ZetVideo Playerjs page
   */
  parsePlayerHtml(html: string, pageUrl: string): VodExtractionResult | null {
    return parseZetVideoPlayerHtml(html, pageUrl);
  }
}

export const zetvideoVod = new ZetVideoVodExtractor();

export * from './config.js';
export * from './extract.js';
