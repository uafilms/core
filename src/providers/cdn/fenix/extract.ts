/**
 * Розбір embed-сторінки Fenix: плейлист зі скрипта + вибір треку/субтитрів.
 */

import type { Subtitle } from '../../../types/media.js';
import type { VodExtractionOptions } from '../../../types/vod.js';
import { httpRequest } from '../../../utils/http.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import {
  FENIX_ANIMEON_PLAYER_API,
  FENIX_ANIMEON_REFERER,
  FENIX_EMBED_ORIGIN,
  FENIX_FETCH_TIMEOUT,
  FENIX_HOST,
  FENIX_MEDIA_ACCESS_MARKER,
  FENIX_MEDIA_HOST,
  FENIX_PLAYLIST_MARKER,
  FENIX_UA,
} from './config.js';

export interface FenixTrack {
  label?: string;
  language?: string;
  track_type?: string;
  hls_url?: string;
  cast_avc_url?: string;
  thumbnail_url?: string;
  is_default?: boolean;
  voice_studio_id?: number | string;
}

export interface FenixSubtitle {
  label?: string;
  language?: string;
  kind?: string;
  url?: string;
  styled_url?: string;
  voice_studio_id?: number | string;
  voice_studio_name?: string;
}

export interface FenixEpisode {
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

export interface FenixPlaylist {
  slug?: string;
  title_ua?: string;
  title_orig?: string;
  poster_url?: string;
  embed_url?: string;
  episodes?: FenixEpisode[];
  mini_episodes?: FenixEpisode[];
}

export interface FenixMediaAccess {
  origin?: string;
  token?: string;
}

/**
 * Дістає JSON, присвоєний у інлайн-скрипті (`window.X = {...};`) — Fenix
 * віддає і плейлист, і media-токен саме так, одним рядком без обрамлення у JSON-тег.
 */
export function extractJsonAssignment(html: string, marker: string): unknown | null {
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

export function withToken(url: string, token: string): string {
  if (!token || /[?&]token=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
}

/**
 * Лінк на наш проксі для embed-сторінки: замість повного URL передаємо
 * `type=embed` + `id` (хвіст після /embed/), решта — як було.
 */
export function buildFenixLazyUrl(
  embedUrl: string,
  params: { episode?: number; voice?: string } = {},
): string {
  const embed = embedUrl.match(/\/embed\/(.+)$/i);
  if (embed) {
    return buildLazyMasterUrl('fenix', {
      type: 'embed',
      id: embed[1],
      ep: params.episode,
      voice: params.voice,
      mergeAudio: 1,
    });
  }

  return buildLazyMasterUrl('fenix', {
    url: embedUrl,
    ep: params.episode,
    voice: params.voice,
    mergeAudio: 1,
  });
}

export function normalizeVoice(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[’'`ʼ]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, '');
}

/** Плеєр Fenix зветься 'Fenix', але id епізодів у animeon свої — розкриваємо їх в embed-URL. */
export async function resolveAnimeOnEpisodeEmbed(episodeId: string, options: VodExtractionOptions = {}): Promise<string | null> {
  try {
    const res = await httpRequest<{ videoUrl?: string }>(`${FENIX_ANIMEON_PLAYER_API}/${episodeId}/episode`, {
      headers: { Referer: FENIX_ANIMEON_REFERER, 'User-Agent': FENIX_UA },
      signal: options.signal,
      timeout: 8000,
    });
    const videoUrl = res.data?.videoUrl;
    return videoUrl?.includes(FENIX_HOST) ? videoUrl : null;
  } catch {
    return null;
  }
}

export function pickTrack(episode: FenixEpisode, voice?: string): FenixTrack | null {
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

export async function fetchFenixText(url: string, options: VodExtractionOptions = {}): Promise<string | null> {
  try {
    const res = await httpRequest<string>(url, {
      headers: { 'User-Agent': FENIX_UA, Referer: FENIX_EMBED_ORIGIN + '/' },
      signal: options.signal,
      timeout: FENIX_FETCH_TIMEOUT,
      responseType: 'text',
    });
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  } catch {
    return null;
  }
}

export function pickEpisode(playlist: FenixPlaylist, episodeNumber?: number): FenixEpisode | null {
  const episodes = playlist.episodes || [];
  if (episodes.length === 0) return null;
  if (!episodeNumber) return episodes[0];
  return episodes.find((episode) => episode.number === episodeNumber) || episodes[0];
}

/**
 * «Написи»/«Форсовані» (kind=signs|forced) — це оверлейні переклади написів на екрані.
 * Вони мають бути першими й увімкненими за замовчуванням: їх ставимо на позицію 0,
 * а parseMasterPlaylist віддає першому субтитру DEFAULT=YES,AUTOSELECT=YES, тож
 * video.js сам вмикає доріжку.
 */
const SIGNS_KINDS = new Set(['signs', 'forced']);
const SIGNS_LABEL_RE = /напис|forced|форсов/i;

export function isSignsSubtitle(sub: FenixSubtitle): boolean {
  const kind = (sub.kind || '').toLowerCase();
  if (SIGNS_KINDS.has(kind)) return true;
  return SIGNS_LABEL_RE.test(sub.label || '');
}

export function pickSubtitles(episode: FenixEpisode, track: FenixTrack | null, token: string): Subtitle[] {
  const subs = episode.subtitles || [];
  const voiceName = track?.label;
  const wantedVoice = voiceName ? normalizeVoice(voiceName) : null;
  const matchesVoice = (sub: FenixSubtitle): boolean =>
    !!wantedVoice && !!sub.voice_studio_name && normalizeVoice(sub.voice_studio_name) === wantedVoice;

  const signsVoice: FenixSubtitle[] = [];
  const signsOther: FenixSubtitle[] = [];
  const fullVoice: FenixSubtitle[] = [];
  const fullOther: FenixSubtitle[] = [];

  for (const sub of subs) {
    if (!sub.url) continue;
    const bucket = isSignsSubtitle(sub)
      ? matchesVoice(sub)
        ? signsVoice
        : signsOther
      : matchesVoice(sub)
        ? fullVoice
        : fullOther;
    bucket.push(sub);
  }

  const ordered = [...signsVoice, ...signsOther, ...fullVoice, ...fullOther];

  const seen = new Set<string>();
  const subtitles: Subtitle[] = [];
  for (const sub of ordered) {
    // Стилізована версія (ASS) йде першою: плеєр рендерить її через libass,
    // а VTT лишається як запасний варіант, якщо стилізовані не заведуться.
    if (sub.styled_url) {
      const styledUrl = withToken(sub.styled_url, token);
      if (!seen.has(styledUrl)) {
        seen.add(styledUrl);
        subtitles.push({
          lang: sub.language || 'uk',
          label: sub.label || 'Субтитри',
          url: styledUrl,
          format: 'ass',
        });
      }
    }

    const url = withToken(sub.url as string, token);
    if (seen.has(url)) continue;
    seen.add(url);
    subtitles.push({
      lang: sub.language || 'uk',
      label: sub.label || 'Субтитри',
      url,
      format: 'vtt',
    });
  }
  return subtitles;
}

export interface FenixInput {
  target: string;
  voice?: string;
  episodeNumber?: number;
}

export interface FenixContext {
  playlist: FenixPlaylist;
  episode: FenixEpisode;
  token: string;
  voice?: string;
  target: string;
}

export function parseFenixUrl(url: string): FenixInput | null {
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
    else if (type === 'animeon' && animeOnId) return { target: `animeon:${animeOnId}`, voice, episodeNumber };
    else if (type === 'embed' && animeOnId) target = `${FENIX_EMBED_ORIGIN}/embed/${animeOnId}`;

    // Епізод може бути закодований лише в embed-URL від animeon API (?ep=N)
    if (episodeNumber === undefined) {
      try {
        const targetUrl = new URL(target);
        const rawTargetEp = targetUrl.searchParams.get('ep') || targetUrl.searchParams.get('episode');
        if (rawTargetEp) episodeNumber = parseInt(rawTargetEp, 10) || undefined;
      } catch {
        // ignore
      }
    }
  } catch {
    return null;
  }

  return { target, voice, episodeNumber };
}

export async function resolveFenixContext(input: FenixInput, options: VodExtractionOptions = {}): Promise<FenixContext | null> {
  let target = input.target;
  if (target.startsWith('animeon:')) {
    const embed = await resolveAnimeOnEpisodeEmbed(target.slice('animeon:'.length), options);
    if (!embed) return null;
    target = embed;
  }

  if (!target.includes(FENIX_HOST) || target.includes(FENIX_MEDIA_HOST)) return null;

  let episodeNumber = input.episodeNumber;
  if (episodeNumber === undefined) {
    try {
      const targetUrl = new URL(target);
      const rawTargetEp = targetUrl.searchParams.get('ep') || targetUrl.searchParams.get('episode');
      if (rawTargetEp) episodeNumber = parseInt(rawTargetEp, 10) || undefined;
    } catch {
      // ignore
    }
  }

  const html = await fetchFenixText(target, options);
  if (!html) return null;

  const playlist = extractJsonAssignment(html, FENIX_PLAYLIST_MARKER) as FenixPlaylist | null;
  const access = extractJsonAssignment(html, FENIX_MEDIA_ACCESS_MARKER) as FenixMediaAccess | null;
  const token = access?.token;
  if (!playlist || !token) return null;

  const episode = pickEpisode(playlist, episodeNumber);
  if (!episode) return null;

  return { playlist, episode, token, voice: input.voice, target };
}
