import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchEneyida } from './search.js';
import { getEneyida } from './get.js';

export class EneyidaProvider implements Provider {
  readonly name = 'eneyida';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchEneyida(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getEneyida(target, options);
  }
}

export const eneyidaProvider = new EneyidaProvider();
export default eneyidaProvider;
