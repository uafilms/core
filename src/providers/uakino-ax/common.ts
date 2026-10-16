import { httpRequest } from '../../utils/http.js';
import type { UakinoAxEpisodesResponse, UakinoAxMovie } from './types.js';

export const BASE_URL = 'https://uakino.ax';
export const API_BASE = `${BASE_URL}/api`;

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const API_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
};

/** Постери/бекдропи приходять відносними шляхами (/uploads/...). */
export function posterUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function pageUrlFor(item: { type: 'film' | 'series'; slug: string }): string {
  const section = item.type === 'series' ? 'serialy' : 'filmy';
  return `${BASE_URL}/${section}/${item.slug}`;
}

/** Метадані тайтлу з web API (якість, постер, iframe плеєра). */
export async function fetchMovieMeta(
  id: string | number,
  signal?: AbortSignal
): Promise<UakinoAxMovie | null> {
  try {
    const res = await httpRequest<UakinoAxMovie>(`${API_BASE}/movie/${id}`, {
      headers: API_HEADERS,
      signal,
      timeout: 10000,
    });
    return res.data?.id ? res.data : null;
  } catch {
    return null;
  }
}

/** Список сезонів/серій з назвами, датами та описами. */
export async function fetchEpisodesMeta(
  id: string | number,
  signal?: AbortSignal
): Promise<UakinoAxEpisodesResponse | null> {
  try {
    const res = await httpRequest<UakinoAxEpisodesResponse>(`${API_BASE}/movie/${id}/episodes`, {
      headers: API_HEADERS,
      signal,
      timeout: 10000,
    });
    return res.data && Array.isArray(res.data.seasons) ? res.data : null;
  } catch {
    return null;
  }
}
