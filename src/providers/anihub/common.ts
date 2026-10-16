import { createHash } from 'node:crypto';
import { httpRequest } from '../../utils/http.js';
import type { AniHubAnimeShort, AniHubEpisodeSources, AniHubSearchResponse } from './types.js';

export const ANIHUB_SITE = 'https://anihub.in.ua';
export const ANIHUB_API = `${ANIHUB_SITE}/api`;
export const ANIHUB_PUBLIC_API = 'https://api.anihub.in.ua';

export const ANIHUB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/**
 * Ключ, який клієнт anihub.in.ua рахує на льоту: sha256 від
 * "Ukr@in1anAn1me-S3curity-Key-2025_<YYYY-MM-DD>" (дата UTC).
 * Воркер-ендпоінт /api/anime/<id>/episode-sources без нього віддає 404.
 */
export function anihubApiKey(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return createHash('sha256').update(`Ukr@in1anAn1me-S3curity-Key-2025_${day}`).digest('hex');
}

export function anihubHeaders(): Record<string, string> {
  return {
    'User-Agent': ANIHUB_UA,
    'Accept': 'application/json',
    'X-API-Key': anihubApiKey(),
    'Referer': `${ANIHUB_SITE}/`,
  };
}

export function anihubPoster(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  return `${ANIHUB_SITE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function anihubPageUrl(anime: Pick<AniHubAnimeShort, 'id' | 'slug'>): string {
  return `${ANIHUB_SITE}/anime/${anime.slug || 'anime'}-${anime.id}`;
}

export async function fetchAniHubAnime(id: number | string, signal?: AbortSignal): Promise<AniHubAnimeShort | null> {
  try {
    const res = await httpRequest<AniHubAnimeShort>(`${ANIHUB_PUBLIC_API}/anime/${id}/`, {
      headers: anihubHeaders(),
      signal,
      timeout: 12000,
    });
    return res.data?.id ? res.data : null;
  } catch {
    return null;
  }
}

export interface AniHubSearchParams {
  imdbId?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function searchAniHubAnime(query: string, params: AniHubSearchParams = {}): Promise<AniHubAnimeShort[]> {
  const search = new URLSearchParams();
  if (params.imdbId) search.set('imdb_id', params.imdbId);
  else if (query) search.set('search', query);
  search.set('page_size', String(params.limit ?? 20));

  try {
    const res = await httpRequest<AniHubSearchResponse>(`${ANIHUB_PUBLIC_API}/anime/?${search.toString()}`, {
      headers: anihubHeaders(),
      signal: params.signal,
      timeout: 12000,
    });
    return Array.isArray(res.data?.items) ? res.data.items : [];
  } catch {
    return [];
  }
}

export async function fetchAniHubEpisodeSources(
  id: number | string,
  season: number,
  signal?: AbortSignal,
): Promise<AniHubEpisodeSources | null> {
  try {
    const res = await httpRequest<AniHubEpisodeSources>(
      `${ANIHUB_API}/anime/${id}/episode-sources?season=${season}`,
      {
        headers: anihubHeaders(),
        signal,
        timeout: 15000,
      },
    );
    return res.data && typeof res.data === 'object' ? res.data : null;
  } catch {
    return null;
  }
}
