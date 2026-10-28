import type { MediaMetadata, ProviderResult, SearchResult } from './media.js';

export interface ProviderSearchOptions {
  signal?: AbortSignal;
  year?: number;
  type?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  meta?: MediaMetadata;
  clientIp?: string;
}

export interface ProviderGetOptions {
  signal?: AbortSignal;
  season?: number;
  episode?: number;
  meta?: MediaMetadata;
  clientIp?: string;
}

export interface Provider {
  readonly name: string;
  readonly cdns?: readonly string[];
  readonly priority?: number;
  readonly animeOnly?: boolean;
  search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]>;
  get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null>;
}
