import type { VodExtractionResult } from '../../../types/vod.js';
import {
  extractPlayerjsCommonMeta,
  extractQuotedFileValue,
  extractFileValueDeep,
  parsePlayerjsDubTree,
  parsePlayerjsJson,
  parsePlayerjsSubtitles,
} from '../shared/playerjs/index.js';
import { ASHDI_BROKEN_CDN_KEY, ASHDI_CDN_KEY } from './config.js';

export const parseAshdiSubtitles = parsePlayerjsSubtitles;

/**
 * Розшифрування чи нормалізація обфускованих рядків Ashdi (0yql3tj -> oyql3tj тощо)
 */
export function normalizeAshdiUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(new RegExp(ASHDI_BROKEN_CDN_KEY, 'g'), ASHDI_CDN_KEY);
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  // Вирізаємо блокуючий параметр geoblock
  if (url.includes('geoblock=')) {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      u.searchParams.delete('geoblock');
      url = u.toString().replace(/\?$/, '');
    } catch {
      url = url.replace(/([?&])geoblock=[^&]*(&|$)/i, '$1').replace(/[?&]$/, '');
    }
  }
  return url;
}

/** Парсинг HTML сторінки плеєра Ashdi. */
export function parseAshdiPlayerHtml(html: string, _pageUrl: string): VodExtractionResult | null {
  const { poster, subtitles } = extractPlayerjsCommonMeta(html, normalizeAshdiUrl);

  const raw = extractQuotedFileValue(html) ?? extractFileValueDeep(html);
  if (!raw) return null;

  const unescaped = raw.replace(/\\'/g, "'").replace(/\\"/g, '"');

  // Прямий лінк
  if (/^https?:\/\//i.test(unescaped)) {
    return {
      sources: [{
        title: 'Ashdi',
        url: normalizeAshdiUrl(unescaped),
        mime: 'application/x-mpegURL',
        poster,
        subtitles,
      }],
    };
  }

  const parsed = parsePlayerjsJson(unescaped);
  if (!parsed) return null;

  return parsePlayerjsDubTree(parsed, {
    defaultTitle: 'Ashdi',
    seasonRe: /(?:season|сезон|s)\s*0*(\d+)|(\d+)\s*(?:-?(?:й|ий|ій)?\s*)?(?:season|сезон)/i,
    episodeRe: /(?:episode|серія|серiя|епізод|ep|e)\s*0*(\d+)|(\d+)\s*(?:-?(?:а|я|тя)?\s*)?(?:серія|серiя|епізод|episode|ep)/i,
    normalizeUrl: normalizeAshdiUrl,
    dubFromAnyNode: true,
    fallbackPoster: poster,
    fallbackSubtitles: subtitles,
  });
}
