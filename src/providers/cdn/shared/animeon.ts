import { httpRequest } from '../../../utils/http.js';

const ANIMEON_PLAYER_API = 'https://animeon.club/api/player';
const ANIMEON_HEADERS = {
  Referer: 'https://animeon.club/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

/**
 * Резолв відео епізоду через animeon.club API.
 * Повертає прямий videoUrl або null, якщо API не віддав посилання.
 */
export async function fetchAnimeonEpisodeVideoUrl(
  episodeId: string,
  options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<string | null> {
  return fetchAnimeonPlayerUrl(`${ANIMEON_PLAYER_API}/${episodeId}/episode`, {
    signal: options.signal,
    timeout: options.timeout ?? 8000,
  });
}

/**
 * Запит до довільного URL плеєра animeon.club (коли посилання вже зібране).
 */
export async function fetchAnimeonPlayerUrl(
  playerUrl: string,
  options: { signal?: AbortSignal; timeout?: number } = {},
): Promise<string | null> {
  const res = await httpRequest<{ videoUrl?: string }>(playerUrl, {
    headers: ANIMEON_HEADERS,
    signal: options.signal,
    timeout: options.timeout ?? 12000,
  });

  return res.data?.videoUrl || null;
}
