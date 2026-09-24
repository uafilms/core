import axios from 'axios';
import type { MediaMetadata, MediaType } from '../../types/media.js';
import { metaCache } from './cache.js';
import { getUakinoDb } from '../../providers/uakino/db.js';
import { logWarn } from '../../utils/logger.js';

export interface CatalogItem {
  id: number | string;
  title: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  media_type: 'movie' | 'tv';
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
}

export interface CatalogResponse {
  page?: number;
  results: CatalogItem[];
  total_pages?: number;
  total_results?: number;
}

export interface SeasonInfo {
  seasonNumber: number;
  name?: string;
  episodeCount: number;
  posterUrl?: string | null;
}

export interface EpisodeInfo {
  episodeNumber: number;
  name?: string;
  overview?: string;
  stillUrl?: string | null;
  runtime?: number | null;
  airDate?: string | null;
}

export interface SeasonDetails {
  seasonNumber: number;
  name: string;
  overview?: string;
  posterUrl?: string | null;
  episodes: EpisodeInfo[];
}

export interface MediaDetails {
  id: number | string;
  imdbId?: string;
  type: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  year?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string;
  genres?: string[];
  imdbRating?: string | number | null;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  seasons?: SeasonInfo[];
  episodes?: EpisodeInfo[];
}

export class TmdbService {
  private static getToken(): string {
    return process.env.TMDB_TOKEN || '';
  }

  private static getHeaders() {
    const token = this.getToken();
    return {
      Authorization: token ? `Bearer ${token}` : '',
      Accept: 'application/json',
    };
  }

  static async getMetadata(id: string, type: MediaType): Promise<MediaMetadata | null> {
    const cacheKey = `meta_${type}_${id}`;
    const cached = metaCache.get<MediaMetadata>(cacheKey);
    if (cached) return cached;

    // 1. Try TMDB Official API if token is available
    const token = this.getToken();
    if (token) {
      try {
        let tmdbNumericId = id;
        if (id.startsWith('tt')) {
          // Resolve IMDb ID to TMDB ID first
          const findUrl = `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id`;
          const findRes = await axios.get<any>(findUrl, {
            headers: this.getHeaders(),
            timeout: 5000,
          });
          const results = type === 'tv'
            ? (findRes.data.tv_results || [])
            : (findRes.data.movie_results || []);
          if (results.length > 0) {
            tmdbNumericId = String(results[0].id);
          } else if (findRes.data.tv_results?.length > 0) {
            tmdbNumericId = String(findRes.data.tv_results[0].id);
          } else if (findRes.data.movie_results?.length > 0) {
            tmdbNumericId = String(findRes.data.movie_results[0].id);
          }
        }

        const url = `https://api.themoviedb.org/3/${type}/${tmdbNumericId}?append_to_response=external_ids,keywords&language=uk-UA`;
        const res = await axios.get<any>(url, {
          headers: this.getHeaders(),
          timeout: 5000,
        });

        const data = res.data;
        const title = data.title || data.name || '';
        const originalTitle = (data.original_title || data.original_name || '').replace(/&amp;/g, '&');
        const originalLanguage = data.original_language || undefined;
        const genres = Array.isArray(data.genres) ? data.genres.map((g: any) => g.name || '').filter(Boolean) : [];
        const genreIds: number[] = Array.isArray(data.genres) ? data.genres.map((g: any) => g.id) : [];
        const originCountries: string[] = Array.isArray(data.origin_country) ? data.origin_country : [];
        const productionCountries: string[] = Array.isArray(data.production_countries) ? data.production_countries.map((c: any) => c.iso_3166_1) : [];

        // Check if media is anime:
        // 1. Japanese animation (genre 16 + origin JP / lang ja)
        // 2. Keyword 'anime'
        const keywordsList: string[] = [
          ...(data.keywords?.results || []),
          ...(data.keywords?.keywords || []),
        ].map((k: any) => (k.name || '').toLowerCase());

        const isJapanese = originalLanguage === 'ja' || originCountries.includes('JP') || productionCountries.includes('JP');
        const isAnimation = genreIds.includes(16) || genres.some((g: string) => g.toLowerCase().includes('мульт') || g.toLowerCase().includes('анімац'));
        const hasAnimeKeyword = keywordsList.some((k: string) => k.includes('anime'));

        const isAnime = hasAnimeKeyword || (isAnimation && isJapanese);

        const dateStr = data.release_date || data.first_air_date || '';
        const year = dateStr ? parseInt(dateStr.split('-')[0], 10) : undefined;
        const imdbId = data.external_ids?.imdb_id || (id.startsWith('tt') ? id : undefined);

        const meta: MediaMetadata = {
          id,
          tmdbId: typeof data.id === 'number' ? data.id : parseInt(tmdbNumericId, 10),
          imdbId,
          title,
          originalTitle,
          originalLanguage,
          genres,
          isAnime,
          year,
          type,
        };

        metaCache.set(cacheKey, meta);
        return meta;
      } catch (err: unknown) {
        logWarn('tmdb', `request failed for ${type}/${id}: ${(err as Error).message}`);
      }
    }

    // 2. Try looking up in local UaKino SQLite database by imdb_id or title
    try {
      const db = await getUakinoDb();
      let row: any;
      if (id.startsWith('tt')) {
        row = db.prepare('SELECT imdb_id, title, origname, year, is_tv FROM uakino_items WHERE imdb_id = ?').get(id);
      } else if (/^\d+$/.test(id)) {
        row = db.prepare('SELECT imdb_id, title, origname, year, is_tv FROM uakino_items WHERE id = ?').get(parseInt(id, 10));
      }

      if (row) {
        const meta: MediaMetadata = {
          id,
          imdbId: row.imdb_id,
          title: row.title,
          originalTitle: row.origname,
          year: row.year,
          type: row.is_tv ? 'tv' : 'movie',
        };
        metaCache.set(cacheKey, meta);
        return meta;
      }
    } catch (err) {
      logWarn('tmdb', `local db lookup failed: ${(err as Error).message}`);
    }

    return null;
  }

  static async getDetails(id: string, type: 'movie' | 'tv'): Promise<MediaDetails | null> {
    const cacheKey = `details_${type}_${id}`;
    const cached = metaCache.get<MediaDetails>(cacheKey);
    if (cached) return cached;

    const token = this.getToken();
    if (token) {
      try {
        let tmdbNumericId = id;
        if (id.startsWith('tt')) {
          const findUrl = `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id`;
          const findRes = await axios.get<any>(findUrl, {
            headers: this.getHeaders(),
            timeout: 5000,
          });
          const results = type === 'tv'
            ? (findRes.data.tv_results || [])
            : (findRes.data.movie_results || []);
          if (results.length > 0) {
            tmdbNumericId = String(results[0].id);
          } else if (findRes.data.tv_results?.length > 0) {
            tmdbNumericId = String(findRes.data.tv_results[0].id);
          } else if (findRes.data.movie_results?.length > 0) {
            tmdbNumericId = String(findRes.data.movie_results[0].id);
          }
        }

        const url = `https://api.themoviedb.org/3/${type}/${tmdbNumericId}?append_to_response=external_ids&language=uk-UA`;
        const res = await axios.get<any>(url, {
          headers: this.getHeaders(),
          timeout: 6000,
        });
        const d = res.data;
        let seasons: SeasonInfo[] | undefined;
        if (type === 'tv' && Array.isArray(d.seasons)) {
          const regularSeasons = d.seasons.filter((s: any) => s.season_number > 0 && (s.episode_count > 0 || (s.air_date && s.air_date !== '')));
          const seasonsToUse = regularSeasons.length > 0 ? regularSeasons : d.seasons.filter((s: any) => s.season_number > 0);
          seasons = seasonsToUse.map((s: any) => ({
            seasonNumber: s.season_number,
            name: s.name || `Сезон ${s.season_number}`,
            episodeCount: s.episode_count || 1,
            posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
          }));
        }

        let episodes: EpisodeInfo[] | undefined;
        if (type === 'tv' && seasons && seasons.length > 0) {
          try {
            const seasonDetails = await this.getSeasonDetails(tmdbNumericId, seasons[0].seasonNumber);
            if (seasonDetails?.episodes?.length) {
              episodes = seasonDetails.episodes;
            }
          } catch {
            // ignore
          }
        }

        const details: MediaDetails = {
          id: d.id,
          imdbId: d.external_ids?.imdb_id,
          type,
          title: d.title || d.name || '',
          originalTitle: (d.original_title || d.original_name || '').replace(/&amp;/g, '&'),
          year: (d.release_date || d.first_air_date) ? parseInt((d.release_date || d.first_air_date).split('-')[0], 10) : null,
          posterUrl: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
          backdropUrl: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
          overview: d.overview,
          genres: (d.genres || []).map((g: any) => g.name),
          imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
          numberOfSeasons: seasons ? seasons.length : d.number_of_seasons,
          numberOfEpisodes: d.number_of_episodes,
          seasons,
          episodes,
        };
        metaCache.set(cacheKey, details, 3600);
        return details;
      } catch (err: unknown) {
        logWarn('tmdb', `getDetails failed for ${type}/${id}: ${(err as Error).message}`);
      }
    }

    // Local SQLite fallback
    try {
      const db = await getUakinoDb();
      let row: any;
      if (id.startsWith('tt')) {
        row = db.prepare('SELECT * FROM uakino_items WHERE imdb_id = ?').get(id);
      } else {
        row = db.prepare('SELECT * FROM uakino_items WHERE id = ?').get(parseInt(id, 10));
      }

      if (row) {
        const posterUrl = row.poster ? (row.poster.startsWith('http') ? row.poster : `https://image.tmdb.org/t/p/w500${row.poster}`) : null;
        const details: MediaDetails = {
          id: row.id,
          imdbId: row.imdb_id,
          type: row.is_tv ? 'tv' : 'movie',
          title: row.title,
          originalTitle: row.origname,
          year: row.year || null,
          posterUrl,
          backdropUrl: posterUrl,
          overview: `Рік: ${row.year || '-'}. Озвучення та перегляд онлайн українською.`,
          genres: row.is_tv ? ['Серіал'] : ['Фільм'],
          imdbRating: row.imdb_rating || null,
          numberOfSeasons: row.is_tv ? (row.season || 1) : undefined,
          seasons: row.is_tv
            ? Array.from({ length: row.season || 1 }, (_, i) => ({
                seasonNumber: i + 1,
                name: `Сезон ${i + 1}`,
                episodeCount: 24,
              }))
            : undefined,
        };
        metaCache.set(cacheKey, details, 3600);
        return details;
      }
    } catch (err) {
      logWarn('tmdb', `local db fallback failed: ${(err as Error).message}`);
    }

    return null;
  }

  static async getSeasonDetails(id: string, seasonNumber: number): Promise<SeasonDetails | null> {
    const cacheKey = `season_${id}_${seasonNumber}`;
    const cached = metaCache.get<SeasonDetails>(cacheKey);
    if (cached) return cached;

    const token = this.getToken();
    if (token) {
      try {
        let tmdbNumericId = id;
        if (id.startsWith('tt')) {
          const findUrl = `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id`;
          const findRes = await axios.get<any>(findUrl, {
            headers: this.getHeaders(),
            timeout: 5000,
          });
          const results = findRes.data.tv_results || [];
          if (results.length > 0) {
            tmdbNumericId = String(results[0].id);
          }
        }

        const url = `https://api.themoviedb.org/3/tv/${tmdbNumericId}/season/${seasonNumber}?language=uk-UA`;
        const res = await axios.get<any>(url, {
          headers: this.getHeaders(),
          timeout: 6000,
        });
        const d = res.data;
        const episodes: EpisodeInfo[] = Array.isArray(d.episodes)
          ? d.episodes.map((ep: any) => ({
              episodeNumber: ep.episode_number,
              name: ep.name || `Серія ${ep.episode_number}`,
              overview: ep.overview || '',
              stillUrl: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null,
              runtime: ep.runtime || null,
              airDate: ep.air_date || null,
            }))
          : [];

        const result: SeasonDetails = {
          seasonNumber: d.season_number ?? seasonNumber,
          name: d.name || `Сезон ${seasonNumber}`,
          overview: d.overview || '',
          posterUrl: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
          episodes,
        };

        metaCache.set(cacheKey, result, 3600);
        return result;
      } catch (err: unknown) {
        logWarn('tmdb', `getSeasonDetails failed for ${id} s${seasonNumber}: ${(err as Error).message}`);
      }
    }

    return null;
  }

  static async getTrending(timeWindow: string = 'week', type: string = 'all'): Promise<CatalogResponse> {
    const token = this.getToken();
    if (token) {
      try {
        const res = await axios.get<CatalogResponse>(
          `https://api.themoviedb.org/3/trending/${type}/${timeWindow}?language=uk-UA`,
          { headers: this.getHeaders(), timeout: 6000 }
        );
        return res.data;
      } catch (err) {
        logWarn('tmdb', `getTrending failed: ${(err as Error).message}`);
      }
    }
    return this.getLocalCatalogFallback();
  }

  static async getRecommended(type: 'movie' | 'tv' = 'movie', includeAdult = false): Promise<CatalogResponse> {
    const token = this.getToken();
    if (token) {
      try {
        const res = await axios.get<CatalogResponse>(
          `https://api.themoviedb.org/3/discover/${type}?language=uk-UA&sort_by=popularity.desc&include_adult=${includeAdult}`,
          { headers: this.getHeaders(), timeout: 6000 }
        );
        return res.data;
      } catch (err) {
        logWarn('tmdb', `getRecommended failed: ${(err as Error).message}`);
      }
    }
    return this.getLocalCatalogFallback({ minYear: 2022 });
  }

  static async getUkrainian(type: 'movie' | 'tv' = 'movie', includeAdult = false): Promise<CatalogResponse> {
    const token = this.getToken();
    if (token) {
      try {
        const res = await axios.get<CatalogResponse>(
          `https://api.themoviedb.org/3/discover/${type}?language=uk-UA&with_origin_country=UA&with_original_language=uk&sort_by=popularity.desc&include_adult=${includeAdult}`,
          { headers: this.getHeaders(), timeout: 6000 }
        );
        return res.data;
      } catch (err) {
        logWarn('tmdb', `getUkrainian failed: ${(err as Error).message}`);
      }
    }
    return this.getLocalCatalogFallback({ minYear: 2020 });
  }

  static async getCartoons(type: 'movie' | 'tv' = 'movie', includeAdult = false): Promise<CatalogResponse> {
    const token = this.getToken();
    if (token) {
      try {
        const res = await axios.get<CatalogResponse>(
          `https://api.themoviedb.org/3/discover/${type}?language=uk-UA&with_genres=16&sort_by=popularity.desc&include_adult=${includeAdult}`,
          { headers: this.getHeaders(), timeout: 6000 }
        );
        return res.data;
      } catch (err) {
        logWarn('tmdb', `getCartoons failed: ${(err as Error).message}`);
      }
    }
    return this.getLocalCatalogFallback({ minYear: 2021 });
  }

  static async getAnime(type: 'movie' | 'tv' = 'movie', includeAdult = false): Promise<CatalogResponse> {
    const token = this.getToken();
    if (token) {
      try {
        const res = await axios.get<CatalogResponse>(
          `https://api.themoviedb.org/3/discover/${type}?language=uk-UA&with_genres=16&with_origin_country=JP&sort_by=popularity.desc&include_adult=${includeAdult}`,
          { headers: this.getHeaders(), timeout: 6000 }
        );
        return res.data;
      } catch (err) {
        logWarn('tmdb', `getAnime failed: ${(err as Error).message}`);
      }
    }
    return this.getLocalCatalogFallback({ isTv: 1 });
  }

  static async search(query: string, page = 1, includeAdult = false): Promise<CatalogResponse> {
    if (!query || !query.trim()) return { results: [], total_pages: 0, total_results: 0 };

    const token = this.getToken();
    if (token) {
      try {
        const res = await axios.get<any>(
          `https://api.themoviedb.org/3/search/multi?language=uk-UA&query=${encodeURIComponent(query)}&page=${page}&include_adult=${includeAdult}`,
          { headers: this.getHeaders(), timeout: 6000 }
        );
        const data = res.data;
        if (data && Array.isArray(data.results)) {
          data.results = data.results.filter((item: any) => item.media_type !== 'person');
        }
        return data;
      } catch (err) {
        logWarn('tmdb', `search failed: ${(err as Error).message}`);
      }
    }

    // Local DB search fallback
    try {
      const db = await getUakinoDb();
      const limit = 20;
      const offset = (page - 1) * limit;

      const countRow = db.prepare(`
        SELECT COUNT(*) as count FROM uakino_items
        WHERE ukr_includes(title, ?) OR origname LIKE ?
      `).get(query, `%${query}%`) as { count: number };

      const rows = db.prepare(`
        SELECT id, title, origname, year, imdb_id, poster, is_tv
        FROM uakino_items
        WHERE ukr_includes(title, ?) OR origname LIKE ?
        ORDER BY year DESC
        LIMIT ? OFFSET ?
      `).all(query, `%${query}%`, limit, offset) as any[];

      const results: CatalogItem[] = rows.map((r) => {
        const posterUrl = r.poster ? (r.poster.startsWith('http') ? r.poster : `https://image.tmdb.org/t/p/w500${r.poster}`) : null;
        return {
          id: r.id,
          title: r.title,
          original_title: r.origname,
          release_date: r.year ? `${r.year}-01-01` : undefined,
          media_type: r.is_tv ? 'tv' : 'movie',
          poster_path: posterUrl,
        };
      });

      const totalCount = countRow?.count || results.length;
      return {
        page,
        results,
        total_pages: Math.ceil(totalCount / limit),
        total_results: totalCount,
      };
    } catch (err) {
      logWarn('tmdb', `local search fallback error: ${(err as Error).message}`);
      return { results: [], total_pages: 0, total_results: 0 };
    }
  }

  private static async getLocalCatalogFallback(options: { minYear?: number; isTv?: number } = {}): Promise<CatalogResponse> {
    try {
      const db = await getUakinoDb();
      let query = 'SELECT id, title, origname, year, imdb_id, poster, is_tv FROM uakino_items';
      const params: any[] = [];

      if (options.isTv !== undefined) {
        query += ' WHERE is_tv = ?';
        params.push(options.isTv);
      } else if (options.minYear) {
        query += ' WHERE year >= ?';
        params.push(options.minYear);
      }

      query += ' ORDER BY id DESC LIMIT 20';
      const rows = db.prepare(query).all(...params) as any[];

      return {
        page: 1,
        results: rows.map((r) => {
          const posterUrl = r.poster ? (r.poster.startsWith('http') ? r.poster : `https://image.tmdb.org/t/p/w500${r.poster}`) : null;
          return {
            id: r.id,
            title: r.title,
            original_title: r.origname,
            release_date: r.year ? `${r.year}-01-01` : undefined,
            media_type: r.is_tv ? 'tv' : 'movie',
            poster_path: posterUrl,
          };
        }),
        total_pages: 1,
        total_results: rows.length,
      };
    } catch (err) {
      return { results: [], total_pages: 0, total_results: 0 };
    }
  }
}
