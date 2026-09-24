import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchMikai } from './search.js';
import { getMikai } from './get.js';

export class MikaiProvider implements Provider {
  readonly name = 'mikai';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchMikai(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getMikai(target, options);
  }
}

export const mikaiProvider = new MikaiProvider();
