import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchKinostrain } from './search.js';
import { getKinostrain } from './get.js';

export class KinostrainProvider implements Provider {
  readonly name = 'kinostrain';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchKinostrain(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getKinostrain(target, options);
  }
}

export const kinostrainProvider = new KinostrainProvider();
export default kinostrainProvider;
