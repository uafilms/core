import { httpRequest } from '../../utils/http.js';
import { extractVod } from '../../vods/index.js';
import { searchMikai } from './search.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import type {
  ProviderResult,
  SearchResult,
  StreamSource,
  Season,
  Episode,
  MediaType,
  ProviderGetOptions,
} from '../../types/index.js';
import type { MikaiEnvelope, MikaiPlayerResult, MikaiRelease } from './types.js';

const API_BASE = 'https://api.mikai.me/public/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cache player results per mikai anime ID for fast subsequent episode lookups
const playerCache = new Map<string, { result: ProviderResult; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getMikai(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let animeRef: string | null = null;
  const meta = options?.meta;

  if (typeof target === 'object' && target !== null) {
    animeRef = target.id;
  } else if (typeof target === 'string') {
    const trimmed = target.trim();
    // Check if URL: https://mikai.me/anime/:slug
    const slugMatch = trimmed.match(/\/anime\/([a-zA-Z0-9_-]+)/);
    if (slugMatch) {
      animeRef = slugMatch[1];
    } else {
      animeRef = trimmed;
    }
  }

  // If no direct ref found, search by title
  if (!animeRef && meta?.title) {
    const searchResults = await searchMikai(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
      meta,
    });
    if (searchResults.length > 0) {
      animeRef = searchResults[0].id;
    }
  }

  if (!animeRef) return null;

  // Check cache
  const cached = playerCache.get(animeRef);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const playerUrl = `${API_BASE}/anime/${encodeURIComponent(animeRef)}/player`;
    const response = await httpRequest<MikaiEnvelope<MikaiPlayerResult>>(playerUrl, {
      signal: options?.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
      },
    });

    const player = response.data?.result;
    if (!player || !player.releases || player.releases.length === 0) {
      return null;
    }

    const releases: MikaiRelease[] = player.releases;
    const targetSeason = meta?.season ?? 1;
    const targetEpisode = meta?.episode;
    const isMovie = meta?.type === 'movie';

    // Map: episodeNumber -> StreamSource[]
    const episodeSourcesMap = new Map<number, StreamSource[]>();
    const movieSources: StreamSource[] = [];

    // Helper to format track / release title
    const getTrackTitle = (rel: MikaiRelease): string => {
      const teamNames = rel.teams?.map((t) => t.name).join(', ') || 'Озвучення';
      const kindLabel = rel.kind === 'sub' ? ' (Субтитри)' : '';
      return `${teamNames}${kindLabel}`;
    };

    // Iterate through releases and extract playable streams
    for (const rel of releases) {
      const trackTitle = getTrackTitle(rel);
      const teamWithAvatar = rel.teams?.find((t) => t.avatar?.medium?.webp || t.avatar?.small?.webp);
      const teamLogo = teamWithAvatar?.avatar;
      const logoUrl = teamLogo?.medium?.webp || teamLogo?.small?.webp || teamLogo?.medium?.jpg;
      const eps = rel.episodes || [];

      // Determine which episode to resolve:
      // - If tv series and specific episode requested: ep.number === targetEpisode
      // - If tv series without specific episode: only first episode (ep.number === 1) to avoid leaking full season into single movie/episode query
      // - If movie: take the first episode available (usually ep.number === 1)
      const targetEpNumber = targetEpisode !== undefined ? targetEpisode : (isMovie ? (eps[0]?.number ?? 1) : 1);

      for (const ep of eps) {
        const epNum = ep.number;

        if (epNum !== targetEpNumber) {
          continue;
        }

        for (const src of ep.sources) {
          if (!src.embedUrl) continue;

          try {
            const vodResult = await extractVod(src.embedUrl, {
              referer: 'https://mikai.me/',
              signal: options?.signal,
            });

            if (vodResult?.sources && vodResult.sources.length > 0) {
              for (const s of vodResult.sources) {
                const combinedSource: StreamSource = {
                  ...s,
                  title: `${trackTitle} [${s.title}]`,
                  audio: trackTitle,
                  poster: s.poster || logoUrl,
                };

                if (isMovie) {
                  movieSources.push(combinedSource);
                } else {
                  if (!episodeSourcesMap.has(epNum)) {
                    episodeSourcesMap.set(epNum, []);
                  }
                  episodeSourcesMap.get(epNum)!.push(combinedSource);
                }
              }
            }
          } catch {
            // ignore extraction errors on individual broken VOD links
          }
        }
      }
    }

    // Build ProviderResult
    let result: ProviderResult;

    if (isMovie) {
      result = {
        provider: 'mikai',
        type: 'movie',
        sources: sortSources(movieSources),
      };
    } else {
      // Find all unique episode numbers across all releases
      const allEpNumbers = new Set<number>();
      for (const rel of releases) {
        for (const ep of rel.episodes || []) {
          allEpNumbers.add(ep.number);
        }
      }

      const sortedEpNumbers = Array.from(allEpNumbers).sort((a, b) => a - b);
      const episodes: Episode[] = sortedEpNumbers.map((epNum) => ({
        episode: epNum,
        sources: sortSources(episodeSourcesMap.get(epNum) || []),
      }));

      const seasons: Season[] = [
        {
          season: targetSeason,
          episodes,
        },
      ];

      result = {
        provider: 'mikai',
        type: 'tv',
        seasons: sortSeasons(seasons),
      };
    }

    playerCache.set(animeRef, { result, timestamp: Date.now() });
    return result;
  } catch {
    return null;
  }
}
