import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../types/vod.js';
import { httpRequest } from '../utils/http.js';
import { tortugaVod } from './tortuga/main.js';
import { ashdiVod } from './ashdi/main.js';
import { hdvbVod } from './hdvb/main.js';
import { bambooVod } from './bamboo/main.js';
import { moonAnimeVod } from './moonanime/main.js';
import { frankoVod } from './franko/main.js';
import { bunnyVod } from './bunny/main.js';
import { aniWorldVod } from './aniworld/main.js';
import { zetvideoVod } from './zetvideo/main.js';

export { tortugaVod } from './tortuga/main.js';
export { ashdiVod } from './ashdi/main.js';
export { hdvbVod } from './hdvb/main.js';
export { bambooVod } from './bamboo/main.js';
export { moonAnimeVod } from './moonanime/main.js';
export { frankoVod, resolveFrankoFile } from './franko/main.js';
export { bunnyVod } from './bunny/main.js';
export { aniWorldVod } from './aniworld/main.js';
export { zetvideoVod } from './zetvideo/main.js';

export const vodExtractors: VodExtractor[] = [
  tortugaVod,
  ashdiVod,
  hdvbVod,
  bambooVod,
  moonAnimeVod,
  frankoVod,
  bunnyVod,
  aniWorldVod,
  zetvideoVod,
];

/**
 * Автоматично визначає потрібний VOD екстрактор за URL
 */
export async function extractVod(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
  if (!url) return null;

  // 1. Якщо явно вказано параметр cdn, викликаємо ВИКЛЮЧНО відповідний екстрактор
  if (url.includes('cdn=')) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
      const explicitCdn = parsed.searchParams.get('cdn');
      if (explicitCdn && explicitCdn.toLowerCase() !== 'animeon') {
        const targetExtractor = vodExtractors.find(e => e.name.toLowerCase() === explicitCdn.toLowerCase());
        if (targetExtractor) {
          try {
            return await targetExtractor.extract(url, options);
          } catch {
            return null;
          }
        }
      }
    } catch {
      // fallback
    }
  }

  // Якщо передали наш proxy URL з параметром url
  if (url.includes('/master.m3u8') && url.includes('url=')) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
      const innerUrl = parsed.searchParams.get('url');
      if (innerUrl) {
        const decodedInner = decodeURIComponent(innerUrl);

        // Animeon club player episode API check
        if (decodedInner.includes('animeon.club/api/player/')) {
          try {
            const apiRes = await httpRequest<{ videoUrl?: string }>(decodedInner, {
              headers: {
                Referer: 'https://animeon.club/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              },
            });
            if (apiRes.data?.videoUrl) {
              return extractVod(apiRes.data.videoUrl, options);
            }
          } catch {
            // fallback
          }
        }

        // Якщо це вже прямий m3u8 стрім (і не наш проксі)
        if (decodedInner.includes('.m3u8') && !decodedInner.includes('/master.m3u8')) {
          return {
            sources: [{
              title: 'Stream',
              url: decodedInner,
              mime: 'application/x-mpegURL',
            }],
          };
        }
        // Інакше рекурсивно витягуємо внутрішній URL (наприклад iframe / embed)
        return extractVod(decodedInner, options);
      }
    } catch {
      // fallback to normal resolution
    }
  }

  // Якщо передали прямий URL на animeon API
  if (url.includes('animeon.club/api/player/')) {
    try {
      const apiRes = await httpRequest<{ videoUrl?: string }>(url, {
        headers: {
          Referer: 'https://animeon.club/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });
      if (apiRes.data?.videoUrl) {
        return extractVod(apiRes.data.videoUrl, options);
      }
    } catch {
      // fallback
    }
  }

  // Точний збіг по cdn query param
  if (url.includes('cdn=aniworld') || url.includes('/catalog/episode/')) {
    const res = await aniWorldVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=bunny') || url.includes('mediadelivery.net') || url.includes('b-cdn.net')) {
    const res = await bunnyVod.extract(url, options);
    if (res) return res;
  }

  if (
    url.includes('cdn=franko') ||
    url.includes('franko') ||
    url.includes('factorios.live') ||
    url.includes('uacdn.online')
  ) {
    const res = await frankoVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=moonanime') || url.includes('moonanime') || url.includes('mooncdn') || url.includes('s.moonanime')) {
    const res = await moonAnimeVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=bamboo') || url.includes('bambooua') || url.includes('friends.bambooua') || (url.includes('bambooua.com') && url.includes('hls'))) {
    const res = await bambooVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=hdvb') || url.includes('hdvbua') || url.includes('vidcache')) {
    const res = await hdvbVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=ashdi') || url.includes('ashdi.vip') || url.includes('0yql3tj') || url.includes('oyql3tj')) {
    const res = await ashdiVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=zetvideo') || url.includes('zetvideo.net')) {
    const res = await zetvideoVod.extract(url, options);
    if (res) return res;
  }

  if (url.includes('cdn=tortuga') || url.includes('tortuga.tw')) {
    const res = await tortugaVod.extract(url, options);
    if (res) return res;
  }

  // Спробувати всі інші по черзі
  for (const extractor of vodExtractors) {
    try {
      const res = await extractor.extract(url, options);
      if (res) return res;
    } catch {
      continue;
    }
  }

  return null;
}

export * from './tortuga/main.js';
export * from './ashdi/main.js';
export * from './hdvb/main.js';
export * from './bunny/main.js';
export * from './aniworld/main.js';
