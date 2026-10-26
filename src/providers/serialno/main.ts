import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchSerialno } from './search.js';
import { getSerialno } from './get.js';

export class SerialnoProvider implements Provider {
  readonly name = 'serialno';
  readonly cdns = ['ashdi'] as const;
  readonly priority = 2 as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchSerialno(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getSerialno(target, options);
  }
}

export const serialnoProvider = new SerialnoProvider();
export default serialnoProvider;
