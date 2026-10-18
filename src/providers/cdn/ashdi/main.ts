import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { fetchAnimeonEpisodeVideoUrl } from '../shared/animeon.js';
import { parseAshdiPlayerHtml, normalizeAshdiUrl } from './extract.js';
import { ASHDI_REFERER, ASHDI_SERIAL_PATH_RE } from './config.js';

export class AshdiVodExtractor implements VodExtractor {
  readonly name = 'ashdi';

  /**
   * Витягує медіа-потоки з посилання на Ashdi плеєр або iframe
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes вигляду /master.m3u8?cdn=ashdi&type=vod&id=123
    if (targetUrl.includes('cdn=ashdi') || (targetUrl.includes('/master.m3u8') && !targetUrl.includes('cdn='))) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        if (parsed.searchParams.get('type') === 'animeon') {
          const epId = parsed.searchParams.get('id') || parsed.searchParams.get('episodeId');
          if (epId) {
            const videoUrl = await fetchAnimeonEpisodeVideoUrl(epId, {
              signal: options?.signal,
              timeout: 8000,
            });
            if (videoUrl) {
              return this.extract(videoUrl, options);
            }
          }
          return null;
        }

        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const id = parsed.searchParams.get('id');
          const type = parsed.searchParams.get('type') || 'vod';
          if (id) {
            targetUrl = `https://ashdi.vip/${type}/${id}`;
          }
        }
      } catch {
        // ігноруємо помилку парсингу URL
      }
    }

    // Видаляємо деструктивні параметри типу geoblock=ua
    try {
      const u = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      if (u.searchParams.has('geoblock')) {
        u.searchParams.delete('geoblock');
        targetUrl = u.toString();
      }
    } catch {
      targetUrl = targetUrl.replace(/([?&])geoblock=[^&]*(&|$)/i, '$1').replace(/[?&]$/, '');
    }

    const normalizedUrl = normalizeAshdiUrl(targetUrl);

    if (normalizedUrl.includes('.m3u8') && !normalizedUrl.includes('/master.m3u8')) {
      return {
        sources: [{
          title: 'Ashdi',
          url: normalizedUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    try {
      let fetchUrl = normalizedUrl;
      try {
        const u = new URL(fetchUrl.startsWith('http') ? fetchUrl : `https://${fetchUrl}`);
        if (u.searchParams.has('geoblock')) {
          u.searchParams.delete('geoblock');
        }
        if (ASHDI_SERIAL_PATH_RE.test(u.pathname)) {
          u.searchParams.delete('season');
          u.searchParams.delete('episode');
          if (!u.searchParams.has('multivoice')) {
            u.searchParams.set('multivoice', '');
          }
          fetchUrl = u.toString().replace(/multivoice=(&|$)/, 'multivoice$1').replace(/\?$/, '');
        } else {
          fetchUrl = u.toString().replace(/\?$/, '');
        }
      } catch {
        // ignore
      }

      const html = await getHtml(fetchUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || ASHDI_REFERER,
          ...options.headers,
        },
      });

      return this.parsePlayerHtml(html, normalizedUrl);
    } catch {
      return null;
    }
  }

  /**
   * Парсинг HTML сторінки плеєра Ashdi
   */
  parsePlayerHtml(html: string, pageUrl: string): VodExtractionResult | null {
    return parseAshdiPlayerHtml(html, pageUrl);
  }
}

export const ashdiVod = new AshdiVodExtractor();

export * from './config.js';
export * from './extract.js';
