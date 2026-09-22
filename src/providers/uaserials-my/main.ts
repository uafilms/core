import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchUaSerialsMy } from './search.js';
import { getUaSerialsMy } from './get.js';

export class UaSerialsMyProvider implements Provider {
  readonly name = 'uaserials-my';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUaSerialsMy(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getUaSerialsMy(target, options);
  }
}

export const uaserialsMyProvider = new UaSerialsMyProvider();
export default uaserialsMyProvider;
