import { search } from './search.js';
import { get } from './get.js';
import { rankSearchResults } from '../../utils/sort.js';
import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';

export class UaSerialsProvider implements Provider {
  readonly name = 'uaserials';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    const results = await search(query, options?.year);
    return results;
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    const url = typeof target === 'string' ? target : target.url;
    const result = await get(url);

    if (!result || result.streams.length === 0) {
      return null;
    }

    const type = options?.meta?.type || 'movie';

    return {
      provider: this.name,
      type,
      sources: result.streams,
    };
  }
}

export const uaserialsProvider = new UaSerialsProvider();
export default uaserialsProvider;
