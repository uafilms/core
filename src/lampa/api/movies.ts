import type { OmssProviderItem } from '../types/index.js';
import { requestJson } from '../utils/index.js';
import { getOrSolvePowToken, invalidatePowToken, setPowRequired } from '../pow/index.js';
import { getLocalCache, setLocalCache } from '../cache/index.js';
import { getAuthHeadersAndParams } from './auth.js';
import { streamOmssSources } from './stream.js';
import { groupSourcesByProvider } from './episodes.js';

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

  // Ensure PoW token if no API key: reuses cached token (0ms) or solves ONCE and caches for 14 min
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

  let isCancelled = false;
  let activeCancel: (() => void) | null = null;

  const handleFallback = async (isRetry = false) => {
    if (isCancelled) return;
    try {
      const nonSseUrl = `${host}/v1/movies/${encodeURIComponent(String(id))}?platform=tv&pow_token=${encodeURIComponent(authParams['pow_token'] || '')}`;
      const res = await requestJson<any>(nonSseUrl);
      if (isCancelled) return;

      let providersList: OmssProviderItem[] = [];
      if (res && res.providers && Array.isArray(res.providers)) {
        providersList = res.providers;
      } else if (res && res.sources && Array.isArray(res.sources)) {
        providersList = groupSourcesByProvider(res.sources, res.subtitles || []);
      }

      if (providersList.length > 0) {
        providersList.forEach((p) => onProvider(p));
        setLocalCache(cacheKey, providersList, 1200);
        onComplete();
        return;
      }
      onComplete();
    } catch (err: any) {
      if (isCancelled) return;
      if (!isRetry) {
        setPowRequired(true);
        invalidatePowToken();
        const newToken = await getOrSolvePowToken(host, true);
        if (newToken && !isCancelled) {
          authParams['pow_token'] = newToken;
          await handleFallback(true);
          return;
        }
      }
      onError(err);
    }
  };

  activeCancel = streamOmssSources(
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
    async () => {
      if (allProviders.length === 0) {
        await handleFallback();
      } else {
        onComplete();
      }
    }
  );

  return () => {
    isCancelled = true;
    if (activeCancel) activeCancel();
  };
}
