export interface OmssSubtitleItem {
  label: string;
  url: string;
}

export interface OmssSourceItem {
  id?: string;
  title?: string;
  audio?: string;
  audioTracks?: string[];
  studio?: {
    name?: string;
    logoUrl?: string;
  };
  quality?: string;
  url: string;
  videoType?: 'hls' | 'mp4' | 'dash' | string;
  subtitles?: OmssSubtitleItem[];
  provider?: {
    id: string;
    name: string;
  };
}

export interface OmssProviderItem {
  provider: string;
  name: string;
  sources: OmssSourceItem[];
  subtitles?: OmssSubtitleItem[];
  removed?: boolean;
}

export interface OmssMovieResponse {
  title?: string;
  type?: 'movie';
  providers?: OmssProviderItem[];
  sources?: OmssSourceItem[];
}

export interface OmssTvEpisodeResponse {
  title?: string;
  type?: 'tv';
  season?: number;
  episode?: number;
  providers?: OmssProviderItem[];
  sources?: OmssSourceItem[];
}
