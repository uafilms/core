import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../types/vod.js';
import type { StreamSource } from '../../types/media.js';
import { httpRequest } from '../../utils/http.js';
import { decryptMoonAnimeIframe } from './decrypt.js';

export const MOON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Priority': 'u=0, i',
  'Pragma': 'no-cache',
  'Cache-Control': 'no-cache',
  'TE': 'trailers',
};

export class MoonAnimeVodExtractor implements VodExtractor {
  readonly name = 'moonanime';

  async extract(url: string, options?: VodExtractionOptions): Promise<VodExtractionResult | null> {
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Case 1: Raw decrypted string passed directly (e.g. [1080p]url,[720p]url or direct M3U8)
    if (trimmed.includes('[') && trimmed.includes(']') && trimmed.includes('http')) {
      return this.parseQualities(trimmed);
    }

    if (trimmed.endsWith('.m3u8') || trimmed.includes('.m3u8?')) {
      return {
        sources: [{
          title: 'MoonAnime',
          quality: '1080p',
          url: `/master.m3u8?cdn=moonanime&url=${encodeURIComponent(trimmed)}`,
          mime: 'application/x-mpegURL',
          headers: {
            Origin: 'https://moonanime.art',
            Referer: 'https://moonanime.art/',
          },
          lazy: {
            cdn: 'moonanime',
            type: 'vod',
            id: trimmed,
            url: trimmed,
          },
        }],
      };
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
        timeout: 12000,
      });

      if (!res.data || typeof res.data !== 'string') return null;

      const decrypted = decryptMoonAnimeIframe(res.data);
      if (!decrypted || !decrypted.file) return null;

      const file = decrypted.file;

      if (file.includes('[') && file.includes(']')) {
        return this.parseQualities(file, decrypted.poster);
      }

      // Single M3U8 or stream URL
      return {
        sources: [{
          title: 'MoonAnime',
          quality: '1080p',
          url: `/master.m3u8?cdn=moonanime&url=${encodeURIComponent(file)}`,
          mime: 'application/x-mpegURL',
          poster: decrypted.poster,
          headers: {
            Origin: 'https://moonanime.art',
            Referer: 'https://moonanime.art/',
          },
          lazy: {
            cdn: 'moonanime',
            type: 'vod',
            id: file,
            url: file,
          },
        }],
      };
    } catch {
      return null;
    }
  }

  private parseQualities(qualitiesStr: string, poster?: string): VodExtractionResult {
    const sources: StreamSource[] = [];
    const parts = qualitiesStr.split(',');

    for (const part of parts) {
      const match = part.match(/\[([^\]]+)\](https?:\/\/.+)/);
      if (!match) continue;

      const qRaw = match[1].trim();
      const streamUrl = match[2].trim();
      const quality = qRaw.endsWith('p') ? qRaw : `${qRaw}p`;

      sources.push({
        title: `MoonAnime (${quality})`,
        quality,
        url: `/master.m3u8?cdn=moonanime&url=${encodeURIComponent(streamUrl)}`,
        mime: streamUrl.includes('.webm') ? 'video/webm' : 'application/x-mpegURL',
        poster,
        headers: {
          Origin: 'https://moonanime.art',
          Referer: 'https://moonanime.art/',
        },
        lazy: {
          cdn: 'moonanime',
          type: 'vod',
          id: streamUrl,
          url: streamUrl,
        },
      });
    }

    return { sources };
  }
}

export const moonAnimeVod = new MoonAnimeVodExtractor();
