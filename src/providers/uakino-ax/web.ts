import type { MediaType, ProviderResult } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { extractVod } from '../cdn/index.js';
import { BASE_URL, fetchEpisodesMeta, fetchMovieMeta, posterUrl } from './common.js';

/**
 * Стратегія B: web API (/api/movie/<id>).
 *
 * Сайт віддає iframe плеєра ashdi, тож потоки витягуємо наявним ashdi-екстрактором.
 * Джерела при цьому маркуються як Ashdi (це і є їхній CDN), і коли інший провайдер
 * уже віддав той самий ashdi-потік, оркестратор їх прибере. Стратегія лишається
 * резервною: якщо провайдер uakino недоступний, контент усе одно буде.
 */
export async function getUakinoAxWeb(
  movieId: string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  const meta = await fetchMovieMeta(movieId, options?.signal);
  if (!meta) return null;

  const mediaType: MediaType = meta.type === 'series' ? 'tv' : 'movie';

  const iframeUrl = meta.iframe_url?.trim();
  if (!iframeUrl) {
    return { provider: 'uakino-ax', type: mediaType, sources: [], seasons: [] };
  }

  const extraction = await extractVod(iframeUrl, {
    signal: options?.signal,
    referer: `${BASE_URL}/`,
  });

  if (!extraction) {
    return { provider: 'uakino-ax', type: mediaType, sources: [], seasons: [] };
  }

  const poster = posterUrl(meta.poster);

  if (extraction.sources?.length) {
    for (const source of extraction.sources) {
      if (!source.poster && poster) source.poster = poster;
    }
  }

  if (mediaType === 'tv' && extraction.seasons?.length) {
    const episodesMeta = await fetchEpisodesMeta(movieId, options?.signal);
    if (episodesMeta) {
      const titles = new Map<string, string>();
      for (const season of episodesMeta.seasons) {
        for (const episode of season.episodes) {
          if (episode.name) {
            titles.set(`${season.season}:${episode.episode}`, episode.name);
          }
        }
      }

      for (const season of extraction.seasons) {
        for (const episode of season.episodes) {
          if (!episode.title) {
            const title = titles.get(`${season.season}:${episode.episode}`);
            if (title) episode.title = title;
          }
          for (const source of episode.sources) {
            if (!source.poster && poster) source.poster = poster;
          }
        }
      }
    }
  }

  return {
    provider: 'uakino-ax',
    type: mediaType,
    sources: extraction.sources || [],
    seasons: extraction.seasons || [],
  };
}
