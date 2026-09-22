export interface AniWorldCatalogItem {
  id: number;
  title: string;
  original_title?: string;
  romanized_title?: string;
  genres?: string[];
  synopsis?: string;
  duration_minutes?: number;
  release_year?: number;
  current_episodes: number;
  total_episodes: number;
  poster?: string;
  poster_wide?: string;
  media_type: string; // 'ANIME_SERIAL' | 'ONA' | 'MOVIE' etc.
  user_weighted_rating?: number;
}

export interface AniWorldCatalogListResponse {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: AniWorldCatalogItem[];
}

export interface AniWorldEpisodeBrief {
  id: number;
  episode: number;
}

export interface AniWorldDetail {
  id: number;
  title: string;
  original_title?: string;
  romanized_title?: string;
  genres?: string[];
  synopsis?: string;
  duration_minutes?: number;
  release_year?: number;
  current_episodes: number;
  total_episodes: number;
  episodes?: AniWorldEpisodeBrief[];
  poster?: string;
  poster_wide?: string;
  media_type: string;
}
