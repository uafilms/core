import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchKlon } from './search.js';
import { getKlon } from './get.js';

export class KlonProvider implements Provider {
  readonly name = 'klon';
  readonly cdns = ['ashdi'] as const;
  readonly priority = 2 as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchKlon(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getKlon(target, options);
  }
}

export const klonProvider = new KlonProvider();
export default klonProvider;
