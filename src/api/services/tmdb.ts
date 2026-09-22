import axios from 'axios';
import type { MediaMetadata, MediaType } from '../../types/media.js';
import { metaCache } from './cache.js';
import { getUakinoDb } from '../../providers/uakino/db.js';

interface TmdbDetailsResponse {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  external_ids?: {
    imdb_id?: string;
  };
}

export class TmdbService {
  private static getToken(): string | undefined {
    return process.env.TMDB_TOKEN;
  }

  static async getMetadata(id: string, type: MediaType): Promise<MediaMetadata | null> {
    const cacheKey = `meta_${type}_${id}`;
    const cached = metaCache.get<MediaMetadata>(cacheKey);
    if (cached) return cached;

    // 1. Try TMDB Official API if token is available
    const token = this.getToken();
    if (token) {
      try {
        const url = `https://api.themoviedb.org/3/${type}/${id}?append_to_response=external_ids&language=uk-UA`;
        const res = await axios.get<TmdbDetailsResponse>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          timeout: 5000,
        });

        const data = res.data;
        const title = data.title || data.name || '';
        const originalTitle = data.original_title || data.original_name;
        const dateStr = data.release_date || data.first_air_date || '';
        const year = dateStr ? parseInt(dateStr.split('-')[0], 10) : undefined;
        const imdbId = data.external_ids?.imdb_id;

        const meta: MediaMetadata = {
          id,
          tmdbId: parseInt(id, 10),
          imdbId,
          title,
          originalTitle,
          year,
          type,
        };

        metaCache.set(cacheKey, meta);
        return meta;
      } catch (err: unknown) {
        console.warn(`[TMDB] API request failed for ${type}/${id}:`, (err as Error).message);
      }
    }

    // 2. Try looking up in local UaKino SQLite database by imdb_id if id starts with "tt"
    if (id.startsWith('tt')) {
      try {
        const db = await getUakinoDb();
        const row = db.prepare('SELECT imdb_id, title, origname, year FROM uakino_items WHERE imdb_id = ?').get(id) as {
          imdb_id: string;
          title: string;
          origname: string;
          year: number;
        } | undefined;

        if (row) {
          const meta: MediaMetadata = {
            id,
            imdbId: row.imdb_id,
            title: row.title,
            originalTitle: row.origname,
            year: row.year,
            type,
          };
          metaCache.set(cacheKey, meta);
          return meta;
        }
      } catch (err) {
        console.warn('[TMDB] Local DB lookup failed:', (err as Error).message);
      }
    }

    return null;
  }
}
