import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../types/vod.js';
import { runWithProvider } from '../../utils/proxyManager.js';
import { fetchAnimeonEpisodeVideoUrl, fetchAnimeonPlayerUrl } from './shared/animeon.js';
import { tortugaVod } from './tortuga/main.js';
import { ashdiVod } from './ashdi/main.js';
import { hdvbVod } from './hdvb/main.js';
import { bambooVod } from './bamboo/main.js';
import { moonAnimeVod } from './moonanime/main.js';
import { bunnyVod } from './bunny/main.js';
import { aniWorldVod } from './aniworld/main.js';
import { zetvideoVod } from './zetvideo/main.js';
import { fenixVod } from './fenix/main.js';
import { dawnVod } from './dawn/main.js';
import { uakinoAxVod } from './uakinoax/main.js';
import { ufdubVod } from './ufdub/main.js';
import { sniplyoVod } from './sniplyo/main.js';

export { tortugaVod } from './tortuga/main.js';
export { ashdiVod } from './ashdi/main.js';
export { hdvbVod } from './hdvb/main.js';
export { bambooVod } from './bamboo/main.js';
export { moonAnimeVod } from './moonanime/main.js';
export { frankoVod, resolveFrankoFile } from './franko/main.js';
export { bunnyVod } from './bunny/main.js';
export { aniWorldVod } from './aniworld/main.js';
export { zetvideoVod } from './zetvideo/main.js';
export { fenixVod, buildFenixMergedManifest } from './fenix/main.js';
export { dawnVod } from './dawn/main.js';
export { uakinoAxVod, stripUakinoAxIntro } from './uakinoax/main.js';
export { ufdubVod } from './ufdub/main.js';
export { sniplyoVod } from './sniplyo/main.js';
export { playUakinoAx, findUakinoAxMovie, uakinoAxVoiceCdnId } from './uakinoax/api.js';
export { getCdnStreamHeaders, getCdnSubtitleHeaders, getCdnSegmentHeaders } from './headers.js';
export { resolveDirectVideoUrl } from './video.js';

export const vodExtractors: VodExtractor[] = [
  tortugaVod,
  ashdiVod,
  hdvbVod,
  bambooVod,
  moonAnimeVod,
  bunnyVod,
  aniWorldVod,
  zetvideoVod,
  fenixVod,
  dawnVod,
  uakinoAxVod,
  ufdubVod,
  sniplyoVod,
];

/**
 * Автоматично визначає потрібний VOD екстрактор за URL
 */
export async function extractVod(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
  if (!url) return null;

  // 1. Якщо явно вказано параметр cdn або type=animeon, викликаємо відповідний екстрактор
  if (url.includes('cdn=') || url.includes('type=animeon')) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
      const explicitCdn = parsed.searchParams.get('cdn');
      const explicitType = parsed.searchParams.get('type')?.toLowerCase();

      // Dawn віддається як cdn=moonanime&type=dawn (рестрім тієї ж бібліотеки),
      // тому за самим cdn його не знайти — потрібна явна гілка.
      if (explicitType === 'dawn') {
        const res = await runWithProvider(dawnVod.name, () => dawnVod.extract(url, options));
        if (res) return res;
        return null;
      }

      // Якщо cdn задано явно (і це не animeon), спершу даємо шанс самому екстрактору:
      // fenix/ashdi самі вміють розкривати type=animeon і зберігають додаткові параметри
      // (напр. voice) — через резолв в animeon API вони б загубилися.
      if (explicitCdn && explicitCdn.toLowerCase() !== 'animeon') {
        const directExtractor = vodExtractors.find(e => e.name.toLowerCase() === explicitCdn.toLowerCase());
        if (directExtractor) {
          try {
            const res = await runWithProvider(directExtractor.name, () => directExtractor.extract(url, options));
            if (res) return res;
          } catch {
            // ігноруємо — нижче спрацює загальний шлях через animeon API
          }
        }
      }

      if (explicitType === 'animeon' || explicitCdn?.toLowerCase() === 'animeon') {
        const epId = parsed.searchParams.get('id') || parsed.searchParams.get('episodeId');
        if (epId) {
          const videoUrl = await fetchAnimeonEpisodeVideoUrl(epId, { signal: options.signal, timeout: 8000 });
          if (videoUrl) {
            return extractVod(videoUrl, options);
          }
        }
        return null;
      }

      if (explicitCdn) {
        const lowerCdn = explicitCdn.toLowerCase();
        const targetExtractor = vodExtractors.find(e => e.name.toLowerCase() === lowerCdn);
        if (targetExtractor) {
          try {
            return await runWithProvider(targetExtractor.name, () => targetExtractor.extract(url, options));
          } catch {
            return null;
          }
        }
        return null;
      }
    } catch {
      return null;
    }
  }


  // Якщо передали наш proxy URL з параметром url або id
  if (url.includes('/master.m3u8')) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
      const explicitType = parsed.searchParams.get('type')?.toLowerCase();
      const explicitCdn = parsed.searchParams.get('cdn')?.toLowerCase();

      if (explicitType === 'animeon' || explicitCdn === 'animeon') {
        const epId = parsed.searchParams.get('id') || parsed.searchParams.get('episodeId');
        if (epId) {
          const videoUrl = await fetchAnimeonEpisodeVideoUrl(epId, { signal: options.signal, timeout: 8000 });
          if (videoUrl) {
            return extractVod(videoUrl, options);
          }
        }
        return null;
      }

      const innerUrl = parsed.searchParams.get('url') || (parsed.searchParams.get('id')?.startsWith('http') ? parsed.searchParams.get('id') : null);
      if (innerUrl) {
        const decodedInner = decodeURIComponent(innerUrl);

        // Animeon club player episode API check
        if (decodedInner.includes('animeon.club/api/player/')) {
          try {
            const videoUrl = await fetchAnimeonPlayerUrl(decodedInner, { timeout: 12000 });
            if (videoUrl) {
              return extractVod(videoUrl, options);
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
      const videoUrl = await fetchAnimeonPlayerUrl(url, { timeout: 12000 });
      if (videoUrl) {
        return extractVod(videoUrl, options);
      }
    } catch {
      // fallback
    }
  }

  // Точний збіг по cdn query param
  if (url.includes('cdn=aniworld') || url.includes('/catalog/episode/')) {
    const res = await runWithProvider(aniWorldVod.name, () => aniWorldVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=bunny') || url.includes('mediadelivery.net') || url.includes('b-cdn.net')) {
    const res = await runWithProvider(bunnyVod.name, () => bunnyVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=fenix') || url.includes('fenixplay.xyz')) {
    const res = await runWithProvider(fenixVod.name, () => fenixVod.extract(url, options));
    if (res) return res;
  }

  // Dawn — приватний CDN mikai.me поверх тієї ж бібліотеки, що й moonanime
  if (url.includes('cdn=dawn') || url.includes('type=dawn')) {
    const res = await runWithProvider(dawnVod.name, () => dawnVod.extract(url, options));
    if (res) return res;
  }

  // Franko disabled: upstream (franko.uacdn.online) now requires a Cloudflare
  // Turnstile token on POST /api/player/files and returns 403 "captcha failed" without it.
  // The extractor stays in ./franko/main.ts; re-add `frankoVod` to vodExtractors
  // (and this detection branch) to re-enable it.

  if (
    url.includes('cdn=moonanime') ||
    (!url.includes('/master.m3u8') && (url.includes('moonanime') || url.includes('mooncdn') || url.includes('s.moonanime')))
  ) {
    const res = await runWithProvider(moonAnimeVod.name, () => moonAnimeVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=bamboo') || url.includes('bambooua') || url.includes('friends.bambooua') || (url.includes('bambooua.com') && url.includes('hls'))) {
    const res = await runWithProvider(bambooVod.name, () => bambooVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=hdvb') || url.includes('hdvbua') || url.includes('vidcache')) {
    const res = await runWithProvider(hdvbVod.name, () => hdvbVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=ashdi') || url.includes('ashdi.vip') || url.includes('0yql3tj') || url.includes('oyql3tj')) {
    const res = await runWithProvider(ashdiVod.name, () => ashdiVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=zetvideo') || url.includes('zetvideo.net')) {
    const res = await runWithProvider(zetvideoVod.name, () => zetvideoVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=tortuga') || url.includes('tortuga.tw')) {
    const res = await runWithProvider(tortugaVod.name, () => tortugaVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=ufdub') || url.includes('video.ufdub.com') || url.includes('api.ufdub.com') || url.includes('ufdub.com/video/')) {
    const res = await runWithProvider(ufdubVod.name, () => ufdubVod.extract(url, options));
    if (res) return res;
  }

  if (url.includes('cdn=sniplyo') || url.includes('sniplyo.online') || url.includes('creavio.online')) {
    const res = await runWithProvider(sniplyoVod.name, () => sniplyoVod.extract(url, options));
    if (res) return res;
  }

  // Спробувати всі інші по черзі
  for (const extractor of vodExtractors) {
    try {
      const res = await runWithProvider(extractor.name, () => extractor.extract(url, options));
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
export * from './ufdub/main.js';
export * from './sniplyo/main.js';
