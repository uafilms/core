import type { ProviderResult, SearchResult } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { findUakinoAxMovie } from '../../vods/uakinoax/api.js';
import { searchUakinoAx } from './search.js';
import { getUakinoAxLampa } from './lampa.js';
import { getUakinoAxWeb } from './web.js';

/**
 * Режим роботи провайдера:
 *  - auto (типово) — спершу web API (iframe ashdi), якщо джерел немає, проксі-рестрім lampa;
 *  - web — тільки /api/movie (iframe ashdi);
 *  - lampa — тільки /hls/api/play (усі дубляжі, UaKinoAX-джерела).
 */
export type UakinoAxApiMode = 'auto' | 'lampa' | 'web';

export function getUakinoAxApiMode(): UakinoAxApiMode {
  const raw = (process.env.UAKINO_AX_API || 'auto').trim().toLowerCase();
  if (raw === 'lampa' || raw === 'web') return raw;
  return 'auto';
}

async function resolveMovieId(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<string | null> {
  const meta = options?.meta;
  // Рядок, що дорівнює TMDB id, не можна вважати id фільму на uakino.ax
  const isTmdbId = (value: string) => !!meta?.tmdbId && String(meta.tmdbId) === value;

  if (typeof target === 'object' && target !== null) {
    const detailsId = target.details?.uakinoAxId;
    if (typeof detailsId === 'string' && /^\d+$/.test(detailsId.trim())) return detailsId.trim();
    const candidates = [target.id, target.url];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && /^\d+$/.test(candidate.trim()) && !isTmdbId(candidate.trim())) {
        return candidate.trim();
      }
      if (typeof candidate === 'string') {
        const match = candidate.match(/\/api\/movie\/(\d+)/) || candidate.match(/[?&]id=(\d+)/);
        if (match) return match[1];
      }
    }
  } else if (typeof target === 'string') {
    const trimmed = target.trim();
    if (/^\d+$/.test(trimmed) && !isTmdbId(trimmed)) return trimmed;
    const match = trimmed.match(/\/api\/movie\/(\d+)/) || trimmed.match(/[?&]id=(\d+)/);
    if (match) return match[1];
  }

  if (!meta) return null;

  // TMDB/IMDb шукаємо напряму через lampa API
  if (meta.tmdbId || meta.imdbId) {
    const found = await findUakinoAxMovie(
      {
        tmdbId: meta.tmdbId,
        imdbId: meta.imdbId,
        title: meta.title,
        originalTitle: meta.originalTitle,
        year: meta.year,
        type: meta.type,
      },
      options?.signal
    );
    if (found?.movie_id) return String(found.movie_id);
  }

  const query = meta.title || (typeof target === 'string' ? target.trim() : '');
  if (!query) return null;

  const results = await searchUakinoAx(query, {
    signal: options?.signal,
    year: meta.year,
    type: meta.type,
    season: meta.season,
    meta,
  });

  if (results.length === 0) return null;
  return results[0].details?.uakinoAxId || results[0].id;
}

export async function getUakinoAx(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  const movieId = await resolveMovieId(target, options);
  if (!movieId) return null;

  const mode = getUakinoAxApiMode();

  if (mode === 'lampa') {
    return getUakinoAxLampa(movieId, options);
  }
  if (mode === 'web') {
    return getUakinoAxWeb(movieId, options);
  }

  try {
    const webResult = await getUakinoAxWeb(movieId, options);
    if (webResult && (webResult.sources?.length || webResult.seasons?.length)) {
      return webResult;
    }
  } catch {
    // fallback на проксі-рестрім uakino.ax
  }

  return getUakinoAxLampa(movieId, options);
}
