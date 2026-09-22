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

export interface OmssSource {
  id: string;
  url: string;
  streamable: boolean;
  type: OmssVideoType;
  quality: OmssQuality;
  audioTracks: string[];
  provider: {
    id: string;
    name: string;
  };
  headers?: Record<string, string>;
}

export interface OmssSubtitle {
  id: string;
  url: string;
  label: string;
  format: 'vtt' | 'srt';
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
