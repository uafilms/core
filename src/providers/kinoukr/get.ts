import type { ProviderResult, SearchResult } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { getKinoUkrDb } from './db-ops.js';
import { getKinoUkrWeb } from './web.js';

export async function getKinoUkr(
  target: SearchResult | string,
  options: ProviderGetOptions = {}
): Promise<ProviderResult | null> {
  // 1. If explicit web target (from web search or direct URL)
  if (typeof target === 'object' && target.details?.source === 'web') {
    return getKinoUkrWeb(target, options);
  }

  if (typeof target === 'string' && (target.startsWith('http') || target.includes('.html'))) {
    return getKinoUkrWeb(target, options);
  }

  // 2. Try DB first
  try {
    const dbResult = await getKinoUkrDb(target, options);
    if (dbResult) {
      return dbResult;
    }
  } catch (err) {
    // Continue to web fallback
  }

  // 3. Fallback to web
  try {
    const query = typeof target === 'string' && target.startsWith('tt') && options.meta?.title
      ? options.meta.title
      : target;
    return await getKinoUkrWeb(query, options);
  } catch (err) {
    return null;
  }
}
