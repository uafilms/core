/**
 * Синтез зведеного HLS-маніфесту Fenix (відео спільне, озвучки — окремі аудіогрупи).
 */

import type { Subtitle } from '../../../types/media.js';
import type { VodExtractionOptions } from '../../../types/vod.js';
import { sortAudioTrackLabels } from '../../../utils/sort.js';
import { FENIX_PREFER_AVC } from './config.js';
import {
  FenixTrack,
  fetchFenixText,
  normalizeVoice,
  parseFenixUrl,
  pickSubtitles,
  resolveFenixContext,
  withToken,
} from './extract.js';

export interface FenixMergedManifest {
  manifest: string;
  baseUrl: string;
  subtitles: Subtitle[];
}

/**
 * Шлях аудіоплейлиста треку: у Fenix майстер треку лежить поруч із `audio/` —
 * `…/versions/<hash>/master.m3u8` → `…/versions/<hash>/audio/playlist.m3u8`.
 */
function audioPlaylistUrl(track: FenixTrack, token: string): string | null {
  const source = track.hls_url || track.cast_avc_url;
  if (!source) return null;
  return withToken(source.replace(/[^/]+\.m3u8(\?|$)/, 'audio/playlist.m3u8$1'), token);
}

/**
 * Збирає один майстер, у якому відео-варіанти спільні, а всі озвучки —
 * окремі `#EXT-X-MEDIA:TYPE=AUDIO` групи того самого GROUP-ID. Плеєр тоді
 * перемикає доріжки на місці, без перезавантаження джерела.
 */
export async function buildFenixMergedManifest(url: string, options: VodExtractionOptions = {}): Promise<FenixMergedManifest | null> {
  const input = parseFenixUrl(url);
  if (!input) return null;

  const ctx = await resolveFenixContext(input, options);
  if (!ctx) return null;

  const masterUrl = FENIX_PREFER_AVC
    ? ctx.episode.cast_avc_url || ctx.episode.hls_master_url
    : ctx.episode.hls_master_url || ctx.episode.cast_avc_url;
  if (!masterUrl) return null;

  const baseUrl = withToken(masterUrl, ctx.token);
  const master = await fetchFenixText(baseUrl, options);
  if (!master) return null;

  const tracks = (ctx.episode.tracks || []).filter((track) => track.track_type !== 'sub' && (track.hls_url || track.cast_avc_url));
  if (tracks.length === 0) return null;

  // Стабільний порядок озвучок у плеєрі: дубляжі за вагою студії, «Оригінал» — ближче
  // до кінця. Fenix віддає треки у власному (довільному) порядку.
  const labelOrder = sortAudioTrackLabels(tracks.map((track) => track.label || ''));
  const orderedTracks = [...tracks].sort(
    (a, b) => labelOrder.indexOf(a.label || '') - labelOrder.indexOf(b.label || ''),
  );

  const wanted = ctx.voice ? normalizeVoice(ctx.voice) : '';
  const defaultTrack =
    (wanted && orderedTracks.find((track) => track.label && normalizeVoice(track.label) === wanted)) || orderedTracks[0];

  const mediaLines = orderedTracks.map((track) => {
    const uri = audioPlaylistUrl(track, ctx.token);
    const label = (track.label || 'Audio').replace(/"/g, '\\"');
    const attrs = [
      '#EXT-X-MEDIA:TYPE=AUDIO',
      'GROUP-ID="audio"',
      `NAME="${label}"`,
      `LANGUAGE="${track.language || 'uk'}"`,
      'CHANNELS="2"',
      `DEFAULT=${track === defaultTrack ? 'YES' : 'NO'}`,
      'AUTOSELECT=YES',
    ];
    if (uri) attrs.push(`URI="${uri}"`);
    return attrs.join(',');
  });

  const output: string[] = [];
  let mediaInserted = false;
  for (const line of master.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!mediaInserted && trimmed.startsWith('#EXT-X-STREAM-INF')) {
      output.push(...mediaLines);
      mediaInserted = true;
    }
    if (/^#EXT-X-MEDIA:TYPE=AUDIO/i.test(trimmed)) continue;
    output.push(trimmed.startsWith('#EXT-X-STREAM-INF') ? trimmed.replace(/AUDIO="[^"]*"/, 'AUDIO="audio"') : line);
  }

  if (!mediaInserted) return null;

  return {
    manifest: output.join('\n'),
    baseUrl,
    subtitles: pickSubtitles(ctx.episode, defaultTrack, ctx.token),
  };
}
