export interface LampaSeasonMeta {
  season_number: number;
  episode_count?: number;
  name?: string;
  overview?: string;
  air_date?: string;
  poster_path?: string;
}

export interface LampaMovie {
  id?: number | string;
  imdb_id?: string;
  kinopoisk_id?: number | string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  number_of_seasons?: number;
  seasons?: LampaSeasonMeta[];
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  backdrop_path?: string;
  img?: string;
  overview?: string;
  vote_average?: number | string;
  runtime?: number;
  source?: string;
  genres?: Array<{ id?: number; name?: string }>;
  production_countries?: Array<{ iso_3166_1?: string; name?: string }>;
  [key: string]: any;
}

export interface LampaActivityObject {
  component?: string;
  movie?: LampaMovie;
  card?: LampaMovie;
  search?: string;
  search_one?: string;
  search_two?: string;
  clarification?: boolean;
  page?: number;
  url?: string;
  title?: string;
  [key: string]: any;
}

export interface LampaActivity {
  render(): any;
  loader(state: boolean): void;
  toggle(): void;
  component?: string;
  movie?: LampaMovie;
  card?: LampaMovie;
  [key: string]: any;
}

export interface PlayItem {
  url: string | ((callback: () => void) => void);
  title: string;
  season?: number;
  episode?: number;
  timeline?: any;
  quality?: Record<string, string> | false;
  subtitles?: any[];
  callback?: () => void;
  playlist?: any[];
}

export interface EpisodeRenderItem {
  title: string;
  quality?: string;
  season: number;
  episode: number;
  info?: string;
  voice_name?: string;
  timeline?: any;
  translate_episode_end?: number;
  translate_voice?: string;
  mark?: () => void;
  unmark?: () => void;
  timeclear?: () => void;
  [key: string]: any;
}
