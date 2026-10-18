import { randomUUID } from 'node:crypto';

export const UAKINO_AX_BASE = 'https://uakino.ax';
export const UAKINO_AX_HLS_BASE = `${UAKINO_AX_BASE}/hls/api`;

export const UAKINO_AX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const UAKINO_AX_HEADERS: Record<string, string> = {
  'User-Agent': UAKINO_AX_UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
};

/**
 * Ідентифікатор пристрою/сесії, який очікує lampa API (параметр s).
 * Стабільний у межах процесу, щоб не плодити нові сесії на кожен запит.
 */
export const UAKINO_AX_DEVICE_ID =
  process.env.UAKINO_AX_DEVICE_ID?.trim() || `uafilms-${randomUUID().slice(0, 8)}`;

export const UAKINO_AX_PLAY_TIMEOUT = 10000;
export const UAKINO_AX_FIND_TIMEOUT = 10000;

// Свіжі токени тримаємо недовго: вони живуть 12 год, але краще перезапитувати
// частіше, ніж віддати клієнту протермінований маніфест.
export const UAKINO_AX_PLAY_CACHE_TTL = 10 * 60 * 1000;

export const UAKINO_AX_INTRO_SEGMENT_RE = /\/intro(\/|$)/i;
export const UAKINO_AX_MOVIE_ID_RE = /^\d+$/;
export const UAKINO_AX_EPISODE_ID_RE = /^s?(\d+)[ex](\d+)$/i;

export const UAKINO_AX_MIME = 'application/x-mpegURL';
export const UAKINO_AX_SOURCE_TITLE = 'UaKinoAX';
export const UAKINO_AX_SUBTITLE_LANG = 'uk';
export const UAKINO_AX_SUBTITLE_LABEL = 'Українські';
