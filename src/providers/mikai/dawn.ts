import { sortSeasons, sortSources } from '../../utils/sort.js';
import type { ProviderResult, Season, StreamSource } from '../../types/index.js';
import { buildDawnSource, fetchDawnListing, fetchDawnVideo } from '../cdn/dawn/extract.js';
import { DAWN_SOURCE_TITLE } from '../cdn/dawn/config.js';
import { getMikaiTrackTitle } from './labels.js';

export interface MikaiDawnFallbackOptions {
  season?: number;
  episode?: number;
  isMovie?: boolean;
  signal?: AbortSignal;
}

/**
 * Fallback на приватний CDN Dawn, коли публічний player API mikai не дав джерел.
 * Dawn віддає ту саму бібліотеку, що й moonanime, тому джерела підписуються як MoonAnime.
 */
export async function getMikaiDawnFallback(
  animeId: string,
  options: MikaiDawnFallbackOptions = {}
): Promise<ProviderResult | null> {
  if (!animeId) return null;

  try {
    const listing = await fetchDawnListing(animeId, options.signal);
    if (!listing) return null;

    const wantedEpisode = options.episode ?? 1;
    const sources: StreamSource[] = [];

    for (const release of listing.releases) {
      const entry = release.episodes?.find((item) => item.number === wantedEpisode);
      if (!entry) continue;

      try {
        const video = await fetchDawnVideo(animeId, entry.video, options.signal);
        if (!video) continue;

        const trackTitle = getMikaiTrackTitle(release);

        sources.push(
          buildDawnSource({
            animeId,
            videoId: entry.video,
            video,
            title: `${trackTitle} [${DAWN_SOURCE_TITLE}]`,
            audio: trackTitle,
          })
        );
      } catch {
        // одна зламана озвучка не повинна валити весь fallback
      }
    }

    if (sources.length === 0) return null;

    if (options.isMovie) {
      return { provider: 'mikai', type: 'movie', sources: sortSources(sources) };
    }

    const seasons: Season[] = [
      {
        season: options.season ?? 1,
        episodes: [{ episode: wantedEpisode, sources: sortSources(sources) }],
      },
    ];

    return { provider: 'mikai', type: 'tv', seasons: sortSeasons(seasons) };
  } catch {
    return null;
  }
}
