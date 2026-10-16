import type { Episode, MediaType, ProviderResult, Season, StreamSource, Subtitle } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import {
  playUakinoAx,
  uakinoAxVoiceCdnId,
  type UakinoAxEpisodeEntry,
  type UakinoAxPlayResponse,
} from '../../vods/uakinoax/api.js';
import { mapUakinoAxSubtitles } from '../../vods/uakinoax/main.js';
import { fetchMovieMeta, posterUrl } from './common.js';

function buildLazyUrl(movieId: string, voice: string, season?: number, episode?: number): string {
  const params = new URLSearchParams();
  params.set('cdn', 'uakino-ax');
  params.set('type', 'vod');
  params.set('id', movieId);
  if (voice) params.set('translation', voice);
  if (season && episode) params.set('episodeId', `s${season}e${episode}`);
  return `/master.m3u8?${params.toString()}`;
}

function buildSource(
  movieId: string,
  voice: string,
  play: UakinoAxPlayResponse,
  subtitles: Subtitle[],
  options: { quality?: string; poster?: string; season?: number; episode?: number }
): StreamSource {
  const lazyUrl = buildLazyUrl(movieId, voice, options.season, options.episode);
  return {
    title: voice || 'UaKinoAX',
    audio: voice || undefined,
    url: lazyUrl,
    quality: options.quality,
    poster: options.poster,
    subtitles,
    // lazy.id навмисно не задаємо: тоді оркестратор зберігає повний lazy.url
    // (з translation/episodeId), а не збирає спрощений ?cdn&type&id.
    lazy: {
      cdn: uakinoAxVoiceCdnId(voice),
      type: 'vod',
      url: lazyUrl,
    },
  };
}

/**
 * Стратегія A: lampa/tv API (/hls/api/play).
 *
 * Токени маніфесту/сегментів прив'язані до IP нашого сервера, тому клієнт
 * грає через /master.m3u8?cdn=uakino-ax..., який тягне все самостійно.
 */
export async function getUakinoAxLampa(
  movieId: string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  const season = options?.season ?? options?.meta?.season;
  const episode = options?.episode ?? options?.meta?.episode;

  const [play, meta] = await Promise.all([
    playUakinoAx({ movieId, season, episode, signal: options?.signal }),
    fetchMovieMeta(movieId, options?.signal),
  ]);

  if (!play) return null;
  if (!play.manifest && !play.manifest_abs) return null;

  const quality = meta?.quality || undefined;
  const poster = posterUrl(meta?.poster);
  const subtitles = mapUakinoAxSubtitles(play.subs);
  const fallbackVoice = play.current?.voice || play.voices?.[0];

  const isSeries = !!play.is_series;
  const mediaType: MediaType = isSeries ? 'tv' : 'movie';

  if (!isSeries) {
    // Якщо uakino.ax не знає озвучок, джерело однакове — беремо маніфест як є.
    const voices = play.voices?.length ? play.voices : fallbackVoice ? [fallbackVoice] : [''];

    const sources = voices.map((voice) =>
      buildSource(movieId, voice, play, subtitles, { quality, poster })
    );

    return { provider: 'uakino-ax', type: mediaType, sources: sortSources(sources) };
  }

  let entries: UakinoAxEpisodeEntry[] = play.episodes || [];
  if (season) {
    const sameSeason = entries.filter((entry) => entry.season === season);
    if (sameSeason.length > 0) entries = sameSeason;
  }
  if (episode) {
    const sameEpisode = entries.filter((entry) => entry.episode === episode);
    if (sameEpisode.length > 0) entries = sameEpisode;
  }
  if (entries.length === 0) {
    entries = [
      {
        voice: fallbackVoice || 'UaKinoAX',
        season: season ?? play.current?.season ?? 1,
        episode: episode ?? play.current?.episode ?? 1,
      },
    ];
  }

  const seasonsMap = new Map<number, Map<number, StreamSource[]>>();
  for (const entry of entries) {
    if (!entry?.voice) continue;
    const s = entry.season || 1;
    const e = entry.episode || 1;

    if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
    const episodesMap = seasonsMap.get(s)!;
    if (!episodesMap.has(e)) episodesMap.set(e, []);

    episodesMap.get(e)!.push(
      buildSource(movieId, entry.voice, play, subtitles, { quality, poster, season: s, episode: e })
    );
  }

  const seasons: Season[] = [];
  for (const [seasonNum, episodesMap] of seasonsMap.entries()) {
    const seasonEpisodes: Episode[] = [];
    for (const [episodeNum, episodeSources] of episodesMap.entries()) {
      seasonEpisodes.push({
        episode: episodeNum,
        sources: sortSources(episodeSources),
      });
    }
    if (seasonEpisodes.length > 0) {
      seasons.push({ season: seasonNum, episodes: seasonEpisodes });
    }
  }

  if (seasons.length === 0) return null;

  return { provider: 'uakino-ax', type: mediaType, seasons: sortSeasons(seasons) };
}
