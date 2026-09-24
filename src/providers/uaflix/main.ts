import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchUaflix } from './search.js';
import { getUaflix } from './get.js';

export class UaflixProvider implements Provider {
  readonly name = 'uaflix';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUaflix(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getUaflix(target, options);
  }
}

export const uaflixProvider = new UaflixProvider();
export default uaflixProvider;
