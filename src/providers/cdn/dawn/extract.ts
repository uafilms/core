import type { StreamSource } from '../../../types/media.js';
import { buildLazyMasterUrl } from '../shared/lazy.js';
import { DAWN_MIME, DAWN_SOURCE_TITLE } from './config.js';
import { dawnRequest } from './session.js';

export interface DawnLazyRoute {
  animeId: string;
  videoId: string;
}

export interface DawnVideo {
  id: string;
  episode: number;
  translationType?: string;
  hls: string;
  thumbnails?: string | null;
  poster?: string | null;
  subtitles?: unknown;
  expiresAt?: number;
  expiresIn?: number;
}

export interface DawnEpisodeEntry {
  number: number;
  video: string;
}

export interface DawnTeam {
  id: number;
  isGroup?: boolean;
  name: string;
}

export interface DawnRelease {
  team: DawnTeam;
  isSubs?: boolean;
  episodes: DawnEpisodeEntry[];
}

export interface DawnListing {
  releases: DawnRelease[];
  videos?: Record<string, { id: string; episode: number; translationType?: string }>;
}

/** Розбір lazy-посилання `cdn=dawn&type=vod&id=<animeId>:<videoId>`. */
export function parseDawnLazyUrl(url: string): DawnLazyRoute | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
    const id = parsed.searchParams.get('id') || '';
    const separator = id.indexOf(':');
    if (separator < 0) return null;
    const animeId = id.slice(0, separator).trim();
    const videoId = id.slice(separator + 1).trim();
    if (!animeId || !videoId) return null;
    return { animeId, videoId };
  } catch {
    return null;
  }
}

export async function fetchDawnListing(
  animeId: string,
  signal?: AbortSignal
): Promise<DawnListing | null> {
  const listing = await dawnRequest<DawnListing>(
    `/player/dawn/v2/anime/${encodeURIComponent(animeId)}`,
    signal
  );
  return listing?.releases?.length ? listing : null;
}

export async function fetchDawnVideo(
  animeId: string,
  videoId: string,
  signal?: AbortSignal
): Promise<DawnVideo | null> {
  const video = await dawnRequest<DawnVideo>(
    `/player/dawn/v2/video/${encodeURIComponent(animeId)}/${encodeURIComponent(videoId)}`,
    signal
  );
  return video?.hls ? video : null;
}

export interface DawnSourceInput {
  animeId: string;
  videoId: string;
  video: DawnVideo;
  /** Назва джерела; за замовчуванням — MoonAnime. */
  title?: string;
  /** Назва аудіодоріжки; за замовчуванням збігається з назвою джерела. */
  audio?: string;
}

export function buildDawnSource({ animeId, videoId, video, title, audio }: DawnSourceInput): StreamSource {
  // Dawn — це рестрім тієї ж бібліотеки moonanime, тому в URL він іде як cdn=moonanime,
  // а відрізняється лише значенням type=dawn.
  const lazyUrl = buildLazyMasterUrl('moonanime', { type: 'dawn', id: `${animeId}:${videoId}` });
  const label = title || DAWN_SOURCE_TITLE;

  return {
    title: label,
    audio: audio || label,
    url: lazyUrl,
    mime: DAWN_MIME,
    poster: video.poster || undefined,
    lazy: {
      cdn: 'moonanime',
      type: 'dawn',
      id: `${animeId}:${videoId}`,
      url: lazyUrl,
      directUrl: video.hls,
    },
  };
}
