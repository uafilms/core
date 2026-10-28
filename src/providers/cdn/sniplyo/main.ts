import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { parseSniplyoPlayerHtml } from './extract.js';
import { SNIPLYO_REFERER } from './config.js';

export class SniplyoVodExtractor implements VodExtractor {
  readonly name = 'sniplyo';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes вигляду /video.mp4?cdn=sniplyo&name=... або /master.m3u8?cdn=sniplyo&...
    if (targetUrl.includes('cdn=sniplyo') || targetUrl.includes('/video.mp4') || targetUrl.includes('/master.m3u8')) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const name = parsed.searchParams.get('name');
          const pl = parsed.searchParams.get('pl');
          const id = parsed.searchParams.get('id');
          if (name) {
            targetUrl = `https://sniplyo.online/stream.php?name=${encodeURIComponent(name)}`;
          } else if (pl) {
            targetUrl = `https://sniplyo.online/stream.php?pl=${encodeURIComponent(pl)}`;
          } else if (id) {
            targetUrl = id.startsWith('http')
              ? id
              : `https://sniplyo.online/stream.php?${id.includes('pl=') || id.includes('name=') ? id : `name=${encodeURIComponent(id)}`}`;
          }
        }
      } catch {
        // ignore
      }
    }

    if (targetUrl.startsWith('//')) {
      targetUrl = `https:${targetUrl}`;
    }

    // Якщо це прямий MP4 потік
    if (targetUrl.includes('.mp4') && !targetUrl.includes('stream.php')) {
      return {
        sources: [{
          title: 'Moviestape',
          url: targetUrl,
          mime: 'video/mp4',
          lazy: {
            cdn: 'sniplyo',
            type: 'vod',
            url: targetUrl,
            directUrl: targetUrl,
          },
        }],
      };
    }

    try {
      const html = await getHtml(targetUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || SNIPLYO_REFERER,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...options.headers,
        },
      });

      return parseSniplyoPlayerHtml(html, targetUrl, options);
    } catch {
      return null;
    }
  }
}

export const sniplyoVod = new SniplyoVodExtractor();
export * from './config.js';
export { parseSniplyoPlayerHtml, parseSniplyoFolderTree } from './extract.js';
