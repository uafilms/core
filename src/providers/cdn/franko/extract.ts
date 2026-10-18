import { httpRequest } from '../../../utils/http.js';
import {
  FRANKO_BASE_URL,
  FRANKO_FILES_TIMEOUT,
  FRANKO_FILES_URL,
  FRANKO_ORIGIN,
  FRANKO_PLAYER_PAYLOAD_RE,
  FRANKO_REFERER,
  FRANKO_SHOW_TIMEOUT,
  FRANKO_TOKEN_RE,
  FRANKO_UA,
} from './config.js';
import type { FrankoFilesRequest, FrankoFilesResponse, FrankoPlayerPayload } from './types.js';

/** Сторінка шоу (з опційним вибором перекладу) */
export function frankoShowPageUrl(id: number, translation?: number): string {
  return `${FRANKO_BASE_URL}/show/${id}/${translation ? `?translation=${translation}` : ''}`;
}

/** Витягує `window.__PLAYER_PAYLOAD__` зі сторінки/HTML */
export function parseFrankoPlayerPayload(html: string): FrankoPlayerPayload | null {
  const match = html.match(FRANKO_PLAYER_PAYLOAD_RE);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as FrankoPlayerPayload;
  } catch {
    return null;
  }
}

/** Ліниве посилання на фільм/переклад */
export function buildFrankoMovieLazyUrl(id: number, translation: number): string {
  return `/master.m3u8?cdn=franko&id=${id}&translation=${translation}`;
}

/** Ліниве посилання на епізод серіалу */
export function buildFrankoEpisodeLazyUrl(
  id: number,
  translation: number,
  season: number,
  episode: number
): string {
  return `/master.m3u8?cdn=franko&id=${id}&translation=${translation}&season=${season}&episode=${episode}`;
}

/** Прибирає суфікс розміру обкладинки (`@hNNN`) */
export function stripFrankoPoster(coverUrl?: string | null): string | undefined {
  return coverUrl?.replace(/@h\d+/, '') || undefined;
}

/**
 * Отримує пряме M3U8 посилання з API Franko
 */
export async function resolveFrankoFile(
  req: FrankoFilesRequest,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    let token = req.bootstrap_token;
    let translation = req.translation;
    if (!token || !translation) {
      const pageRes = await httpRequest<string>(frankoShowPageUrl(req.id, translation), {
        headers: {
          'User-Agent': FRANKO_UA,
          Referer: FRANKO_REFERER,
        },
        signal,
        timeout: FRANKO_SHOW_TIMEOUT,
      });
      const payload = parseFrankoPlayerPayload(pageRes.data);
      if (payload) {
        if (!token) token = payload.player_files_token;
        if (!translation && payload.translate) {
          translation = payload.translate;
        }
      }
      if (!token) {
        const tokenMatch = pageRes.data.match(FRANKO_TOKEN_RE);
        if (tokenMatch) token = tokenMatch[1];
      }
    }

    const res = await httpRequest<FrankoFilesResponse>(FRANKO_FILES_URL, {
      method: 'POST',
      data: {
        id: req.id,
        translation: translation || 0,
        season_number: req.season_number ?? null,
        episode_number: req.episode_number ?? null,
        force_cdn: req.force_cdn || '',
        turnstile_token: req.turnstile_token || '',
        bootstrap_token: token || '',
      },
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': FRANKO_UA,
        Referer: `${FRANKO_BASE_URL}/show/${req.id}/`,
        Origin: FRANKO_ORIGIN,
      },
      signal,
      timeout: FRANKO_FILES_TIMEOUT,
    });
    return res.data?.file || null;
  } catch {
    return null;
  }
}
