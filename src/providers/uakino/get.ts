import type { ProviderResult, SearchResult } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { getUakinoApp } from './app.js';
import { getUakinoWeb } from './web.js';

export async function getUakino(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  // 1. If explicit web target (from web search or direct URL)
  if (typeof target === 'object' && target.details?.source === 'web') {
    return getUakinoWeb(target, options);
  }

  if (typeof target === 'string' && (target.startsWith('http') || target.includes('.html'))) {
    return getUakinoWeb(target, options);
  }

  // 2. Try App (local DB) first
  try {
    const appResult = await getUakinoApp(target, options);
    if (appResult) {
      return appResult;
    }
  } catch (err) {
    // Continue to web fallback
  }

  // 3. Fallback to web
  try {
    return await getUakinoWeb(target, options);
  } catch (err) {
    return null;
  }
}
