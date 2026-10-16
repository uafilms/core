import { createHash, randomUUID } from 'node:crypto';
import { httpRequest } from '../../utils/http.js';

/**
 * Клієнт до lampa/tv API сайту uakino.ax (/hls/api/*).
 *
 * Важливо: посилання на маніфест, сегменти та субтитри підписані сервером
 * uakino.ax і прив'язані до IP, з якого був викликаний /hls/api/play.
 * Тому всі подальші запити до cdn.uakino.ax мусять іти з того ж IP (наш проксі),
 * клієнтський браузер не може тягнути сегменти напряму.
 */

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

export interface UakinoAxEpisodeEntry {
  voice: string;
  season: number;
  episode: number;
  title?: string;
}

export interface UakinoAxSubtitleEntry {
  label?: string;
  url: string;
}

export interface UakinoAxPlayResponse {
  movie_id: number;
  voices: string[];
  k4_voices?: string[];
  alt4k?: string;
  is_series: boolean;
  episodes?: UakinoAxEpisodeEntry[];
  current?: { voice?: string; season?: number; episode?: number };
  duration_sec?: number | null;
  manifest: string;
  manifest_abs?: string;
  subs?: UakinoAxSubtitleEntry[];
  intro_len?: number;
  intro_drop?: number;
  intro_trim?: number;
  intro_sec?: number;
  mode?: string;
  expires_in?: number;
}

export interface UakinoAxFindResponse {
  found: boolean;
  movie_id?: number;
  title?: string;
  origin_name?: string | null;
  year?: number | null;
  type?: 'film' | 'series';
  is_series?: boolean;
}

export interface UakinoAxPlayOptions {
  movieId: string | number;
  voice?: string;
  season?: number;
  episode?: number;
  signal?: AbortSignal;
}

// Свіжі токени тримаємо недовго: вони живуть 12 год, але краще перезапитувати
// частіше, ніж віддати клієнту протермінований маніфест.
const playCache = new Map<string, { value: UakinoAxPlayResponse; timestamp: number }>();
const PLAY_CACHE_TTL = 10 * 60 * 1000;

/**
 * Отримує підписаний маніфест HLS для фільму/серії (lampa API).
 */
export async function playUakinoAx(options: UakinoAxPlayOptions): Promise<UakinoAxPlayResponse | null> {
  const movieId = String(options.movieId ?? '').trim();
  if (!/^\d+$/.test(movieId)) return null;

  const cacheKey = [movieId, options.voice ?? '', options.season ?? '', options.episode ?? ''].join('|');
  const cached = playCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PLAY_CACHE_TTL) {
    return cached.value;
  }

  try {
    const url = new URL(`${UAKINO_AX_HLS_BASE}/play`);
    url.searchParams.set('movie', movieId);
    url.searchParams.set('s', UAKINO_AX_DEVICE_ID);
    url.searchParams.set('hevc', '0');
    if (options.voice) url.searchParams.set('voice', options.voice);
    if (options.season) url.searchParams.set('season', String(options.season));
    if (options.episode) url.searchParams.set('episode', String(options.episode));

    const res = await httpRequest<UakinoAxPlayResponse>(url.toString(), {
      headers: UAKINO_AX_HEADERS,
      signal: options.signal,
      timeout: 10000,
    });

    const data = res.data;
    if (!data?.manifest) return null;

    playCache.set(cacheKey, { value: data, timestamp: Date.now() });
    return data;
  } catch {
    return null;
  }
}

/**
 * Шукає фільм на uakino.ax за TMDB/IMDb ідентифікатором (lampa API /find).
 */
export async function findUakinoAxMovie(
  params: {
    tmdbId?: string | number;
    imdbId?: string;
    title?: string;
    originalTitle?: string;
    year?: number;
    type?: string;
  },
  signal?: AbortSignal
): Promise<UakinoAxFindResponse | null> {
  const tmdbId = params.tmdbId ? String(params.tmdbId).replace(/\D/g, '') : '';
  const imdbId = params.imdbId?.trim();
  if (!tmdbId && !imdbId) return null;

  try {
    const url = new URL(`${UAKINO_AX_HLS_BASE}/lampa/find`);
    if (tmdbId) url.searchParams.set('tmdb', tmdbId);
    if (imdbId) url.searchParams.set('imdb', imdbId);
    if (params.type === 'movie') url.searchParams.set('type', 'movie');
    else if (params.type === 'tv') url.searchParams.set('type', 'tv');
    if (params.year) url.searchParams.set('year', String(params.year));
    if (params.title) url.searchParams.set('title', params.title);
    if (params.originalTitle) url.searchParams.set('orig', params.originalTitle);

    const res = await httpRequest<UakinoAxFindResponse>(url.toString(), {
      headers: UAKINO_AX_HEADERS,
      signal,
      timeout: 10000,
    });

    const data = res.data;
    if (!data?.found || !data.movie_id) return null;
    return data;
  } catch {
    return null;
  }
}

/** Slug озвучки для унікального id CDN (detectCdn дедуплікує джерела за id). */
export function uakinoAxVoiceSlug(voice: string): string {
  return voice
    .toLowerCase()
    .replace(/['’`ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Унікальний id CDN для озвучки, щоб усі дубляжі потрапили у відповідь API. */
export function uakinoAxVoiceCdnId(voice?: string): string {
  if (!voice) return 'uakino-ax';
  const slug = uakinoAxVoiceSlug(voice);
  if (slug) return `uakino-ax-${slug}`;
  // Озвучки з нелатинськими назвами (напр. "Мова жестів") отримують стабільний хеш
  const digest = createHash('sha1').update(voice).digest('hex').slice(0, 8);
  return `uakino-ax-${digest}`;
}
