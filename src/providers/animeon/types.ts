export interface AnimeOnSearchItem {
  id: number | string;
  titleUa?: string;
  titleEn?: string;
  title?: string; // Fallback
  originalTitle?: string; // Fallback
  slug?: string;
  releaseDate?: string;
  year?: number;
  imdbId?: string;
  season?: number;
  type?: string | { id?: number; name?: string };
  image?: {
    id?: number;
    preview?: string;
    original?: string;
  };
  poster?: {
    path?: string;
    source?: string;
  };
}

export interface AnimeOnSearchResponse {
  result?: AnimeOnSearchItem[];
  results?: AnimeOnSearchItem[];
  count?: number;
  totalCount?: number;
}

export interface AnimeOnPlayer {
  id: number;
  name: string; // 'Ashdi' | 'Moon'
  playerType?: number;
}

export interface AnimeOnTranslation {
  id: number;
  name: string; // e.g. "FanVoxUA", "Субтитри", "MelodicVoiceStudio"
  players: AnimeOnPlayer[];
}

export interface AnimeOnEpisodeItem {
  id: number;
  episode: number;
  name?: string;
}

export interface AnimeOnEpisodeResponse {
  videoUrl: string;
}
