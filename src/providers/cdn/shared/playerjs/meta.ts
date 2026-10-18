import type { Subtitle } from '../../../../types/media.js';
import { parsePlayerjsSubtitles } from './subtitles.js';

/** Постер і субтитри з верхнього рівня HTML — спільні для багатьох Playerjs-сторінок. */
export function extractPlayerjsCommonMeta(
  html: string,
  normalizeUrl: (url: string) => string,
): { poster: string | null; subtitles: Subtitle[] } {
  const posterMatch = html.match(/poster\s*:\s*["']([^"']+)["']/);
  const subMatch = html.match(/subtitle\s*:\s*['"]([^'"]+)['"]/);

  return {
    poster: posterMatch ? normalizeUrl(posterMatch[1]) : null,
    subtitles: subMatch ? parsePlayerjsSubtitles(subMatch[1]) : [],
  };
}
