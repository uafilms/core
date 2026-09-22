import type { MediaType, Season, StreamSource } from './media.js';

export interface VodExtractionOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  referer?: string;
  type?: MediaType;
  prefetch?: boolean;
}

export interface VodExtractionResult {
  sources?: StreamSource[];
  seasons?: Season[];
}

export interface VodExtractor {
  readonly name: string;
  extract(url: string, options?: VodExtractionOptions): Promise<VodExtractionResult | null>;
}
