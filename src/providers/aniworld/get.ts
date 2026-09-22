import type { ProviderGetOptions } from '../../types/provider.js';
import type { Episode, ProviderResult, SearchResult, Season, StreamSource } from '../../types/media.js';
import { httpRequest } from '../../utils/http.js';
import { aniWorldVod } from '../../vods/aniworld/main.js';
import type { AniWorldDetail } from './types.js';

export async function getAniWorld(
  target: string | SearchResult,
  _options: ProviderGetOptions = {}
): Promise<ProviderResult | null> {
  let catalogId: string | null = null;

  if (typeof target === 'object' && target !== null) {
    catalogId = target.id;
  } else if (typeof target === 'string') {
    const trimmed = target.trim();
    const idMatch = trimmed.match(/\/catalog\/(\d+)/) || trimmed.match(/^(\d+)$/);
    if (idMatch) {
      catalogId = idMatch[1];
    }
  }

  if (!catalogId) return null;

  const endpoints = [
    `https://aniworldua.com/api/catalog/${catalogId}/detail`,
    `https://api.aniworldua.com/api/v1/catalog/detail/${catalogId}/`,
  ];

  let detail: AniWorldDetail | null = null;

  for (const endpoint of endpoints) {
    try {
      const res = await httpRequest(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://aniworldua.com/',
        },
        timeout: 5000,
      });

      if (res.data && (res.data as any).id) {
        detail = res.data as AniWorldDetail;
        break;
      }
    } catch {
      // спробувати наступний ендпоінт
    }
  }

  if (!detail) return null;

  const rawEpisodes = detail.episodes || [];
  const isMovie = detail.media_type === 'MOVIE' || rawEpisodes.length === 1;

  if (isMovie && rawEpisodes.length <= 1) {
    const epId = rawEpisodes[0]?.id || catalogId;
    let movieSources: StreamSource[] = [];

    // Спробувати розшифрувати джерело через VOD
    try {
      const vodRes = await aniWorldVod.extract(`cdn=aniworld&episodeId=${epId}`);
      if (vodRes && vodRes.sources && vodRes.sources.length > 0) {
        movieSources = vodRes.sources;
      }
    } catch {
      // fallback на lazy stream
    }

    if (movieSources.length === 0) {
      const lazyUrl = `/master.m3u8?cdn=aniworld&episodeId=${epId}`;
      movieSources = [
        {
          title: 'AniWorld UA (ШІ)',
          url: lazyUrl,
          mime: 'application/x-mpegURL',
          lazy: {
            cdn: 'aniworld',
            type: 'episode',
            id: String(epId),
            url: lazyUrl,
          },
        },
      ];
    }

    return {
      provider: 'aniworld',
      type: 'movie',
      sources: movieSources,
    };
  }

  // Серіал (ONA, TV тощо)
  if (rawEpisodes.length === 0) return null;

  // Сортуємо серії за номером від 1 до N
  const sortedRawEpisodes = [...rawEpisodes].sort((a, b) => a.episode - b.episode);

  const episodes: Episode[] = sortedRawEpisodes.map((ep) => {
    const lazyUrl = `/master.m3u8?cdn=aniworld&episodeId=${ep.id}`;
    const source: StreamSource = {
      title: 'AniWorld UA (ШІ)',
      url: lazyUrl,
      mime: 'application/x-mpegURL',
      lazy: {
        cdn: 'aniworld',
        type: 'episode',
        id: String(ep.id),
        url: lazyUrl,
      },
    };

    return {
      episode: ep.episode,
      title: `Серія ${ep.episode}`,
      sources: [source],
    };
  });

  const season: Season = {
    season: 1,
    episodes,
  };

  return {
    provider: 'aniworld',
    type: 'tv',
    seasons: [season],
  };
}
