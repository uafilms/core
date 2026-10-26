import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchUfdub } from './search.js';
import { getUfdub } from './get.js';

export class UfdubProvider implements Provider {
  readonly name = 'ufdub';
  readonly cdns = ['ufdub'] as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUfdub(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getUfdub(target, options);
  }
}

export const ufdubProvider = new UfdubProvider();
export default ufdubProvider;
