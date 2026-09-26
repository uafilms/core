import type {
  MediaType,
  ProviderResult,
  SearchResult,
  Season,
  Episode,
  StreamSource,
} from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { extractSeasonFromTitle, sortSeasons, sortSources } from '../../utils/sort.js';
import { searchAnimeOn } from './search.js';
import type { AnimeOnEpisodeItem, AnimeOnTranslation } from './types.js';

interface TranslationsResponse {
  translations?: Array<{
    translation: {
      id: number;
      name: string;
      isSub?: boolean;
    };
    player: Array<{
      id: number;
      name: string;
      episodesCount?: number;
    }>;
  }>;
}

interface EpisodesResponse {
  episodes?: Array<{
    id: number;
    episode: number;
    poster?: string;
  }>;
}

export async function getAnimeOnStreams(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult> {
  let animeId: string | null = null;
  let mediaType: MediaType = 'tv';
  let title = '';

  if (typeof target === 'object' && target !== null) {
    animeId = target.id;
    mediaType = target.type || 'tv';
    title = target.title;
  } else {
    const raw = target.trim();
    // 1. Check if raw is a number or contains slug with id at start (e.g. 216-ataka-tytaniv)
    const matchSlug = raw.match(/(?:anime\/|^)(\d+)(?:-|$)/);
    if (matchSlug) {
      animeId = matchSlug[1];
    } else {
      // 2. Search by text / title
      const searchResults = await searchAnimeOn(raw, {
        signal: options?.signal,
        year: options?.meta?.year,
      });
      if (searchResults.length > 0) {
        animeId = searchResults[0].id;
        mediaType = searchResults[0].type || 'tv';
        title = searchResults[0].title;
      }
    }
  }

  if (!animeId) {
    return { provider: 'animeon', type: mediaType, seasons: [], sources: [] };
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://animeon.club/',
  };

  try {
    // 1. Fetch available translations and players
    const transRes = await httpRequest<TranslationsResponse>(
      `https://animeon.club/api/player/${animeId}/translations`,
      { headers, signal: options?.signal, timeout: 8000 }
    );

    const rawTranslations = transRes.data?.translations;
    if (!rawTranslations || rawTranslations.length === 0) {
      return { provider: 'animeon', type: mediaType, seasons: [], sources: [] };
    }

    // 2. Build list of player/translation pairs to fetch episodes for
    const tasks: Array<{
      translationName: string;
      translationId: number;
      playerName: string;
      playerId: number;
    }> = [];

    for (const t of rawTranslations) {
      const transName = t.translation.name;
      const transId = t.translation.id;
      for (const p of t.player || []) {
        tasks.push({
          translationName: transName,
          translationId: transId,
          playerName: p.name,
          playerId: p.id,
        });
      }
    }

    // 3. Fetch episodes concurrently
    const episodeResults = await Promise.allSettled(
      tasks.map((task) =>
        httpRequest<EpisodesResponse>(
          `https://animeon.club/api/player/${animeId}/episodes?take=2000&skip=0&playerId=${task.playerId}&translationId=${task.translationId}&includeAlternative=true`,
          { headers, signal: options?.signal, timeout: 10000 }
        ).then((res) => ({ task, episodes: res.data?.episodes || [] }))
      )
    );

    // 4. Group by episode number
    // Map: episodeNumber -> StreamSource[]
    const episodesMap = new Map<number, StreamSource[]>();
    let maxEpisode = 0;

    for (const res of episodeResults) {
      if (res.status !== 'fulfilled') continue;
      const { task, episodes } = res.value;

      for (const ep of episodes) {
        const epNum = ep.episode;
        if (epNum > maxEpisode) maxEpisode = epNum;

        const playerLower = task.playerName.toLowerCase();
        const cdnType = playerLower === 'moon' ? 'moonanime' : 'ashdi';

        const source: StreamSource = {
          quality: '1080p',
          title: `${task.translationName} (${task.playerName})`,
          audio: task.translationName,
          url: `/master.m3u8?cdn=animeon&episodeId=${ep.id}&player=${playerLower}`,
          mime: 'application/x-mpegURL',
          poster: ep.poster || undefined,
          headers: {
            Origin: 'https://animeon.club',
            Referer: 'https://animeon.club/',
          },
          lazy: {
            cdn: 'animeon',
            type: cdnType,
            id: String(ep.id),
            url: `https://animeon.club/api/player/${ep.id}/episode`,
          },
        };

        const existing = episodesMap.get(epNum) || [];
        existing.push(source);
        episodesMap.set(epNum, existing);
      }
    }

    // Check if it's a single movie or series
    if (maxEpisode <= 1 && mediaType === 'movie') {
      const movieSources = episodesMap.get(1) || [];
      return {
        provider: 'animeon',
        type: 'movie',
        sources: sortSources(movieSources),
      };
    }

    // Build TV Seasons
    const episodeList: Episode[] = [];
    for (const [epNum, sources] of episodesMap.entries()) {
      episodeList.push({
        episode: epNum,
        sources: sortSources(sources),
      });
    }

    episodeList.sort((a, b) => a.episode - b.episode);

    const detectedSeason =
      extractSeasonFromTitle(title) ||
      (options?.season !== undefined ? options.season : 1);
    const seasonNum = detectedSeason > 0 ? detectedSeason : 1;
    const seasons: Season[] = [
      {
        season: seasonNum,
        episodes: episodeList,
      },
    ];

    return {
      provider: 'animeon',
      type: 'tv',
      seasons: sortSeasons(seasons),
    };
  } catch {
    return { provider: 'animeon', type: mediaType, seasons: [], sources: [] };
  }
}

/**
 * Резолвить конкретну серію AnimeON в реальний VOD URL (Ashdi або MoonAnime)
 */
export async function resolveAnimeOnEpisode(
  episodeId: number | string,
  options?: { signal?: AbortSignal }
): Promise<{ cdn: 'ashdi' | 'moonanime'; url: string } | null> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://animeon.club/',
  };

  const res = await httpRequest<{ videoUrl?: string }>(
    `https://animeon.club/api/player/${episodeId}/episode`,
    { headers, signal: options?.signal, timeout: 8000 }
  );

  const videoUrl = res.data?.videoUrl;
  if (!videoUrl) return null;

  if (videoUrl.includes('moonanime') || videoUrl.includes('mooncdn')) {
    return { cdn: 'moonanime', url: videoUrl };
  }

  return { cdn: 'ashdi', url: videoUrl };
}
