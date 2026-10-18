import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../../types/vod.js';
import { buildDawnSource, fetchDawnVideo, parseDawnLazyUrl } from './extract.js';

export class DawnVodExtractor implements VodExtractor {
  readonly name = 'dawn';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    // 1. Lazy-посилання: /master.m3u8?cdn=moonanime&type=dawn&id=<animeId>:<videoId>
    const route = parseDawnLazyUrl(url.trim());
    if (!route) return null;

    try {
      const video = await fetchDawnVideo(route.animeId, route.videoId, options.signal);
      if (!video) return null;

      return {
        sources: [buildDawnSource({ animeId: route.animeId, videoId: route.videoId, video })],
      };
    } catch {
      return null;
    }
  }
}

export const dawnVod = new DawnVodExtractor();

export * from './config.js';
export * from './extract.js';
