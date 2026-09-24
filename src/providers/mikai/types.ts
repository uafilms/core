export interface MikaiAnimeTitle {
  ua?: string;
  english?: string;
  original?: string;
  japanese?: string;
}

export interface MikaiAnimeIds {
  mikai: number;
  slug?: string;
  mal?: number;
  al?: number;
  hikka?: string;
  imdb?: string;
}

export interface MikaiImageSizes {
  webp?: string;
  jpg?: string;
}

export interface MikaiImages {
  poster?: {
    big?: MikaiImageSizes;
    medium?: MikaiImageSizes;
    small?: MikaiImageSizes;
  };
  banner?: {
    big?: MikaiImageSizes;
    medium?: MikaiImageSizes;
    small?: MikaiImageSizes;
  };
}

export interface MikaiAnimeItem {
  ids: MikaiAnimeIds;
  titles: MikaiAnimeTitle;
  images?: MikaiImages;
  format?: 'tv' | 'movie' | 'special' | 'ova' | 'ona' | 'music' | 'other' | 'unknown';
  status?: string;
  season?: string;
  year?: number;
  episodes?: number;
  isAdult?: boolean;
}

export interface MikaiSource {
  provider: 'ashdi' | 'moon' | 'tortuga' | string;
  embedUrl: string;
  addedAt?: string;
}

export interface MikaiEpisode {
  number: number;
  label?: string;
  kind?: string;
  addedAt?: string;
  sources: MikaiSource[];
}

export interface MikaiTeam {
  id: number;
  name: string;
  slug: string;
  avatar?: {
    big?: MikaiImageSizes;
    medium?: MikaiImageSizes;
    small?: MikaiImageSizes;
  };
}

export interface MikaiRelease {
  id: string;
  kind: 'voice' | 'sub' | string;
  isCollab?: boolean;
  teams?: MikaiTeam[];
  episodesCount?: number;
  lastEpisode?: number;
  updatedAt?: string;
  episodes?: MikaiEpisode[];
}

export interface MikaiPlayerResult {
  anime: {
    ids: MikaiAnimeIds;
    titles: MikaiAnimeTitle;
  };
  licensed?: boolean;
  releases?: MikaiRelease[];
}

export interface MikaiEnvelope<T> {
  ok: boolean;
  result: T;
  total?: number;
  page?: number;
  pages?: number;
}
