import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';
import type { SearchResult, ProviderSearchOptions, MediaType } from '../../types/index.js';
import type { MikaiAnimeItem, MikaiEnvelope } from './types.js';

const API_BASE = 'https://api.mikai.me/public/v1';

export async function searchMikai(
  query: string,
  options?: ProviderSearchOptions | number
): Promise<SearchResult[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const targetYear = typeof options === 'number' ? options : options?.year;
  const signal = typeof options === 'object' ? options?.signal : undefined;
  const targetType = typeof options === 'object' ? options?.type : undefined;

  try {
    const url = new URL(`${API_BASE}/anime`);
    url.searchParams.set('search', trimmed);
    url.searchParams.set('limit', '20');

    if (targetYear) {
      url.searchParams.set('years', String(targetYear));
    }

    if (targetType) {
      if (targetType === 'movie') {
        url.searchParams.set('formats', 'movie');
      } else if (targetType === 'tv') {
        url.searchParams.set('formats', 'tv,ova,ona,special');
      }
    }

    const response = await httpRequest<MikaiEnvelope<MikaiAnimeItem[]>>(url.toString(), {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    const items = response.data?.result || [];
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const results: SearchResult[] = items.map((item) => {
      const mediaType: MediaType = item.format === 'movie' ? 'movie' : 'tv';
      const poster =
        item.images?.poster?.medium?.webp ||
        item.images?.poster?.big?.webp ||
        item.images?.poster?.medium?.jpg ||
        item.images?.poster?.big?.jpg;

      return {
        id: String(item.ids.mikai),
        title: item.titles.ua || item.titles.original || item.titles.english || '',
        originalTitle: item.titles.original || item.titles.english,
        year: item.year,
        type: mediaType,
        poster,
        url: item.ids.slug ? `https://mikai.me/anime/${item.ids.slug}` : `https://mikai.me/anime/${item.ids.mikai}`,
      };
    });

    const ranked = rankSearchResults(results, query, targetYear, targetType);
    // Strict threshold: anime title must have some overlap with query
    const cleanQuery = trimmed.toLowerCase();
    const queryTokens = cleanQuery.split(/[\s,.:;!?'"-]+/).filter(t => t.length > 2);
    
    return ranked.filter(r => {
      const titleLower = (r.title + ' ' + (r.originalTitle || '')).toLowerCase();
      if (titleLower.includes(cleanQuery)) return true;
      if (queryTokens.length > 0 && queryTokens.every(tok => titleLower.includes(tok))) return true;
      return false;
    });
  } catch {
    return [];
  }
}
