import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { getAniHub } from './get.js';
import { searchAniHub } from './search.js';

/**
 * AniHub (anihub.in.ua) — український аніме-агрегатор і власник Fenix CDN.
 * Через його API /anime/<id>/episode-sources віддаються ashdi, moonanime і fenix.
 */
export class AniHubProvider implements Provider {
  readonly name = 'anihub';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchAniHub(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getAniHub(target, options);
  }
}

export const anihub = new AniHubProvider();
export const anihubProvider = anihub;
