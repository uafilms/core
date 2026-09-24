import { parsePlayerjsSubtitles } from '../../utils/playerjs.js';

export const parseAshdiSubtitles = parsePlayerjsSubtitles;

/**
 * Розшифрування чи нормалізація обфускованих рядків Ashdi (0yql3tj -> oyql3tj тощо)
 */
export function normalizeAshdiUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/0yql3tj/g, 'oyql3tj');
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  return url;
}
