import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchKinoUkr } from './search.js';
import { getKinoUkr } from './get.js';
import { getKinoUkrDb } from './db.js';

export class KinoUkrProvider implements Provider {
  readonly name = 'kinoukr';

  public async init(forceSync = false): Promise<void> {
    await getKinoUkrDb(forceSync);
  }

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchKinoUkr(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getKinoUkr(target, options);
  }
}

export const kinoukr = new KinoUkrProvider();
export const kinoukrProvider = kinoukr;
