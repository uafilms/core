import type { TmdbSeasonResponse, LampaMovie } from '../types/index.js';
import { requestJson } from '../utils/index.js';
import { getLocalCache, setLocalCache } from '../cache/index.js';

declare const Lampa: any;

export async function fetchSeasonDetails(
  host: string,
  id: string | number,
  season: number
): Promise<TmdbSeasonResponse> {
  const cacheKey = `season_${id}_s${season}`;
  const cached = getLocalCache<TmdbSeasonResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Try Lampa internal TMDB first if available
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Api?.sources?.tmdb?.get) {
      const res = await new Promise<any>((resolve, reject) => {
        Lampa.Api.sources.tmdb.get(
          `tv/${id}/season/${season}`,
          {},
          (data: any) => resolve(data),
          (err: any) => reject(err)
        );
      });
      if (res && Array.isArray(res.episodes) && res.episodes.length > 0) {
        setLocalCache(cacheKey, res, 3600);
        return res as TmdbSeasonResponse;
      }
    }
  } catch {
    // Continue to backend fallback
  }

  // 2. Fallback to UAFilms backend /season
  const url = `${host}/season?id=${encodeURIComponent(String(id))}&season=${season}`;
  const data = await requestJson<TmdbSeasonResponse>(url, 15000);

  if (data && data.episodes?.length) {
    // Cache for 1 hour locally
    setLocalCache(cacheKey, data, 3600);
  }

  return data;
}

export async function fetchTvDetails(
  host: string,
  id: string | number
): Promise<LampaMovie | null> {
  const cacheKey = `tv_details_${id}`;
  const cached = getLocalCache<LampaMovie>(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Try Lampa internal TMDB
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Api?.sources?.tmdb?.get) {
      const res = await new Promise<any>((resolve, reject) => {
        Lampa.Api.sources.tmdb.get(
          `tv/${id}`,
          {},
          (data: any) => resolve(data),
          (err: any) => reject(err)
        );
      });
      if (res && (res.number_of_seasons || res.seasons)) {
        setLocalCache(cacheKey, res, 3600);
        return res as LampaMovie;
      }
    }
  } catch {
    // Continue to backend fallback
  }

  // 2. Fallback to backend /details?id=...&type=tv
  try {
    const url = `${host}/details?id=${encodeURIComponent(String(id))}&type=tv`;
    const data = await requestJson<LampaMovie>(url, 15000);
    if (data) {
      setLocalCache(cacheKey, data, 3600);
    }
    return data;
  } catch {
    return null;
  }
}
