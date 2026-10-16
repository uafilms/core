/**
 * Відповіді web API uakino.ax (/api/*).
 */

export interface UakinoAxSearchItem {
  id: number;
  slug: string;
  title: string;
  type: 'film' | 'series';
  year?: string | null;
  year_start?: number | null;
  year_end?: number | null;
  quality?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  imdb_rating?: number | null;
  genres?: string[];
  country?: string | null;
  seasons_count?: number | null;
  episodes_count?: number | null;
  seg?: string | null;
}

export interface UakinoAxSearchResponse {
  items: UakinoAxSearchItem[];
}

export interface UakinoAxMovie {
  id: number;
  slug: string;
  title: string;
  origin_name?: string | null;
  description?: string | null;
  short_description?: string | null;
  type: 'film' | 'series';
  year?: string | number | null;
  quality?: string | null;
  duration?: string | null;
  transl?: string[] | null;
  seasons_count?: number | null;
  episodes_count?: number | null;
  poster?: string | null;
  backdrop?: string | null;
  iframe_url?: string | null;
  trailer?: string | null;
  is_available?: boolean;
  genres?: Array<{ name?: string } | string> | null;
}

export interface UakinoAxEpisode {
  season: number;
  episode: number;
  name?: string;
  air_date?: string;
  description?: string;
  still?: string;
}

export interface UakinoAxSeasonGroup {
  season: number;
  count: number;
  episodes: UakinoAxEpisode[];
}

export interface UakinoAxEpisodesResponse {
  movie_id: string | number;
  total: number;
  seasons: UakinoAxSeasonGroup[];
  next?: unknown;
}
