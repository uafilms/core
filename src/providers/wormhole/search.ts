import type { SearchResult, ProviderSearchOptions } from '../../types/index.js';

/**
 * Wormhole relies on IMDB IDs rather than text search.
 * If an IMDB ID is passed as query (e.g. "tt0137523"), returns a direct match.
 */
export async function search(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  const imdbMatch = cleanQuery.match(/tt\d{6,8}/);

  if (imdbMatch) {
    const imdbId = imdbMatch[0];
    return [{
      id: imdbId,
      title: cleanQuery,
      url: `https://wh.lme.isroot.in/?imdb_id=${imdbId}`,
    }];
  }

  return [];
}
