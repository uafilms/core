import { getCachedPowToken } from '../pow/index.js';

declare const Lampa: any;

export function getAuthHeadersAndParams(): {
  headers: Record<string, string>;
  params: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const params: Record<string, string> = {};

  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const apiKey = Lampa.Storage.get('uafilms_api_key', '');
      if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
        headers['x-api-key'] = apiKey.trim();
        params['api_key'] = apiKey.trim();
      }
    }
  } catch {
    // Ignore storage read error
  }

  // If no explicit API key, attach cached PoW token if one already exists in cache (0ms cost)
  if (!headers['x-api-key']) {
    const cachedPow = getCachedPowToken();
    if (cachedPow) {
      params['pow_token'] = cachedPow;
      headers['x-pow-token'] = cachedPow;
    }
  }

  return { headers, params };
}
