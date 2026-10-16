import type { SearchResult } from '../../types/media.js';
import type { ProviderSearchOptions } from '../../types/provider.js';
import { rankSearchResults } from '../../utils/sort.js';
import { anihubPageUrl, anihubPoster, searchAniHubAnime } from './common.js';
import type { AniHubAnimeShort } from './types.js';

function mapAniHubItem(item: AniHubAnimeShort): SearchResult {
  return {
    id: String(item.id),
    title: item.title_ukrainian || item.title_original || item.title_english || String(item.id),
    originalTitle: item.title_original || item.title_english || undefined,
    year: item.year || undefined,
    type: item.type === 'movie' ? 'movie' : 'tv',
    poster: anihubPoster(item.poster_url),
    url: anihubPageUrl(item),
    details: {
      anihubId: String(item.id),
      slug: item.slug,
      malId: item.mal_id ?? undefined,
      anilistId: item.anilist_id ?? undefined,
      imdbId: item.imdb_id ?? undefined,
      hasUkrainianDub: item.has_ukrainian_dub,
      episodesCount: item.episodes_count ?? undefined,
      source: 'anihub',
    },
  };
}

export async function searchAniHub(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const items = await searchAniHubAnime(trimmed, { limit: 20, signal: options?.signal });
  if (items.length === 0) return [];

  const results = items.map(mapAniHubItem);
  return rankSearchResults(results, trimmed, options?.year, options?.type, options?.season);
}
