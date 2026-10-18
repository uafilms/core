import * as cheerio from 'cheerio';
import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { ashdiVod } from '../ashdi/main.js';
import { tortugaVod } from '../tortuga/main.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import { parseBambooPlaylist, type BambooPlaylistItem } from './extract.js';
import {
  BAMBOO_ORIGIN,
  BAMBOO_PLAYLIST_RE,
  BAMBOO_QUALITY,
  BAMBOO_REFERER,
  BAMBOO_SPONSOR_PLACEHOLDER,
} from './config.js';

export class BambooVodExtractor implements VodExtractor {
  readonly name = 'bamboo';

  /**
   * Extracts media streams from a direct Bamboo CDN URL, Bamboo page URL, or raw HTML/JSON.
   */
  async extract(urlOrContent: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!urlOrContent) return null;

    const trimmed = urlOrContent.trim();

    // Case 1: Raw JSON playlist string
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const raw = JSON.parse(trimmed) as BambooPlaylistItem[];
        const res = parseBambooPlaylist(raw);
        return res;
      } catch {
        // Continue to other extraction paths
      }
    }

    // Case 2: Direct Bamboo CDN stream URL (e.g., https://ongoing2.bambooua.com/.../index.m3u8)
    if (
      !trimmed.includes('<') &&
      (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
      trimmed.includes('bambooua.com') &&
      (trimmed.includes('.m3u8') || (trimmed.includes('.mp4') && !trimmed.includes(BAMBOO_SPONSOR_PLACEHOLDER)))
    ) {
      return {
        sources: [
          {
            title: 'Original',
            quality: BAMBOO_QUALITY,
            url: trimmed,
            audio: 'Original',
            headers: {
              Referer: BAMBOO_REFERER,
              Origin: BAMBOO_ORIGIN,
            },
            lazy: {
              cdn: 'bamboo',
              type: 'hls',
              id: trimmed,
              url: buildLazyMasterUrl('bamboo', { url: trimmed }),
            },
          },
        ],
      };
    }

    // Case 3: Bamboo web page URL or raw HTML
    let html = '';
    let pageUrl = '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      pageUrl = trimmed;
      try {
        html = await getHtml(trimmed, {
          signal: options.signal,
          headers: {
            Referer: BAMBOO_REFERER,
          },
        });
      } catch (e: any) {
        if (e.name === 'CanceledError' || options.signal?.aborted) return null;
        return null;
      }
    } else {
      html = trimmed;
    }

    if (!html) return null;

    // 1. Try extracting embedded PlayerJS playlist: const playlist = [...];
    const playlistMatch = html.match(BAMBOO_PLAYLIST_RE);
    if (playlistMatch) {
      try {
        const raw = JSON.parse(playlistMatch[1]) as BambooPlaylistItem[];
        const parsed = parseBambooPlaylist(raw);
        if (parsed.sources?.length || parsed.seasons?.length) {
          return parsed;
        }
      } catch {
        // Skip on parse error
      }
    }

    // 2. Fallback: check if page contains an Ashdi or Tortuga iframe
    const $ = cheerio.load(html);
    const iframes = $('iframe')
      .map((_, el) => $(el).attr('src'))
      .get()
      .filter((src): src is string => Boolean(src));

    for (const src of iframes) {
      if (src.includes('ashdi') || src.includes('0yql3tj') || src.includes('oyql3tj')) {
        const fullSrc = src.startsWith('//') ? `https:${src}` : src;
        const res = await ashdiVod.extract(fullSrc, {
          ...options,
          referer: pageUrl || BAMBOO_REFERER,
        });
        if (res && (res.sources?.length || res.seasons?.length)) {
          return res;
        }
      } else if (src.includes('tortuga') || src.includes('/vod/') || src.includes('/embed/')) {
        const fullSrc = src.startsWith('//') ? `https:${src}` : src;
        const res = await tortugaVod.extract(fullSrc, {
          ...options,
          referer: pageUrl || BAMBOO_REFERER,
        });
        if (res && (res.sources?.length || res.seasons?.length)) {
          return res;
        }
      }
    }

    return null;
  }
}

export const bambooVod = new BambooVodExtractor();

export * from './config.js';
export * from './extract.js';
