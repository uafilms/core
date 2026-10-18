/** Заголовки, з якими CDN віддає сторінки плеєра. */
export const TORTUGA_REFERER = 'https://uaserials.com/';
export const TORTUGA_ORIGIN = 'https://uaserials.com';

/** `file:` на /vod/ сторінці (короткий base64). */
export const TORTUGA_VOD_FILE_RE = /file\s*:\s*["']([A-Za-z0-9+/=]+)["']/;
/** `file:` на /embed/ сторінці — довший base64 з JSON-деревом сезонів. */
export const TORTUGA_EMBED_FILE_RE = /file\s*:\s*["']([A-Za-z0-9+/=]{20,})["']/;

export const TORTUGA_POSTER_RE = /poster\s*:\s*["']([A-Za-z0-9+/=]+)["']/;
export const TORTUGA_SUBTITLE_ENCODED_RE = /subtitle\s*:\s*["']([A-Za-z0-9+/=]+)["']/;
export const TORTUGA_SUBTITLE_PLAIN_RE = /subtitle\s*:\s*["']([^"']+)["']/;
