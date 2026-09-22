import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchAniWorld } from './search.js';
import { getAniWorld } from './get.js';

export class AniWorldProvider implements Provider {
  readonly name = 'aniworld';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchAniWorld(query, options);
  }

  async get(target: string | SearchResult, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getAniWorld(target, options);
  }
}

export const aniWorldProvider = new AniWorldProvider();
