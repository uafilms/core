export type MediaType = 'movie' | 'tv';

export interface Subtitle {
  lang: string;
  label: string;
  url: string;
  /** Формат доріжки: ass — стилізовані субтитри (рендерить плеєр через libass), vtt — нативні браузерні треки. */
  format?: 'vtt' | 'srt' | 'ass';
}

export interface LazyStream {
  cdn: string;
  type: 'vod' | 'embed' | 'direct' | string;
  id?: string;
  url: string;
  directUrl?: string;
}

export interface StreamSource {
  title: string;          // Назва озвучки / серії / варіанту (напр. "Дубляж (Postmodern)")
  audio?: string;          // Назва аудіодоріжки / студії (напр. "DniproFilm")
  url: string;            // Прямий лінк m3u8 / mp4 або VOD посилання
  mime?: 'application/x-mpegURL' | 'video/mp4' | 'video/webm' | string;
  quality?: string;       // Наприклад, "1080p", "720p"
  subtitles?: Subtitle[];
  headers?: Record<string, string>;
  poster?: string | null;
  lazy?: LazyStream;
  /**
   * Істина, якщо всі озвучки CDN використовують один і той самий відеопотік,
   * тож плеєр може перемикати аудіодоріжки нативно (без перезавантаження джерела).
   */
  sharedVideo?: boolean;
  /**
   * Повний список озвучок, доступних у цьому джерелі (HLS audio renditions).
   * Використовується CDN зі спільним відео (Fenix): в OMSS-відповідь джерело
   * потрапляє одним записом, а клієнт бачить усі доріжки в audioTracks.
   */
  audioTracks?: string[];
}

export interface MediaItem {
  id?: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type?: MediaType;
  poster?: string;
  description?: string;
}

export interface Episode {
  episode: number;
  title?: string;
  sources: StreamSource[];
}

export interface Season {
  season: number;
  episodes: Episode[];
}

export interface MediaMetadata {
  id?: string | number;
  imdbId?: string;
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  originalLanguage?: string;
  genres?: string[];
  isAnime?: boolean;
  year?: number;
  type: MediaType;
  season?: number;
  episode?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type?: MediaType;
  url: string;
  poster?: string;
  details?: Record<string, any>;
}

export interface ProviderResult {
  provider: string;
  type: MediaType;
  sources?: StreamSource[]; // Для фільмів
  seasons?: Season[];       // Для серіалів
  error?: string;
}
