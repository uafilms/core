export interface UnimaySearchItem {
  id: number;
  year?: number;
  code: string;
  type?: string;
  names?: {
    ukr?: string;
    eng?: string;
    romaji?: string;
  };
  images?: {
    poster?: string;
    banner?: string;
  };
}

export interface UnimaySearchResponse {
  content: UnimaySearchItem[];
  totalElements?: number;
}

export interface UnimayPlaylistItem {
  id: number;
  number: number;
  title?: string;
  uuid: string;
  duration?: number;
  hls?: {
    master?: string;
    qualities?: {
      sd?: string;
      hd?: string;
      fhd?: string;
    };
  };
}

export interface UnimayReleaseResponse {
  id: number;
  code: string;
  type?: string;
  year?: number;
  imdbId?: string | null;
  names?: {
    ukr?: string;
    eng?: string;
    romaji?: string;
  };
  images?: {
    poster?: string;
  };
  playlist?: UnimayPlaylistItem[];
}
