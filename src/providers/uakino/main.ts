import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchUakino } from './search.js';
import { getUakino } from './get.js';
import { getUakinoDb } from './db.js';

export class UakinoProvider implements Provider {
  readonly name = 'uakino';

  public async init(forceSync = false): Promise<void> {
    await getUakinoDb(forceSync);
  }

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUakino(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getUakino(target, options);
  }
}

export const uakino = new UakinoProvider();
export const uakinoProvider = uakino;
