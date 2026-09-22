import type { Provider, ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import type { ProviderResult, SearchResult } from '../../types/media.js';
import { searchAnimeOn } from './search.js';
import { getAnimeOnStreams } from './get.js';

export class AnimeOnProvider implements Provider {
  readonly name = 'animeon';

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchAnimeOn(query, options);
  }

  async get(target: SearchResult | string, options?: ProviderGetOptions): Promise<ProviderResult | null> {
    return getAnimeOnStreams(target, options);
  }
}

export { resolveAnimeOnEpisode } from './get.js';
export const animeOnProvider = new AnimeOnProvider();
