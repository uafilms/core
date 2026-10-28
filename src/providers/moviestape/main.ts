import type {
  Provider,
  SearchResult,
  ProviderSearchOptions,
  ProviderGetOptions,
  ProviderResult,
} from '../../types/index.js';
import { searchMoviestape } from './search.js';
import { getMoviestape } from './get.js';

export class MoviestapeProvider implements Provider {
  readonly name = 'moviestape';
  readonly cdns = ['sniplyo'] as const;

  async search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
    return searchMoviestape(query, options);
  }

  async get(
    target: SearchResult | string,
    options?: ProviderGetOptions
  ): Promise<ProviderResult | null> {
    return getMoviestape(target, options);
  }
}

export const moviestapeProvider = new MoviestapeProvider();
export default moviestapeProvider;
