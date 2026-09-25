import axios from 'axios';
import { MemoryCache } from './cache';

export interface IntroDbTimestamp {
  start_ms: number | null;
  end_ms: number | null;
}

export interface TheIntroDbResponse {
  tmdb_id?: number;
  imdb_id?: string;
  type?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  intro?: IntroDbTimestamp[];
  recap?: IntroDbTimestamp[];
  credits?: IntroDbTimestamp[];
  preview?: IntroDbTimestamp[];
}

export interface MediaSegment {
  type: 'intro' | 'recap' | 'credits' | 'preview';
  label: string;
  startSec: number;
  endSec: number | null;
  color: string;
}

export interface GetSegmentsParams {
  tmdbId?: number;
  imdbId?: string;
  type?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  durationMs?: number;
}

const segmentsCache = new MemoryCache(24 * 60 * 60 * 1000); // 24 hours

export class TheIntroDbService {
  private static readonly BASE_URL = 'https://api.theintrodb.org/v3/media';

  public static async getSegments(params: GetSegmentsParams): Promise<MediaSegment[]> {
    const { tmdbId, imdbId, type, season, episode, durationMs } = params;

    if (!tmdbId && !imdbId) {
      return [];
    }

    const cacheKey = `introdb:${tmdbId || ''}:${imdbId || ''}:${type || 'movie'}:${season || 0}:${episode || 0}`;
    const cached = segmentsCache.get<MediaSegment[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const queryParams: Record<string, string | number> = {};
    if (tmdbId && Number.isInteger(tmdbId) && tmdbId > 0 && tmdbId <= 10000000) {
      queryParams.tmdb_id = tmdbId;
    } else if (imdbId) {
      queryParams.imdb_id = imdbId;
    }

    if (type === 'tv' || (season !== undefined && episode !== undefined)) {
      if (season !== undefined) queryParams.season = season;
      if (episode !== undefined) queryParams.episode = episode;
    }

    if (durationMs && durationMs > 0) {
      queryParams.duration_ms = durationMs;
    }

    try {
      let response = await axios.get<TheIntroDbResponse>(this.BASE_URL, {
        params: queryParams,
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'uafilms/1.0',
        },
      }).catch(async (err) => {
        // If duration_ms caused 404, retry without duration_ms
        if (err.response?.status === 404 && queryParams.duration_ms) {
          const fallbackParams = { ...queryParams };
          delete fallbackParams.duration_ms;
          return axios.get<TheIntroDbResponse>(this.BASE_URL, {
            params: fallbackParams,
            timeout: 5000,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'uafilms/1.0',
            },
          });
        }
        throw err;
      });

      const data = response.data;
      if (!data) {
        segmentsCache.set(cacheKey, [], 60 * 60 * 1000);
        return [];
      }

      const segments: MediaSegment[] = [];

      const segmentConfigs: Array<{
        type: MediaSegment['type'];
        label: string;
        color: string;
        items?: IntroDbTimestamp[];
      }> = [
        { type: 'recap', label: 'Переказ', color: '#00b0ff', items: data.recap },
        { type: 'intro', label: 'Інтро', color: '#00c853', items: data.intro },
        { type: 'preview', label: 'Анонс', color: '#ff9100', items: data.preview },
        { type: 'credits', label: 'Титри', color: '#7c4dff', items: data.credits },
      ];

      for (const config of segmentConfigs) {
        if (!Array.isArray(config.items)) continue;

        for (const item of config.items) {
          const startMs = item.start_ms;
          const endMs = item.end_ms;

          // Skip completely empty or invalid zero-duration items
          if (startMs === null && (endMs === null || endMs === 0)) continue;
          if (startMs !== null && endMs !== null && endMs <= startMs) continue;

          const startSec = (startMs !== null && startMs > 0) ? +(startMs / 1000).toFixed(3) : 0;
          const endSec = (endMs !== null && endMs > 0) ? +(endMs / 1000).toFixed(3) : null;

          segments.push({
            type: config.type,
            label: config.label,
            startSec,
            endSec,
            color: config.color,
          });
        }
      }

      // Sort segments chronologically by startSec
      segments.sort((a, b) => a.startSec - b.startSec);

      segmentsCache.set(cacheKey, segments);
      return segments;
    } catch (err: any) {
      // If 404 (media not found), cache empty array for 2 hours to avoid rate limit spam
      if (err.response?.status === 404) {
        segmentsCache.set(cacheKey, [], 2 * 60 * 60 * 1000);
      }
      return [];
    }
  }
}
