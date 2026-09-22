import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchFranko } from './search.js';
import { getFrankoStreams } from './get.js';

export class FrankoProvider implements Provider {
  readonly name = 'franko';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchFranko(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getFrankoStreams(target, options);
  }
}

export const frankoProvider = new FrankoProvider();
