import type { StreamSource } from '../../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../../types/vod.js';
import { FENIX_MEDIA_HOST, FENIX_PREFER_AVC } from './config.js';
import { parseFenixUrl, pickSubtitles, pickTrack, resolveFenixContext, withToken } from './extract.js';

class FenixVodExtractor implements VodExtractor {
  readonly name = 'fenix';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    const input = parseFenixUrl(url);
    if (!input) return null;

    // Прямий медіа-запит із підписом — віддаємо як є, токен у ньому вже є.
    if (input.target.includes(FENIX_MEDIA_HOST)) {
      if (!/[?&]token=/.test(input.target)) return null;
      const source: StreamSource = {
        title: input.voice || 'Fenix',
        audio: input.voice,
        url: input.target,
        mime: 'application/x-mpegURL',
      };
      return { sources: [source] };
    }

    const ctx = await resolveFenixContext(input, options);
    if (!ctx) return null;

    const track = pickTrack(ctx.episode, ctx.voice);
    if (!track) return null;

    const mediaUrl = (FENIX_PREFER_AVC ? track.cast_avc_url || track.hls_url : track.hls_url || track.cast_avc_url) as string | undefined;
    if (!mediaUrl) return null;

    const source: StreamSource = {
      title: track.label || ctx.voice || 'Fenix',
      audio: track.label || ctx.voice,
      url: withToken(mediaUrl, ctx.token),
      mime: 'application/x-mpegURL',
      poster: ctx.episode.thumbnail_url || ctx.playlist.poster_url,
      subtitles: pickSubtitles(ctx.episode, track, ctx.token),
      // Відео в Fenix спільне для всіх озвучок — плеєр може перемикати їх нативно.
      sharedVideo: true,
    };

    return { sources: [source] };
  }
}

export const fenixVod = new FenixVodExtractor();

export * from './config.js';
export * from './extract.js';
export * from './manifest.js';
