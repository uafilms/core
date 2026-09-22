export interface KinoUkrJsonItem {
  name: string;
  eng_name?: string | null;
  year?: string | null;
  kp_id?: string | null;
  imdb_id?: string | null;
  ashdi?: string | null;
  tortuga?: string | null;
}

export type KinoUkrJsonMap = Record<string, KinoUkrJsonItem>;

export interface KinoUkrDbRow {
  slug: string;
  title: string;
  eng_name: string;
  search_title: string;
  search_eng: string;
  year: string;
  kp_id: string;
  imdb_id: string;
  ashdi: string;
  tortuga: string;
  is_tv?: number;
}
