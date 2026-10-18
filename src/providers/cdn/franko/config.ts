/** Константи та запити CDN Franko */

export const FRANKO_BASE_URL = 'https://franko.uacdn.online';
export const FRANKO_ORIGIN = 'https://franko.uacdn.online';
export const FRANKO_REFERER = 'https://uakino.watch/';
export const FRANKO_FILES_URL = `${FRANKO_BASE_URL}/api/player/files`;

export const FRANKO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const FRANKO_SHOW_TIMEOUT = 10000;
export const FRANKO_FILES_TIMEOUT = 10000;
export const FRANKO_TRANSLATION_TIMEOUT = 5000;

export const FRANKO_QUALITY = '1080p';
export const FRANKO_MIME = 'application/x-mpegURL';
export const FRANKO_SOURCE_TITLE = 'Franko';

export const FRANKO_PLAYER_PAYLOAD_RE = /window\.__PLAYER_PAYLOAD__\s*=\s*(\{[\s\S]*?\});/;
export const FRANKO_TOKEN_RE = /"player_files_token"\s*:\s*"([^"]+)"/;
export const FRANKO_SHOW_ID_RE = /franko\.uacdn\.online\/show\/(\d+)/;
