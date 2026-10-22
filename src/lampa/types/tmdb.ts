export interface TmdbEpisodeItem {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview?: string;
  still_path?: string;
  air_date?: string;
  vote_average?: number;
  runtime?: number;
}

export interface TmdbSeasonResponse {
  id?: number;
  season_number?: number;
  name?: string;
  overview?: string;
  episodes?: TmdbEpisodeItem[];
}
