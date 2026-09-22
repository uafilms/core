import type { ProviderResult, SearchResult, StreamSource, Season, MediaType } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { bambooVod } from '../../vods/bamboo/main.js';
import { searchBamboo } from './search.js';

const BAMBOO_URL = 'https://bambooua.com';

export async function getBamboo(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let pageUrl = '';
  let meta = options?.meta;

  if (typeof target === 'object') {
    pageUrl = target.url || target.id;
  } else if (target.startsWith('http://') || target.startsWith('https://')) {
    pageUrl = target;
  } else if (meta?.title) {
    const results = await searchBamboo(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
    });
    if (results.length > 0) {
      pageUrl = results[0].url || results[0].id;
    }
  }

  if (!pageUrl) {
    return null;
  }

  if (!pageUrl.startsWith('http')) {
    pageUrl = `${BAMBOO_URL}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
  }

  try {
    const res = await httpRequest<string>({
      url: pageUrl,
      method: 'GET',
      headers: {
        'Referer': `${BAMBOO_URL}/`,
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data) {
      return null;
    }

    const vodResult = await bambooVod.extract(res.data, {
      signal: options?.signal,
    });

    if (!vodResult) {
      return null;
    }

    const isMovie = pageUrl.includes('/cinema/') || meta?.type === 'movie';
    const mediaType: MediaType = isMovie ? 'movie' : 'tv';

    let sources: StreamSource[] | undefined;
    let seasons: Season[] | undefined;

    if (Array.isArray(vodResult)) {
      sources = vodResult;
    } else {
      sources = vodResult.sources;
      seasons = vodResult.seasons;
    }

    return {
      provider: 'bambooua',
      type: mediaType,
      sources,
      seasons,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return null;
  }
}
