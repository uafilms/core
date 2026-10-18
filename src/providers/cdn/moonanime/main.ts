import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { httpRequest } from '../../../utils/http.js';
import { fetchAnimeonEpisodeVideoUrl } from '../shared/animeon.js';
import { MOON_FETCH_TIMEOUT, MOON_HEADERS, MOON_ORIGIN, MOON_VOD_BASE } from './config.js';
import { buildMoonAnimeSource, decryptMoonAnimeIframe, parseMoonAnimeQualities } from './extract.js';

export class MoonAnimeVodExtractor implements VodExtractor {
  readonly name = 'moonanime';

  async extract(url: string, options?: VodExtractionOptions): Promise<VodExtractionResult | null> {
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Case 0: If proxy URL with url= or id= was passed, unwrap it
    if (trimmed.includes('/master.m3u8')) {
      try {
        const u = new URL(trimmed.startsWith('http') ? trimmed : `http://localhost${trimmed}`);
        if (u.searchParams.get('type') === 'animeon') {
          const epId = u.searchParams.get('id') || u.searchParams.get('episodeId');
          if (epId) {
            const videoUrl = await fetchAnimeonEpisodeVideoUrl(epId, { signal: options?.signal, timeout: 8000 });
            if (videoUrl) {
              return this.extract(videoUrl, options);
            }
          }
          return null;
        }

        if (u.searchParams.get('type') === 'iframe') {
          const slug = u.searchParams.get('id');
          if (!slug) return null;
          const suffix = slug.includes('?') || slug.endsWith('/') ? slug : `${slug}/`;
          return this.extract(`${MOON_ORIGIN}/iframe/${suffix}`, options);
        }

        const inner = u.searchParams.get('url') || u.searchParams.get('id');
        if (inner) {
          const decoded = decodeURIComponent(inner);
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
            return this.extract(decoded, options);
          }
          if (u.searchParams.get('type') === 'vod' || !u.searchParams.get('type')) {
            return this.extract(`${MOON_VOD_BASE}/${decoded}`, options);
          }
        }
      } catch {}
      return null;
    }

    // Case 1: Raw decrypted string passed directly (e.g. [1080p]url,[720p]url or direct M3U8)
    if (trimmed.includes('[') && trimmed.includes(']') && trimmed.includes('http')) {
      return parseMoonAnimeQualities(trimmed);
    }

    if (trimmed.endsWith('.m3u8') || trimmed.includes('.m3u8?')) {
      return buildMoonAnimeSource(trimmed);
    }

    // Case 2: Iframe or VOD URL
    const targetUrl = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    const referer = options?.referer || (targetUrl.includes('animeon.club') ? 'https://animeon.club/' : 'https://moonanime.art/');

    try {
      const res = await httpRequest<string>(targetUrl, {
        headers: {
          ...MOON_HEADERS,
          Referer: referer,
          ...(options?.headers || {}),
        },
        signal: options?.signal,
        timeout: MOON_FETCH_TIMEOUT,
      });

      if (!res.data || typeof res.data !== 'string') return null;

      const decrypted = decryptMoonAnimeIframe(res.data);
      if (!decrypted || !decrypted.file) return null;

      const file = decrypted.file;

      if (file.includes('[') && file.includes(']')) {
        return parseMoonAnimeQualities(file, decrypted.poster, decrypted.subtitle);
      }

      // Single M3U8 or stream URL
      return buildMoonAnimeSource(file, decrypted.poster, decrypted.subtitle);
    } catch {
      return null;
    }
  }
}

export const moonAnimeVod = new MoonAnimeVodExtractor();

export * from './config.js';
export * from './decrypt.js';
export * from './extract.js';
