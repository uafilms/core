export interface AniHubAnimeShort {
  id: number;
  mal_id?: number | null;
  anilist_id?: number | null;
  slug?: string;
  title_ukrainian?: string;
  title_original?: string;
  title_english?: string;
  status?: string;
  type?: string;
  year?: number | null;
  season_name?: string | null;
  has_ukrainian_dub?: boolean;
  poster_url?: string | null;
  banner_url?: string | null;
  episodes_count?: number | null;
  imdb_id?: string | null;
  age_rating?: string | null;
  description?: string;
  genres?: string[];
  dubbing_studios?: string[];
  screenshots?: string[];
  rating?: number;
}

export interface AniHubSearchResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  next_page?: number | null;
  previous_page?: number | null;
  items: AniHubAnimeShort[];
}

export interface AniHubSubtitle {
  label?: string;
  language?: string;
  kind?: string;
  format?: string;
  voice_studio_id?: string | null;
  voice_studio_name?: string | null;
  is_default?: boolean;
  is_forced?: boolean;
}

export interface AniHubStudioEpisode {
  episode_number: number;
  display_episode_number?: number;
  title?: string;
  edition?: string;
  language?: string;
  track_type?: string;
  voice_studio_id?: string | null;
  fenix_episode_id?: string;
  vod_url?: string;
  iframe_url?: string;
  poster_url?: string;
  url?: string;
  ashdi_episode_id?: string;
  subtitles?: AniHubSubtitle[];
}

export interface AniHubStudio {
  id?: number;
  studio_name?: string;
  display_name?: string | null;
  studio_slug?: string;
  logo_url?: string | null;
  studio_brands?: string[];
  is_collaboration?: boolean;
  voice_type?: string;
  track_kind?: string;
  language?: string;
  season_number?: number;
  edition?: string;
  embed_url?: string;
  episodes_count?: number;
  episodes?: AniHubStudioEpisode[];
}

export interface AniHubEpisodeSources {
  moonanime?: AniHubStudio[];
  ashdi?: AniHubStudio[];
  fenix?: AniHubStudio[];
  fenix_mini?: AniHubStudio[];
  fenix_editions?: unknown[];
  fenix_embed_url?: string;
  filler_episodes?: number[];
  recap_episodes?: number[];
  statistics?: Record<string, unknown>;
}
