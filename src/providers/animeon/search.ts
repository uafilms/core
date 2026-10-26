import type { SearchResult, MediaType } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import type { AnimeOnSearchResponse, AnimeOnSearchItem } from './types.js';

/**
 * Raw search against the AnimeON catalog (no ranking, no filtering).
 * Used both by `searchAnimeOn` and by the season/part resolution in get.ts,
 * which needs every entry of a franchise (e.g. separate cours of one season).
 */
export async function fetchAnimeOnItems(
  query: string,
  options?: { signal?: AbortSignal }
): Promise<AnimeOnSearchItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://animeon.club/',
  };

  try {
    // Endpoint 1: /api/anime/search?text=...
    const res1 = await httpRequest<AnimeOnSearchResponse>(
      `https://animeon.club/api/anime/search?text=${encodeURIComponent(trimmed)}`,
      { headers, signal: options?.signal, timeout: 8000 }
    );

    let items = res1.data?.result || res1.data?.results;

    if (!Array.isArray(items) || items.length === 0) {
      // Endpoint 2 fallback: /api/anime?search=...
      const res2 = await httpRequest<AnimeOnSearchResponse>(
        `https://animeon.club/api/anime?search=${encodeURIComponent(trimmed)}`,
        { headers, signal: options?.signal, timeout: 8000 }
      );
      items = res2.data?.result || res2.data?.results;
    }

    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function mapAnimeOnItem(item: AnimeOnSearchItem): SearchResult {
  const typeStr = typeof item.type === 'string'
    ? item.type.toLowerCase()
    : (item.type?.name?.toLowerCase() || '');
  const mediaType: MediaType = typeStr.includes('фільм') || typeStr.includes('movie') ? 'movie' : 'tv';

  const title = item.titleUa || item.title || '';
  const originalTitle = item.titleEn || item.originalTitle || undefined;
  const year = item.year || (item.releaseDate ? parseInt(item.releaseDate, 10) : undefined);

  let posterUrl: string | undefined;
  if (item.image?.preview) {
    posterUrl = `https://animeon.club/api/uploads/images/${item.image.preview}`;
  } else if (item.image?.original) {
    posterUrl = `https://animeon.club/api/uploads/images/${item.image.original}`;
  } else if (item.poster?.source) {
    posterUrl = item.poster.source;
  } else if (item.poster?.path) {
    posterUrl = item.poster.path.startsWith('http')
      ? item.poster.path
      : `https://animeon.club${item.poster.path}`;
  }

  return {
    id: String(item.id),
    title,
    originalTitle,
    year,
    type: mediaType,
    url: `https://animeon.club/anime/${item.slug || item.id}`,
    poster: posterUrl,
    details: {
      animeonId: String(item.id),
      slug: item.slug,
      season: item.season ?? null,
      episodes: item.episodes ?? item.episodesAired ?? null,
      malId: item.malId ?? null,
    },
  };
}

export async function searchAnimeOn(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
  const trimmed = query.trim();
  const items = await fetchAnimeOnItems(trimmed, { signal: options?.signal });
  if (items.length === 0) return [];

  const results: SearchResult[] = items.map(mapAnimeOnItem);
  return rankSearchResults(results, trimmed, options?.year, options?.type, options?.season, options?.episode);
}
