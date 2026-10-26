import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchUnimay } from './search.js';
import { getUnimay } from './get.js';

export class UnimayProvider implements Provider {
  readonly name = 'unimay';
  readonly cdns = ['unimay'] as const;
  readonly priority = 1 as const;
  readonly animeOnly = true as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUnimay(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getUnimay(target, options);
  }
}

export const unimayProvider = new UnimayProvider();
export default unimayProvider;
