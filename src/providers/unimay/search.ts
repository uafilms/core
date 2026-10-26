import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import { UNIMAY_API_BASE_URL, UNIMAY_BASE_URL, UNIMAY_IMG_BASE_URL, UNIMAY_UA } from './config.js';
import type { UnimaySearchResponse } from './types.js';

export async function searchUnimay(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const url = `${UNIMAY_API_BASE_URL}/release/search?title=${encodeURIComponent(searchTerm)}&page=0&page_size=20`;

  try {
    const res = await httpRequest<UnimaySearchResponse>({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UNIMAY_UA,
        'Referer': `${UNIMAY_BASE_URL}/`,
        'Accept': 'application/json',
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data || !Array.isArray(res.data.content)) {
      return [];
    }

    const results: SearchResult[] = res.data.content.map((item) => {
      const isMovie = item.type?.toLowerCase().includes('фільм');
      const type: 'movie' | 'tv' = isMovie ? 'movie' : 'tv';
      const title = item.names?.ukr || item.names?.eng || item.code;
      const poster = item.images?.poster
        ? `${UNIMAY_IMG_BASE_URL}/${item.images.poster}?width=300&format=webp`
        : undefined;

      return {
        id: item.code || String(item.id),
        title,
        originalTitle: item.names?.eng || item.names?.romaji,
        year: item.year,
        type,
        url: `${UNIMAY_BASE_URL}/projects/${item.code}`,
        poster,
        details: {
          code: item.code,
          id: item.id,
          type: item.type,
        },
      };
    });

    return rankSearchResults(results, searchTerm, options?.year, options?.type);
  } catch {
    return [];
  }
}
