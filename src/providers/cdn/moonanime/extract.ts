/**
 * Розбір payload MoonAnime: розшифрований iframe і рядок якостей -> джерела.
 */

import type { StreamSource } from '../../../types/media.js';
import type { VodExtractionResult } from '../../../types/vod.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import { parsePlayerjsSubtitles } from '../shared/playerjs/index.js';
import { MOON_DEFAULT_QUALITY, MOON_ORIGIN, MOON_REFERER, MOON_SOURCE_TITLE } from './config.js';
import { extractDynamicKey, moonInnerDecode, moonOuterDecode } from './decrypt.js';

/** Спільні заголовки запитів до самого потоку (їх також додає проксі в master.ts). */
export function moonStreamHeaders(): Record<string, string> {
  return {
    Origin: MOON_ORIGIN,
    Referer: MOON_REFERER,
  };
}

export function buildMoonAnimeSource(
  file: string,
  poster?: string,
  subtitle?: string,
): VodExtractionResult {
  return {
    sources: [{
      title: MOON_SOURCE_TITLE,
      quality: MOON_DEFAULT_QUALITY,
      url: buildLazyMasterUrl('moonanime', { url: file }),
      mime: 'application/x-mpegURL',
      poster,
      subtitles: subtitle ? parsePlayerjsSubtitles(subtitle) : undefined,
      headers: moonStreamHeaders(),
      lazy: {
        cdn: 'moonanime',
        type: 'vod',
        id: file,
        url: file,
      },
    }],
  };
}

export function parseMoonAnimeQualities(
  qualitiesStr: string,
  poster?: string,
  subtitle?: string,
): VodExtractionResult {
  const sources: StreamSource[] = [];
  const parts = qualitiesStr.split(',');
  const subs = subtitle ? parsePlayerjsSubtitles(subtitle) : undefined;

  for (const part of parts) {
    const match = part.match(/\[([^\]]+)\](https?:\/\/.+)/);
    if (!match) continue;

    const qRaw = match[1].trim();
    const streamUrl = match[2].trim();
    const quality = qRaw.endsWith('p') ? qRaw : `${qRaw}p`;

    sources.push({
      title: `${MOON_SOURCE_TITLE} (${quality})`,
      quality,
      url: buildLazyMasterUrl('moonanime', { url: streamUrl }),
      mime: streamUrl.includes('.webm') ? 'video/webm' : 'application/x-mpegURL',
      poster,
      subtitles: subs,
      headers: moonStreamHeaders(),
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

/** Розшифрований JS плеєра -> `file`/`poster`/`subtitle`. */
export function decryptMoonAnimeIframe(html: string): { file: string; poster?: string; subtitle?: string } | null {
  const decodedJs = moonOuterDecode(html);
  if (!decodedJs) return null;

  const dynKey = extractDynamicKey(decodedJs);

  let fileValue: string | null = null;

  // Pattern 1: Modern MoonAnime format: var rawVideo = _0xd("...");
  const rawVideoEncodedMatch = decodedJs.match(/var\s+rawVideo\s*=\s*_0xd\("([^"]+)"\)/);
  if (rawVideoEncodedMatch) {
    fileValue = moonInnerDecode(rawVideoEncodedMatch[1], dynKey);
  }

  // Pattern 2: Legacy file: _0xd("...")
  if (!fileValue) {
    const fileEncodedMatch = decodedJs.match(/file:\s*_0xd\("([^"]+)"\)/);
    if (fileEncodedMatch) {
      fileValue = moonInnerDecode(fileEncodedMatch[1], dynKey);
    }
  }

  // Pattern 3: Literal var rawVideo = "..." or file: "..."
  if (!fileValue) {
    const rawMatch = decodedJs.match(/(?:var\s+rawVideo\s*=\s*|file:\s*)"([^"]+)"/);
    if (rawMatch) fileValue = rawMatch[1];
  }

  if (!fileValue) return null;

  let poster: string | undefined;

  // Check modern rawPoster = _0xd("...")
  const rawPosterEncodedMatch = decodedJs.match(/var\s+rawPoster\s*=\s*_0xd\("([^"]+)"\)/);
  if (rawPosterEncodedMatch) {
    const decodedPoster = moonInnerDecode(rawPosterEncodedMatch[1], dynKey);
    if (decodedPoster && decodedPoster.startsWith('http')) {
      poster = decodedPoster;
    }
  }

  // Fallback poster check
  if (!poster) {
    const posterMatch = decodedJs.match(/(?:var\s+rawPoster\s*=\s*|poster:\s*)"([^"]+)"/);
    if (posterMatch && posterMatch[1].startsWith('http')) {
      poster = posterMatch[1];
    }
  }

  let subtitle: string | undefined;
  const rawSubEncodedMatch = decodedJs.match(/var\s+rawSubtitle\s*=\s*_0xd\("([^"]+)"\)/) || decodedJs.match(/subtitle:\s*_0xd\("([^"]+)"\)/);
  if (rawSubEncodedMatch) {
    const decodedSub = moonInnerDecode(rawSubEncodedMatch[1], dynKey);
    if (decodedSub) subtitle = decodedSub;
  }
  if (!subtitle) {
    const subMatch = decodedJs.match(/(?:var\s+rawSubtitle\s*=\s*|subtitle:\s*)"([^"]+)"/);
    if (subMatch) subtitle = subMatch[1];
  }

  return { file: fileValue, poster, subtitle };
}
