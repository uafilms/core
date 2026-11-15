import type { SearchResult, ProviderSearchOptions } from '../../types/index.js';

/**
 * Wormhole relies on IMDB IDs rather than text search.
 * If an IMDB ID is passed as query (e.g. "tt0137523"), returns a direct match.
 */
export async function search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  const imdbId = cleanQuery.match(/tt\d{6,8}/)?.[0] || options?.meta?.imdbId;

  if (imdbId) {
    return [{
      id: imdbId,
      title: options?.meta?.title || cleanQuery,
      url: `https://makhno.shares.zrok.io/?imdb_id=${imdbId}`,
    }];
  }

  return [];
}
