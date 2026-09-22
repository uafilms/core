import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { searchKinoUkrDb } from './db-ops.js';
import { searchKinoUkrWeb } from './web.js';

export async function searchKinoUkr(
  query: string,
  options: ProviderSearchOptions = {}
): Promise<SearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  // 1. Search local SQLite DB first (instant)
  try {
    const dbResults = await searchKinoUkrDb(cleanQ, options);
    if (dbResults.length > 0) {
      return dbResults;
    }
  } catch (err) {
    // If DB fails, fallback to web
  }

  // 2. Fallback to web search
  try {
    return await searchKinoUkrWeb(cleanQ, options);
  } catch (err) {
    return [];
  }
}
