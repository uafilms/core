export interface FrankoTranslation {
  id: number;
  title: string;
  episodes_qty?: number;
}

export interface FrankoPlayerPayload {
  id: number;
  is_serial: boolean;
  type?: 'movie' | 'serial' | string;
  cover_url?: string;
  translations?: FrankoTranslation[];
  seasons?: Record<string, number>;
  episodes?: number[];
  seasons_episodes?: Record<string, number[]>;
  translate?: number;
}

export interface FrankoFilesRequest {
  id: number;
  translation: number;
  season_number?: number | null;
  episode_number?: number | null;
  force_cdn?: string;
  turnstile_token?: string;
}

export interface FrankoFilesResponse {
  file: string;
  media_id?: number;
}
