import type { VodExtractionResult } from '../../../types/vod.js';
import {
  extractPlayerjsCommonMeta,
  extractQuotedFileValue,
  parsePlayerjsDubTree,
  parsePlayerjsJson,
  parsePlayerjsSubtitles,
  unescapePlayerjsSlashes,
} from '../shared/playerjs/index.js';

export const parseZetVideoSubtitles = parsePlayerjsSubtitles;

/** Парсинг HTML сторінки Playerjs плеєра ZetVideo. */
export function parseZetVideoPlayerHtml(html: string, _pageUrl: string): VodExtractionResult | null {
  if (!html) return null;

  const { poster, subtitles } = extractPlayerjsCommonMeta(html, unescapePlayerjsSlashes);

  // Playerjs file extraction: can be file:"https://..." or file:'[{"title":...}]' or in new Playerjs({...})
  const fileContent = extractQuotedFileValue(html, { playerjsConfig: true });
  if (!fileContent) return null;

  const cleanedFile = unescapePlayerjsSlashes(fileContent);

  // Direct m3u8 / mp4 URL
  if (/^https?:\/\//i.test(cleanedFile.trim())) {
    return {
      sources: [{
        title: 'ZetVideo',
        url: cleanedFile.trim(),
        mime: 'application/x-mpegURL',
        poster: poster || undefined,
        subtitles,
      }],
    };
  }

  const parsed = parsePlayerjsJson(cleanedFile);
  if (!parsed) return null;

  return parsePlayerjsDubTree(parsed, {
    defaultTitle: 'ZetVideo',
    seasonRe: /(?:сезон|season)\s*(\d+)/i,
    episodeRe: /(?:серія|серiя|episode|ep|e)\s*(\d+)/i,
    normalizeUrl: unescapePlayerjsSlashes,
    dubFromAnyNode: false,
    trimDubTitle: true,
    sortMovieSources: true,
    fallbackPoster: poster,
    fallbackSubtitles: subtitles,
  });
}
