import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchBamboo } from './search.js';
import { getBamboo } from './get.js';

export class BambooUaProvider implements Provider {
  readonly name = 'bambooua';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchBamboo(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getBamboo(target, options);
  }
}

export const bambooUaProvider = new BambooUaProvider();
export default bambooUaProvider;
