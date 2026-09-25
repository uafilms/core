import axios from 'axios';
import { MemoryCache } from './cache';
import { MediaSegment } from './theintrodb';
import { isSearchResultMatch } from '../../utils/sort';

const aniskipCache = new MemoryCache(24 * 60 * 60 * 1000); // 24 hours
const malIdCache = new MemoryCache(7 * 24 * 60 * 60 * 1000); // 7 days

export interface AniSkipParams {
  malId?: number;
  imdbId?: string;
  title?: string;
  episode?: number;
  episodeLength?: number;
}

interface AniSkipResult {
  interval: {
    startTime: number;
    endTime: number;
  };
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
  skipId: string;
  episodeLength: number;
}

interface AniSkipResponse {
  found: boolean;
  results?: AniSkipResult[];
  statusCode: number;
}

export class AniSkipService {
  private static readonly ANISKIP_BASE = 'https://api.aniskip.com/v2/skip-times';

  /**
   * Resolve MyAnimeList (MAL) ID from IMDb ID or Title using Mikai
   */
  public static async resolveMalId(imdbId?: string, title?: string): Promise<number | null> {
    const key = `mal_id:${imdbId || ''}:${title || ''}`;
    const cached = malIdCache.get<number>(key);
    if (cached) return cached;

    // 1. Try resolving via Mikai API using IMDb ID
    if (imdbId) {
      try {
        const mikaiRes = await axios.get('https://api.mikai.me/public/v1/anime', {
          params: { search: imdbId },
          timeout: 4000,
          headers: { 'Accept': 'application/json' },
        });
        const items = mikaiRes.data?.result;
        if (Array.isArray(items) && items.length > 0) {
          const match = items.find((it: any) => it.ids?.imdb === imdbId);
          if (match?.ids?.mal && typeof match.ids.mal === 'number' && match.ids.mal > 0) {
            malIdCache.set(key, match.ids.mal);
            return match.ids.mal;
          }
        }
      } catch {}
      // If IMDb ID was provided but not found in Mikai anime DB, this title is not an anime
      return null;
    }

    // 2. Try resolving via Mikai API using Title with strict relevance matching
    if (title) {
      try {
        const mikaiRes = await axios.get('https://api.mikai.me/public/v1/anime', {
          params: { search: title },
          timeout: 4000,
          headers: { 'Accept': 'application/json' },
        });
        const items = mikaiRes.data?.result;
        if (Array.isArray(items) && items.length > 0) {
          const match = items.find((item: any) => {
            const resObj = {
              id: String(item.ids?.mal || item.ids?.mikai),
              title: item.titles?.ua || '',
              originalTitle: item.titles?.original || item.titles?.english,
              year: item.year,
              mediaType: item.format === 'movie' ? 'movie' : 'tv',
            };
            return isSearchResultMatch(resObj as any, title);
          });

          if (match?.ids?.mal && typeof match.ids.mal === 'number' && match.ids.mal > 0) {
            malIdCache.set(key, match.ids.mal);
            return match.ids.mal;
          }
        }
      } catch {}
    }

    return null;
  }

  public static async getSegments(params: AniSkipParams): Promise<MediaSegment[]> {
    const { episode = 1, episodeLength = 0 } = params;
    let malId = params.malId;

    if (!malId && (params.imdbId || params.title)) {
      malId = (await this.resolveMalId(params.imdbId, params.title)) || undefined;
    }

    if (!malId) {
      return [];
    }

    const roundedLength = Math.round(episodeLength);
    const cacheKey = `aniskip:${malId}:${episode}:${roundedLength}`;
    const cached = aniskipCache.get<MediaSegment[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.ANISKIP_BASE}/${malId}/${episode}`;
      let res = await axios.get<AniSkipResponse>(url, {
        params: {
          types: ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'],
          episodeLength: roundedLength,
        },
        paramsSerializer: {
          indexes: null, // serializes types=op&types=ed
        },
        timeout: 5000,
        headers: { 'Accept': 'application/json' },
      }).catch(async (err) => {
        // If specific episodeLength returned 404, fall back to episodeLength = 0
        if (err.response?.status === 404 && roundedLength > 0) {
          return axios.get<AniSkipResponse>(url, {
            params: {
              types: ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'],
              episodeLength: 0,
            },
            paramsSerializer: {
              indexes: null,
            },
            timeout: 5000,
            headers: { 'Accept': 'application/json' },
          });
        }
        throw err;
      });

      if (!res.data?.found || !Array.isArray(res.data.results)) {
        aniskipCache.set(cacheKey, [], 2 * 60 * 60 * 1000);
        return [];
      }

      const segments: MediaSegment[] = [];

      for (const item of res.data.results) {
        const startSec = item.interval?.startTime;
        const endSec = item.interval?.endTime;

        if (typeof startSec !== 'number' || typeof endSec !== 'number' || endSec <= startSec) {
          continue;
        }

        let type: MediaSegment['type'] = 'intro';
        let label = 'Інтро';
        let color = '#00c853';

        if (item.skipType === 'ed' || item.skipType === 'mixed-ed') {
          type = 'credits';
          label = 'Титри';
          color = '#7c4dff';
        } else if (item.skipType === 'recap') {
          type = 'recap';
          label = 'Переказ';
          color = '#00b0ff';
        }

        segments.push({
          type,
          label,
          startSec: +startSec.toFixed(3),
          endSec: +endSec.toFixed(3),
          color,
        });
      }

      segments.sort((a, b) => a.startSec - b.startSec);
      aniskipCache.set(cacheKey, segments);
      return segments;
    } catch (err: any) {
      if (err.response?.status === 404) {
        aniskipCache.set(cacheKey, [], 2 * 60 * 60 * 1000);
      }
      return [];
    }
  }
}
