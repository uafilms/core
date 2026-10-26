import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults } from '../../utils/sort.js';

const API_BASE_URL = 'https://api.kinostrain.com/api';
const SITE_BASE_URL = 'https://kinostrain.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0';

interface KinostrainSearchItem {
  name: string;
  originalName?: string | null;
  slug: string;
  type: string;
  format?: string | null;
  imdbMark?: number | null;
  posterUrl?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
}

interface KinostrainSearchResponse {
  data: KinostrainSearchItem[];
  collections?: unknown[];
}

export async function searchKinostrain(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  const url = `${API_BASE_URL}/search?q=${encodeURIComponent(searchTerm)}&limit=20`;

  try {
    const res = await httpRequest<KinostrainSearchResponse>({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        'Referer': `${SITE_BASE_URL}/`,
        'Accept': 'application/json',
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data || !Array.isArray(res.data.data)) {
      return [];
    }

    const results: SearchResult[] = res.data.data.map((item) => {
      const isSerial = item.type === 'serial';
      const type = isSerial ? 'tv' : 'movie';
      const pagePath = isSerial ? 'serials' : 'movies';
      const pageUrl = `${SITE_BASE_URL}/${pagePath}/${item.slug}`;

      return {
        id: item.slug,
        title: item.name,
        originalTitle: item.originalName || undefined,
        year: item.yearStart || undefined,
        type,
        url: pageUrl,
        poster: item.posterUrl || undefined,
        details: {
          slug: item.slug,
          type: item.type,
          format: item.format,
          yearEnd: item.yearEnd,
        },
      };
    });

    return rankSearchResults(results, searchTerm, options?.year, options?.type);
  } catch {
    return [];
  }
}
