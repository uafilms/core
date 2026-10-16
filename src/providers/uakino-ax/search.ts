import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import type { MediaType, SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { API_BASE, API_HEADERS, pageUrlFor, posterUrl } from './common.js';
import type { UakinoAxSearchItem, UakinoAxSearchResponse } from './types.js';

function parseYear(item: UakinoAxSearchItem): number | undefined {
  const raw = item.year_start ?? item.year;
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : raw ?? undefined;
  return parsed && !Number.isNaN(parsed) ? parsed : undefined;
}

export async function searchUakinoAx(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const targetYear = options?.year;
  const targetType = options?.type;
  const signal = options?.signal;

  try {
    const res = await httpRequest<UakinoAxSearchResponse>(`${API_BASE}/search`, {
      params: { q: trimmed },
      headers: API_HEADERS,
      signal,
      timeout: 10000,
    });

    const items = res.data?.items;
    if (!Array.isArray(items) || items.length === 0) return [];

    const results: SearchResult[] = items.map((item) => {
      const mediaType: MediaType = item.type === 'series' ? 'tv' : 'movie';
      return {
        id: String(item.id),
        title: item.title,
        year: parseYear(item),
        type: mediaType,
        poster: posterUrl(item.poster),
        url: `/api/movie/${item.id}`,
        details: {
          uakinoAxId: String(item.id),
          slug: item.slug,
          uakinoAxUrl: pageUrlFor(item),
          quality: item.quality || undefined,
          imdbRating: item.imdb_rating ?? undefined,
          seasonsCount: item.seasons_count ?? undefined,
          episodesCount: item.episodes_count ?? undefined,
        },
      };
    });

    return rankSearchResults(results, trimmed, targetYear, targetType, options?.season);
  } catch {
    return [];
  }
}
