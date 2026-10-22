import type { OmssMovieResponse, OmssProviderItem } from '../types/index.js';
import { requestJson } from '../utils/index.js';
import { getOrSolvePowToken } from '../pow/index.js';
import { getLocalCache, setLocalCache } from '../cache/index.js';
import { getAuthHeadersAndParams } from './auth.js';
import { streamOmssSources } from './stream.js';

export async function streamMovieSources(
  host: string,
  id: string | number,
  onProvider: (chunk: OmssProviderItem) => void,
  onComplete: () => void,
  onError: (err: any) => void
): Promise<() => void> {
  const cacheKey = `movie_providers_${id}`;
  const cached = getLocalCache<OmssProviderItem[]>(cacheKey);
  if (cached && cached.length) {
    cached.forEach((p) => onProvider(p));
    onComplete();
    return () => {};
  }

  const { headers, params: authParams } = getAuthHeadersAndParams();

  // Lazy PoW on-demand
  if (!headers['x-api-key']) {
    const powToken = await getOrSolvePowToken(host);
    if (powToken) {
      authParams['pow_token'] = powToken;
    }
  }

  const urlParams = new URLSearchParams();
  urlParams.set('platform', 'tv');
  urlParams.set('sse', '1');
  for (const [k, v] of Object.entries(authParams)) {
    urlParams.set(k, v);
  }

  const url = `${host}/v1/movies/${encodeURIComponent(String(id))}?${urlParams.toString()}`;
  const allProviders: OmssProviderItem[] = [];

  return streamOmssSources(
    url,
    (chunk) => {
      allProviders.push(chunk);
      onProvider(chunk);
    },
    () => {
      if (allProviders.length) {
        setLocalCache(cacheKey, allProviders, 1200);
      }
      onComplete();
    },
    (err) => {
      // If error and we got no providers, try non-SSE fallback
      if (allProviders.length === 0) {
        requestJson<OmssMovieResponse>(
          `${host}/v1/movies/${encodeURIComponent(String(id))}?platform=tv&pow_token=${encodeURIComponent(authParams['pow_token'] || '')}`
        )
          .then((res) => {
            if (res.providers) {
              res.providers.forEach((p) => onProvider(p));
              setLocalCache(cacheKey, res.providers, 1200);
            }
            onComplete();
          })
          .catch(() => onError(err));
      } else {
        onError(err);
      }
    }
  );
}
