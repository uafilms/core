import type { Episode, Season, StreamSource, Subtitle } from '../../../types/media.js';
import { sortSeasons, sortSources } from '../../../utils/sort.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import { uakinoAxVoiceCdnId, type UakinoAxPlayResponse, type UakinoAxSubtitleEntry } from './api.js';
import {
  UAKINO_AX_EPISODE_ID_RE,
  UAKINO_AX_MIME,
  UAKINO_AX_SOURCE_TITLE,
  UAKINO_AX_SUBTITLE_LABEL,
  UAKINO_AX_SUBTITLE_LANG,
} from './config.js';

export interface UakinoAxLazyRoute {
  movieId: string | null;
  voice?: string;
  season?: number;
  episode?: number;
}

/**
 * Розбирає lazy-параметри `/master.m3u8?cdn=uakino-ax&...`.
 * Повертає null, якщо URL взагалі не парситься.
 */
export function parseUakinoAxLazyUrl(url: string): UakinoAxLazyRoute | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
    const movieId = parsed.searchParams.get('id') || parsed.searchParams.get('movie');

    let voice: string | undefined;
    const rawVoice = parsed.searchParams.get('translation') || parsed.searchParams.get('voice');
    if (rawVoice) voice = rawVoice;

    const fromEpisodeId = parseUakinoAxEpisodeId(parsed.searchParams.get('episodeId'));
    let season = fromEpisodeId.season;
    let episode = fromEpisodeId.episode;

    if (!season) {
      const rawSeason = parsed.searchParams.get('season');
      if (rawSeason) season = parseInt(rawSeason, 10) || undefined;
    }
    if (!episode) {
      const rawEpisode = parsed.searchParams.get('episode');
      if (rawEpisode) episode = parseInt(rawEpisode, 10) || undefined;
    }

    return { movieId, voice, season, episode };
  } catch {
    return null;
  }
}

export function parseUakinoAxEpisodeId(value: string | null): { season?: number; episode?: number } {
  if (!value) return {};
  const match = value.match(UAKINO_AX_EPISODE_ID_RE);
  if (match) {
    return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  }
  return {};
}

export function buildUakinoAxLazyUrl(movieId: string, voice?: string, season?: number, episode?: number): string {
  return buildLazyMasterUrl('uakino-ax', {
    type: 'vod',
    id: movieId,
    translation: voice,
    episodeId: season && episode ? `s${season}e${episode}` : undefined,
  });
}

/** Перетворює субтитри з відповіді lampa API у внутрішній формат. */
export function mapUakinoAxSubtitles(subs?: UakinoAxSubtitleEntry[]): Subtitle[] {
  if (!Array.isArray(subs)) return [];
  return subs
    .filter((sub) => !!sub?.url)
    .map((sub) => ({
      lang: UAKINO_AX_SUBTITLE_LANG,
      label: sub.label || UAKINO_AX_SUBTITLE_LABEL,
      url: sub.url,
    }));
}

/** Основне джерело (підписаний маніфест) для поточного дубляжу. */
export function buildUakinoAxMainSource(play: UakinoAxPlayResponse, voice?: string): StreamSource {
  const subtitles = mapUakinoAxSubtitles(play.subs);
  const title = voice || play.current?.voice || play.voices?.[0] || UAKINO_AX_SOURCE_TITLE;

  return {
    title,
    audio: title,
    url: play.manifest,
    mime: UAKINO_AX_MIME,
    subtitles,
  };
}

/** Решта серій та дубляжів як lazy-посилання на наш проксі. */
export function buildUakinoAxSeasons(play: UakinoAxPlayResponse, movieId: string): Season[] {
  const seasonsMap = new Map<number, Map<number, StreamSource[]>>();
  for (const entry of play.episodes || []) {
    if (!entry?.voice) continue;
    const s = entry.season || 1;
    const e = entry.episode || 1;

    if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
    const episodesMap = seasonsMap.get(s)!;
    if (!episodesMap.has(e)) episodesMap.set(e, []);

    const lazyUrl = buildUakinoAxLazyUrl(movieId, entry.voice, s, e);
    episodesMap.get(e)!.push({
      title: entry.title || entry.voice,
      audio: entry.voice,
      url: lazyUrl,
      lazy: {
        cdn: uakinoAxVoiceCdnId(entry.voice),
        type: 'vod',
        url: lazyUrl,
      },
    });
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
    seasons.push({ season: seasonNum, episodes: seasonEpisodes });
  }

  return sortSeasons(seasons);
}
