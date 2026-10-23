import type { OmssProviderItem } from '../types/index.js';
import { requestJson } from '../utils/index.js';
import { getOrSolvePowToken, invalidatePowToken, setPowRequired } from '../pow/index.js';
import { getLocalCache, setLocalCache } from '../cache/index.js';
import { getAuthHeadersAndParams } from './auth.js';
import { streamOmssSources } from './stream.js';

export function groupSourcesByProvider(
  sources: any[],
  subtitles: any[] = []
): OmssProviderItem[] {
  const map = new Map<string, OmssProviderItem>();
  for (const s of sources) {
    const provId = s.provider?.id || 'default';
    const provName = s.provider?.name || provId;
    if (!map.has(provId)) {
      map.set(provId, {
        provider: provId,
        name: provName,
        sources: [],
        subtitles: [],
      });
    }
    map.get(provId)!.sources.push(s);
  }
  for (const sub of subtitles) {
    const provId = sub.provider?.id || 'default';
    if (map.has(provId)) {
      map.get(provId)!.subtitles!.push(sub);
    }
  }
  return Array.from(map.values());
}

export async function streamEpisodeSources(
  host: string,
  id: string | number,
  season: number,
  episode: number,
  onProvider: (chunk: OmssProviderItem) => void,
  onComplete: () => void,
  onError: (err: any) => void
): Promise<() => void> {
  const cacheKey = `tv_providers_${id}_s${season}_e${episode}`;
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

  const url = `${host}/v1/tv/${encodeURIComponent(String(id))}/seasons/${season}/episodes/${episode}?${urlParams.toString()}`;
  const allProviders: OmssProviderItem[] = [];

  let isCancelled = false;
  let activeCancel: (() => void) | null = null;

  const handleFallback = async (isRetry = false) => {
    if (isCancelled) return;
    try {
      const nonSseUrl = `${host}/v1/tv/${encodeURIComponent(String(id))}/seasons/${season}/episodes/${episode}?platform=tv&pow_token=${encodeURIComponent(authParams['pow_token'] || '')}`;
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

export async function fetchEpisodeProviders(
  host: string,
  id: string | number,
  season: number,
  episode: number
): Promise<OmssProviderItem[]> {
  const cacheKey = `tv_providers_${id}_s${season}_e${episode}`;
  const cached = getLocalCache<OmssProviderItem[]>(cacheKey);
  if (cached && cached.length) {
    return cached;
  }

  const { headers, params: authParams } = getAuthHeadersAndParams();
  if (!headers['x-api-key']) {
    const powToken = await getOrSolvePowToken(host);
    if (powToken) {
      authParams['pow_token'] = powToken;
    }
  }

  const urlParams = new URLSearchParams();
  urlParams.set('platform', 'tv');
  for (const [k, v] of Object.entries(authParams)) {
    urlParams.set(k, v);
  }

  const reqUrl = `${host}/v1/tv/${encodeURIComponent(String(id))}/seasons/${season}/episodes/${episode}?${urlParams.toString()}`;

  try {
    const res = await requestJson<any>(reqUrl);
    let providersList: OmssProviderItem[] = [];
    if (res && res.providers && Array.isArray(res.providers)) {
      providersList = res.providers;
    } else if (res && res.sources && Array.isArray(res.sources)) {
      providersList = groupSourcesByProvider(res.sources, res.subtitles || []);
    }
    if (providersList.length > 0) {
      setLocalCache(cacheKey, providersList, 1200);
      return providersList;
    }
  } catch (err: any) {
    setPowRequired(true);
    invalidatePowToken();
    const newToken = await getOrSolvePowToken(host, true);
    if (newToken) {
      urlParams.set('pow_token', newToken);
      try {
        const retryRes = await requestJson<any>(
          `${host}/v1/tv/${encodeURIComponent(String(id))}/seasons/${season}/episodes/${episode}?${urlParams.toString()}`
        );
        let retryList: OmssProviderItem[] = [];
        if (retryRes && retryRes.providers && Array.isArray(retryRes.providers)) {
          retryList = retryRes.providers;
        } else if (retryRes && retryRes.sources && Array.isArray(retryRes.sources)) {
          retryList = groupSourcesByProvider(retryRes.sources, retryRes.subtitles || []);
        }
        if (retryList.length > 0) {
          setLocalCache(cacheKey, retryList, 1200);
          return retryList;
        }
      } catch {
        // Ignore
      }
    }
  }
  return [];
}
