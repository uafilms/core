import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { searchUakinoApp } from './app.js';
import { searchUakinoWeb } from './web.js';

export async function searchUakino(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // 1. First, search local SQLite DB (instant <1ms, 32k titles)
  try {
    const appResults = await searchUakinoApp(cleanQuery, options);
    if (appResults.length > 0) {
      return appResults;
    }
  } catch (err) {
    // If local DB fails or not initialized, continue to Web fallback
  }

  // 2. If nothing found in DB (e.g. brand new title), fallback to web scraping
  try {
    return await searchUakinoWeb(cleanQuery, options);
  } catch (err) {
    return [];
  }
}
