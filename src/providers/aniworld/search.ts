import type { ProviderSearchOptions } from '../../types/provider.js';
import type { SearchResult } from '../../types/media.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import type { AniWorldCatalogListResponse } from './types.js';

export async function searchAniWorld(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
  if (!query || !query.trim()) return [];

  const trimmed = query.trim();
  const searchQueries = [trimmed];

  const foundItemsMap = new Map<number, SearchResult>();

  for (const q of searchQueries) {
    try {
      const endpoints = [
        `https://api.aniworldua.com/api/v1/catalog/list/?search=${encodeURIComponent(q)}`,
        `https://aniworldua.com/api/catalog/list?search=${encodeURIComponent(q)}`,
      ];

      let data: AniWorldCatalogListResponse | null = null;

      for (const endpoint of endpoints) {
        try {
          const res = await httpRequest(endpoint, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              Referer: 'https://aniworldua.com/',
            },
            timeout: 5000,
          });

          if (res.data && Array.isArray((res.data as any).results)) {
            data = res.data as AniWorldCatalogListResponse;
            break;
          }
        } catch {
          // спробувати наступний ендпоінт
        }
      }

      if (!data || !Array.isArray(data.results)) continue;

      for (const item of data.results) {
        if (!item || !item.id || foundItemsMap.has(item.id)) continue;

        const isMovie = item.media_type === 'MOVIE' || (item.total_episodes === 1 && item.current_episodes === 1);
        const posterUrl = item.poster
          ? (item.poster.startsWith('http') ? item.poster : `https://aniworldua.com${item.poster}`)
          : undefined;

        foundItemsMap.set(item.id, {
          id: String(item.id),
          title: item.title,
          originalTitle: item.original_title || item.romanized_title,
          year: item.release_year,
          type: isMovie ? 'movie' : 'tv',
          poster: posterUrl,
          url: `https://aniworldua.com/catalog/${item.id}`,
        });
      }
    } catch {
      // ігноруємо помилки пошуку
    }
  }

  const results = Array.from(foundItemsMap.values());
  return rankSearchResults(results, trimmed, options?.year);
}
