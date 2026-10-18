import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../../types/vod.js';
import { playUakinoAx } from './api.js';
import { UAKINO_AX_MOVIE_ID_RE } from './config.js';
import { buildUakinoAxMainSource, buildUakinoAxSeasons, parseUakinoAxLazyUrl } from './extract.js';

export class UakinoAxVodExtractor implements VodExtractor {
  readonly name = 'uakino-ax';

  /**
   * Lazy-маршрут `/master.m3u8?cdn=uakino-ax&type=vod&id=<movie>[&translation=<voice>][&episodeId=s1e2]`
   * перетворюємо на підписаний маніфест через lampa API.
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    const route = parseUakinoAxLazyUrl(url);
    if (!route?.movieId || !UAKINO_AX_MOVIE_ID_RE.test(route.movieId)) return null;

    const play = await playUakinoAx({
      movieId: route.movieId,
      voice: route.voice,
      season: route.season,
      episode: route.episode,
      signal: options?.signal,
    });
    if (!play?.manifest) return null;

    const sources = [buildUakinoAxMainSource(play, route.voice)];

    if (!play.is_series || !play.episodes?.length) {
      return { sources };
    }

    return { sources, seasons: buildUakinoAxSeasons(play, route.movieId) };
  }
}

export const uakinoAxVod = new UakinoAxVodExtractor();

export * from './config.js';
export * from './extract.js';
export * from './playlist.js';
