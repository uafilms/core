/**
 * Константи MoonAnime (moonanime.art).
 */

export const MOON_ORIGIN = 'https://moonanime.art';
export const MOON_REFERER = 'https://moonanime.art/';
export const MOON_VOD_BASE = 'https://moonanime.art/vod';
export const MOON_ANIMEON_REFERER = 'https://animeon.club/';
export const MOON_SOURCE_TITLE = 'MoonAnime';
export const MOON_DEFAULT_QUALITY = '1080p';
export const MOON_FETCH_TIMEOUT = 12000;

export const MOON_HEADERS: Record<string, string> = {
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
