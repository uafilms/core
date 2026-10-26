import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchUakinoAx } from './search.js';
import { getUakinoAx } from './get.js';

/**
 * UaKinoAX (uakino.ax) — рестрім/проксі ashdi з власним lampa-плагіном.
 * Дві стратегії отримання потоків: lampa API та web API (див. UAKINO_AX_API).
 */
export class UaKinoAXProvider implements Provider {
  readonly name = 'uakino-ax';
  readonly cdns = ['uakino-ax', 'ashdi'] as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchUakinoAx(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getUakinoAx(target, options);
  }
}

export const uakinoAxProvider = new UaKinoAXProvider();
export const uakinoAx = uakinoAxProvider;
