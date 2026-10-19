export type PlatformType = 'web' | 'native';

export interface OmssProviderInfo {
  id: string;
  name: string;
  capabilities: ('movies' | 'tv' | 'subtitles')[];
}

export interface OmssRootResponse {
  name: string;
  version: string;
  status: 'operational' | 'degraded' | 'down';
  spec?: string;
  endpoints: {
    movie: string;
    tv: string;
  };
  note?: string;
  media: {
    movies: '*' | number[];
    tv: '*' | unknown[];
  };
  providers: OmssProviderInfo[];
}

export type OmssVideoType = 'hls' | 'mp4' | 'mkv' | 'dash';
export type OmssQuality = '8K' | '4K' | 'QHD' | 'FHD' | 'HD' | 'SD' | 'Auto';

export interface OmssStudioInfo {
  name: string;
  logoUrl?: string;
}

export interface OmssSource {
  id: string;
  url: string;
  streamable: boolean;
  type: OmssVideoType;
  quality: OmssQuality;
  audioTracks: string[];
  /**
   * Студії для кожної озвучки з `audioTracks` (той самий порядок). Потрібно для
   * shared-video джерел, де кілька озвучок ідуть однією доріжкою і мають власні логотипи.
   */
  audioTrackStudios?: OmssStudioInfo[];
  lang?: string;
  studio?: OmssStudioInfo;
  provider: {
    id: string;
    name: string;
  };
  headers?: Record<string, string>;
  /**
   * Озвучки джерела ділять одне відео (напр. Fenix) — клієнт має перемикати
   * їх нативно, запитуючи в проксі злитий майстер (`mergeAudio=1`).
   */
  sharedVideo?: boolean;
}

export interface OmssSubtitle {
  id: string;
  url: string;
  label: string;
  format: 'vtt' | 'srt' | 'ass';
  provider: {
    id: string;
    name: string;
  };
  headers?: Record<string, string>;
}

export interface OmssDiagnostic {
  code: 'PROVIDER_ERROR' | 'PARTIAL_SCRAPE';
  message: string;
  source: string;
  severity: 'warning' | 'error';
}

export interface OmssSourceResponse {
  id: string;
  expiresAt: string;
  sources: OmssSource[];
  subtitles: OmssSubtitle[];
  diagnostics: OmssDiagnostic[];
}

export interface OmssErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  traceId: string;
}
