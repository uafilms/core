import { search } from './search.js';
import { get } from './get.js';
import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';

export class WormholeProvider implements Provider {
  readonly name = 'wormhole';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return search(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    const targetStr = typeof target === 'string' ? target : target.url || target.id;
    return get(targetStr, options);
  }
}

export const wormholeProvider = new WormholeProvider();
export default wormholeProvider;
