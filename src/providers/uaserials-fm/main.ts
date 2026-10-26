import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchUaSerialsFm } from './search.js';
import { getUaSerialsFm } from './get.js';

export class UaSerialsFmProvider implements Provider {
  readonly name = 'uaserials-fm';
  readonly cdns = ['hdvb', 'ashdi'] as const;
  readonly priority = 1 as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUaSerialsFm(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getUaSerialsFm(target, options);
  }
}

export const uaserialsFmProvider = new UaSerialsFmProvider();
export default uaserialsFmProvider;
