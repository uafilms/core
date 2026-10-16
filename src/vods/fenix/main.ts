import type { StreamSource, Subtitle } from '../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../types/vod.js';
import { httpRequest } from '../../utils/http.js';

const FENIX_EMBED_ORIGIN = 'https://fenixplay.xyz';
const ANIMEON_PLAYER_API = 'https://animeon.club/api/player';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/**
 * Fenix віддає HEVC-мастер (1080p hevc + 480p avc у тому ж плейлисті),
 * а `cast_avc_url` — окремий AVC-мастер (тільки 480p), зручний для пристроїв
 * без підтримки HEVC. FENIX_FORCE_AVC=1 перемикає на нього.
 */
const PREFER_AVC = process.env.FENIX_FORCE_AVC === '1';

interface FenixTrack {
  label?: string;
  language?: string;
  track_type?: string;
  hls_url?: string;
  cast_avc_url?: string;
  thumbnail_url?: string;
  is_default?: boolean;
  voice_studio_id?: number | string;
}

interface FenixSubtitle {
  label?: string;
  language?: string;
  kind?: string;
  url?: string;
  voice_studio_id?: number | string;
  voice_studio_name?: string;
}

interface FenixEpisode {
  id?: string;
  number?: number;
  edition?: string;
  title?: string;
  hls_master_url?: string;
  cast_avc_url?: string;
  thumbnail_url?: string;
  tracks?: FenixTrack[];
  subtitles?: FenixSubtitle[];
}

interface FenixPlaylist {
  slug?: string;
  title_ua?: string;
  title_orig?: string;
  poster_url?: string;
  embed_url?: string;
  episodes?: FenixEpisode[];
  mini_episodes?: FenixEpisode[];
}

interface FenixMediaAccess {
  origin?: string;
  token?: string;
}

/**
 * Дістає JSON, присвоєний у інлайн-скрипті (`window.X = {...};`) — Fenix
 * віддає і плейлист, і media-токен саме так, одним рядком без обрамлення у JSON-тег.
 */
function extractJsonAssignment(html: string, marker: string): unknown | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = html.indexOf('{', markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function withToken(url: string, token: string): string {
  if (!token || /[?&]token=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
}

function normalizeVoice(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[’'`ʼ]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, '');
}

/** Плеєр Fenix зветься 'Fenix', але id епізодів у animeon свої — розкриваємо їх в embed-URL. */
async function resolveAnimeOnEpisodeEmbed(episodeId: string, options: VodExtractionOptions = {}): Promise<string | null> {
  try {
    const res = await httpRequest<{ videoUrl?: string }>(`${ANIMEON_PLAYER_API}/${episodeId}/episode`, {
      headers: { Referer: 'https://animeon.club/', 'User-Agent': UA },
      signal: options.signal,
      timeout: 8000,
    });
    const videoUrl = res.data?.videoUrl;
    return videoUrl?.includes('fenixplay.xyz') ? videoUrl : null;
  } catch {
    return null;
  }
}

function pickTrack(episode: FenixEpisode, voice?: string): FenixTrack | null {
  const tracks = (episode.tracks || []).filter((track) => track.track_type !== 'sub' && track.hls_url);
  if (tracks.length === 0) return null;
  if (!voice) return tracks[0];

  const wanted = normalizeVoice(voice);
  const exact = tracks.find((track) => track.label && normalizeVoice(track.label) === wanted);
  if (exact) return exact;

  const partial = tracks.find((track) => {
    if (!track.label) return false;
    const label = normalizeVoice(track.label);
    return label.includes(wanted) || wanted.includes(label);
  });
  return partial || tracks[0];
}

function pickEpisode(playlist: FenixPlaylist, episodeNumber?: number): FenixEpisode | null {
  const episodes = playlist.episodes || [];
  if (episodes.length === 0) return null;
  if (!episodeNumber) return episodes[0];
  return episodes.find((episode) => episode.number === episodeNumber) || episodes[0];
}

function pickSubtitles(episode: FenixEpisode, track: FenixTrack | null, token: string): Subtitle[] {
  const subs = episode.subtitles || [];
  const voiceName = track?.label;
  const withVoice = subs.filter((sub) => !!sub.voice_studio_name);
  const matching = voiceName
    ? withVoice.filter((sub) => normalizeVoice(sub.voice_studio_name as string) === normalizeVoice(voiceName))
    : [];
  const chosen = matching.length > 0 ? matching : subs.filter((sub) => !sub.voice_studio_name);

  const seen = new Set<string>();
  const subtitles: Subtitle[] = [];
  for (const sub of chosen) {
    if (!sub.url) continue;
    const url = withToken(sub.url, token);
    if (seen.has(url)) continue;
    seen.add(url);
    subtitles.push({
      lang: sub.language || 'uk',
      label: sub.label || 'Субтитри',
      url,
    });
  }
  return subtitles;
}

class FenixVodExtractor implements VodExtractor {
  readonly name = 'fenix';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let target = url;
    let voice: string | undefined;
    let episodeNumber: number | undefined;

    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
      const rawVoice = parsed.searchParams.get('voice') || parsed.searchParams.get('translation');
      if (rawVoice) voice = rawVoice;

      const rawEpisode = parsed.searchParams.get('ep') || parsed.searchParams.get('episode');
      if (rawEpisode) episodeNumber = parseInt(rawEpisode, 10) || undefined;

      const type = parsed.searchParams.get('type')?.toLowerCase();
      const animeOnId = parsed.searchParams.get('id') || parsed.searchParams.get('episodeId');
      const innerUrl = parsed.searchParams.get('url');

      if (innerUrl) target = decodeURIComponent(innerUrl);
      else if (type === 'animeon' && animeOnId) {
        const embed = await resolveAnimeOnEpisodeEmbed(animeOnId, options);
        if (!embed) return null;
        target = embed;
      }
    } catch {
      return null;
    }

    if (!target.includes('fenixplay.xyz')) return null;

    // Прямий медіа-запит із підписом — віддаємо як є, токен у ньому вже є.
    if (target.includes('media.fenixplay.xyz')) {
      if (!/[?&]token=/.test(target)) return null;
      const source: StreamSource = {
        title: voice || 'Fenix',
        audio: voice,
        url: target,
        mime: 'application/x-mpegURL',
      };
      return { sources: [source] };
    }

    let html: string;
    try {
      const res = await httpRequest<string>(target, {
        headers: { 'User-Agent': UA, Referer: `${FENIX_EMBED_ORIGIN}/` },
        signal: options.signal,
        timeout: 12000,
        responseType: 'text',
      });
      html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    } catch {
      return null;
    }

    const playlist = extractJsonAssignment(html, 'window.FENIX_PLAYLIST') as FenixPlaylist | null;
    const access = extractJsonAssignment(html, 'window.FENIX_MEDIA_ACCESS') as FenixMediaAccess | null;
    const token = access?.token;
    if (!playlist || !token) return null;

    const episode = pickEpisode(playlist, episodeNumber);
    if (!episode) return null;

    const track = pickTrack(episode, voice);
    if (!track) return null;

    const mediaUrl = (PREFER_AVC ? track.cast_avc_url || track.hls_url : track.hls_url || track.cast_avc_url) as string | undefined;
    if (!mediaUrl) return null;

    const source: StreamSource = {
      title: track.label || voice || 'Fenix',
      audio: track.label || voice,
      url: withToken(mediaUrl, token),
      mime: 'application/x-mpegURL',
      poster: episode.thumbnail_url || playlist.poster_url,
      subtitles: pickSubtitles(episode, track, token),
    };

    return { sources: [source] };
  }
}

export const fenixVod = new FenixVodExtractor();
