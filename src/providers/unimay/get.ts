import type {
  Episode,
  ProviderResult,
  SearchResult,
  Season,
  StreamSource,
} from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { searchUnimay } from './search.js';
import { UNIMAY_API_BASE_URL, UNIMAY_BASE_URL, UNIMAY_UA } from './config.js';
import type { UnimayPlaylistItem, UnimayReleaseResponse } from './types.js';

const unimayCache = new Map<string, { result: ProviderResult; timestamp: number }>();
const UNIMAY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getUnimay(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let code = '';
  const meta = options?.meta;

  if (typeof target === 'object') {
    code = (target.details?.code as string) || target.id;
    if (code.startsWith('http')) {
      const match = code.match(/\/projects\/([^/?#]+)/);
      if (match) code = match[1];
    }
  } else if (target.startsWith('http://') || target.startsWith('https://')) {
    const match = target.match(/\/projects\/([^/?#]+)/);
    code = match ? match[1] : target;
  } else if (target) {
    code = target;
  }

  if (!code && meta?.title) {
    const results = await searchUnimay(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
    });
    if (results.length > 0) {
      code = (results[0].details?.code as string) || results[0].id;
    }
  }

  if (!code) return null;

  const cached = unimayCache.get(code);
  if (cached && Date.now() - cached.timestamp < UNIMAY_CACHE_TTL) {
    return cached.result;
  }

  const url = `${UNIMAY_API_BASE_URL}/release?code=${encodeURIComponent(code)}`;

  try {
    const res = await httpRequest<UnimayReleaseResponse>({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UNIMAY_UA,
        'Referer': `${UNIMAY_BASE_URL}/`,
        'Accept': 'application/json',
      },
      signal: options?.signal,
    });

    if (res.status !== 200 || !res.data || !Array.isArray(res.data.playlist)) {
      return null;
    }

    const release = res.data;
    const playlist: UnimayPlaylistItem[] = release.playlist!;
    const isMovie =
      release.type?.toLowerCase().includes('фільм') ||
      (playlist.length === 1 && meta?.type === 'movie');

    // Parse season number from code slug (e.g. "rezero-3" -> 3) or default to requested season
    const seasonMatch = code.match(/-(\d+)$/);
    const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : (options?.season || 1);

    if (isMovie) {
      const sources: StreamSource[] = [];
      const item = playlist[0];
      if (item?.hls) {
        const streamUrl =
          item.hls.master ||
          item.hls.qualities?.fhd ||
          item.hls.qualities?.hd ||
          item.hls.qualities?.sd;
        if (streamUrl) {
          sources.push({
            title: 'Unimay Media',
            audio: 'Unimay Media',
            url: streamUrl,
            mime: 'application/x-mpegURL',
            quality: 'FHD',
            lazy: {
              cdn: 'unimay',
              type: 'vod',
              id: item.uuid,
              url: streamUrl,
              directUrl: streamUrl,
            },
          });
        }
      }

      if (sources.length === 0) return null;

      const result: ProviderResult = {
        provider: 'unimay',
        type: 'movie',
        sources,
      };

      unimayCache.set(code, { result, timestamp: Date.now() });
      return result;
    }

    // Series
    const episodes: Episode[] = [];

    for (const item of playlist) {
      if (!item.hls) continue;
      const streamUrl =
        item.hls.master ||
        item.hls.qualities?.fhd ||
        item.hls.qualities?.hd ||
        item.hls.qualities?.sd;
      if (!streamUrl) continue;

      const epSources: StreamSource[] = [
        {
          title: 'Unimay Media',
          audio: 'Unimay Media',
          url: streamUrl,
          mime: 'application/x-mpegURL',
          quality: 'FHD',
          lazy: {
            cdn: 'unimay',
            type: 'vod',
            id: item.uuid,
            url: streamUrl,
            directUrl: streamUrl,
          },
        },
      ];

      episodes.push({
        episode: item.number,
        title: item.title,
        sources: epSources,
      });
    }

    if (episodes.length === 0) return null;

    episodes.sort((a, b) => a.episode - b.episode);

    const seasons: Season[] = [
      {
        season: seasonNum,
        episodes,
      },
    ];

    const result: ProviderResult = {
      provider: 'unimay',
      type: 'tv',
      seasons,
    };

    unimayCache.set(code, { result, timestamp: Date.now() });
    return result;
  } catch {
    return null;
  }
}
