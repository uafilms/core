export interface UakinoRawItem {
  id: number;
  date?: string;
  title: string;
  xfields?: string;
  category?: string;
  alt_name?: string;
}

export interface UakinoParsedXfields {
  year?: number;
  origname?: string;
  imdb_all?: string;
  imdb_id?: string;
  imdb?: string;
  kinopoisk_id?: string;
  poster?: string;
  ashdivip?: string;
  playlist?: string;
  season?: number;
  quality?: string;
  filmtranslation?: string;
}

export interface UakinoDbRow {
  id: number;
  title: string;
  origname: string | null;
  year: number | null;
  imdb_id: string | null;
  imdb_rating: string | null;
  poster: string | null;
  ashdivip: string | null;
  playlist: string | null;
  season: number | null;
  is_tv: number;
  updated_at: number;
}
