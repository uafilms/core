import type { Episode, Season, StreamSource, Subtitle } from '../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../types/vod.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import { playUakinoAx, uakinoAxVoiceCdnId, type UakinoAxSubtitleEntry } from './api.js';

const INTRO_SEGMENT_RE = /\/intro(\/|$)/i;

/**
 * Вирізає власне інтро uakino.ax з медіа-плейлиста.
 *
 * Плеєр цього сайту вклеює на початок потоку сегменти вигляду
 * `/intro/v2/<height>/intro0.ts` (перед ними стоїть #EXT-X-DISCONTINUITY,
 * який відділяє інтро від основного відео). Прибираємо і сегменти, і цей
 * роздільник, інакше у плеєрі лишається зайвий розрив таймлайну.
 */
export function stripUakinoAxIntro(playlist: string): string {
  const lines = playlist.split('\n');
  const out: string[] = [];
  let pendingTags: string[] = [];
  let skipNextDiscontinuity = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-DISCONTINUITY') && skipNextDiscontinuity) {
        skipNextDiscontinuity = false;
        pendingTags = [];
        continue;
      }
      if (line.startsWith('#EXTINF') || line.startsWith('#EXT-X-BYTERANGE') || line.startsWith('#EXT-X-PROGRAM-DATE-TIME')) {
        pendingTags.push(line);
        continue;
      }
      pendingTags = [];
      out.push(line);
      continue;
    }

    if (INTRO_SEGMENT_RE.test(line)) {
      pendingTags = [];
      skipNextDiscontinuity = true;
      continue;
    }

    out.push(...pendingTags);
    pendingTags = [];
    out.push(line);
  }

  if (pendingTags.length > 0) out.push(...pendingTags);

  return out.join('\n');
}

/** Перетворює субтитри з відповіді lampa API у внутрішній формат. */
export function mapUakinoAxSubtitles(subs?: UakinoAxSubtitleEntry[]): Subtitle[] {
  if (!Array.isArray(subs)) return [];
  return subs
    .filter((sub) => !!sub?.url)
    .map((sub) => ({
      lang: 'uk',
      label: sub.label || 'Українські',
      url: sub.url,
    }));
}

function parseEpisodeId(value: string | null): { season?: number; episode?: number } {
  if (!value) return {};
  const match = value.match(/^s?(\d+)[ex](\d+)$/i);
  if (match) {
    return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  }
  return {};
}

function buildLazyUrl(movieId: string, voice: string, season?: number, episode?: number): string {
  const params = new URLSearchParams();
  params.set('cdn', 'uakino-ax');
  params.set('type', 'vod');
  params.set('id', movieId);
  if (voice) params.set('translation', voice);
  if (season && episode) params.set('episodeId', `s${season}e${episode}`);
  return `/master.m3u8?${params.toString()}`;
}

export class UakinoAxVodExtractor implements VodExtractor {
  readonly name = 'uakino-ax';

  /**
   * Lazy-маршрут `/master.m3u8?cdn=uakino-ax&type=vod&id=<movie>[&translation=<voice>][&episodeId=s1e2]`
   * перетворюємо на підписаний маніфест через lampa API.
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let movieId: string | null = null;
    let voice: string | undefined;
    let season: number | undefined;
    let episode: number | undefined;

    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
      movieId = parsed.searchParams.get('id') || parsed.searchParams.get('movie');

      const rawVoice = parsed.searchParams.get('translation') || parsed.searchParams.get('voice');
      if (rawVoice) voice = rawVoice;

      const fromEpisodeId = parseEpisodeId(parsed.searchParams.get('episodeId'));
      season = fromEpisodeId.season;
      episode = fromEpisodeId.episode;

      if (!season) {
        const rawSeason = parsed.searchParams.get('season');
        if (rawSeason) season = parseInt(rawSeason, 10) || undefined;
      }
      if (!episode) {
        const rawEpisode = parsed.searchParams.get('episode');
        if (rawEpisode) episode = parseInt(rawEpisode, 10) || undefined;
      }
    } catch {
      return null;
    }

    if (!movieId || !/^\d+$/.test(movieId)) return null;

    const play = await playUakinoAx({
      movieId,
      voice,
      season,
      episode,
      signal: options?.signal,
    });
    if (!play?.manifest) return null;

    const subtitles = mapUakinoAxSubtitles(play.subs);
    const title = voice || play.current?.voice || play.voices?.[0] || 'UaKinoAX';

    const sources: StreamSource[] = [
      {
        title,
        audio: title,
        url: play.manifest,
        mime: 'application/x-mpegURL',
        subtitles,
      },
    ];

    if (!play.is_series || !play.episodes?.length) {
      return { sources };
    }

    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();
    for (const entry of play.episodes) {
      if (!entry?.voice) continue;
      const s = entry.season || 1;
      const e = entry.episode || 1;

      if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
      const episodesMap = seasonsMap.get(s)!;
      if (!episodesMap.has(e)) episodesMap.set(e, []);

      const lazyUrl = buildLazyUrl(movieId, entry.voice, s, e);
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

    return { sources, seasons: sortSeasons(seasons) };
  }
}

export const uakinoAxVod = new UakinoAxVodExtractor();
