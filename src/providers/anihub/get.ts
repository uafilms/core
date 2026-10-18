import type { Episode, ProviderResult, SearchResult, Season, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { normalizeTitle, sortAudioTrackLabels, sortSeasons, sortSources } from '../../utils/sort.js';
import {
  anihubPoster,
  fetchAniHubAnime,
  fetchAniHubEpisodeSources,
  searchAniHubAnime,
} from './common.js';
import type { AniHubAnimeShort, AniHubEpisodeSources, AniHubStudio, AniHubStudioEpisode } from './types.js';
import { buildFenixLazyUrl } from '../cdn/fenix/extract.js';
import { buildMoonAnimeLazyUrl } from '../cdn/moonanime/extract.js';

/** «Сім'я шпигуна: Сезон 3» → 3; якщо маркера немає — 1 (базовий сезон). */
function seasonFromTitle(title?: string): number | null {
  if (!title) return null;
  const match = title.match(/(\d+)\s*-?\s*(?:й\s*)?(?:сезон|season)/i) || title.match(/(?:сезон|season)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/** «Сім'я шпигуна: Сезон 1, Частина 2» → «Сім'я шпигуна» (для матчингу тайтла між сезонами). */
function baseTitle(value?: string): string {
  if (!value) return '';
  return value
    .replace(/(\d+)\s*-?\s*(?:й\s*)?(?:сезон|season)\b.*/i, '')
    .replace(/(?:сезон|season)\s*\d+.*/i, '')
    .replace(/[:,]?\s*(?:частина|part)\s*\d+.*/i, '')
    .replace(/[:\-–—\s]+$/, '')
    .trim();
}

/**
 * Вибір потрібного тайтла серед результатів пошуку/imdb: спершу матчинг назви
 * (точний і за базовою назвою без маркерів сезону), потім сезон.
 */
function pickCandidate(
  items: AniHubAnimeShort[],
  season: number,
  meta?: { title?: string; originalTitle?: string; type?: string },
): AniHubAnimeShort | null {
  if (items.length === 0) return null;

  let pool = items;
  if (meta?.type) {
    const wantedType = meta.type === 'movie' ? 'movie' : 'tv';
    const typed = items.filter((item) => (item.type === 'movie' ? 'movie' : 'tv') === wantedType);
    if (typed.length > 0) pool = typed;
  }

  const wanted = [meta?.title, meta?.originalTitle].filter(Boolean) as string[];
  if (wanted.length > 0) {
    const exact = wanted.map((name) => normalizeTitle(name));
    const base = wanted.map((name) => normalizeTitle(baseTitle(name)));
    const scored = pool
      .map((item) => {
        const names = [item.title_ukrainian, item.title_original, item.title_english].filter(Boolean) as string[];
        const titles = names.map((name) => normalizeTitle(name));
        const bases = names.map((name) => normalizeTitle(baseTitle(name)));
        let score = 0;
        if (titles.some((title) => exact.includes(title))) score += 3;
        if (bases.some((baseName) => base.includes(baseName))) score += 2;
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) pool = scored.map((entry) => entry.item);
  }

  const ownSeason = (item: AniHubAnimeShort): number =>
    seasonFromTitle(item.title_ukrainian) ?? seasonFromTitle(item.title_original) ?? seasonFromTitle(item.slug) ?? 1;

  if (season > 1) {
    return (
      pool.find((item) => ownSeason(item) === season) ||
      pool.find((item) => (item.slug || '').includes(`sezon-${season}`)) ||
      pool[0]
    );
  }
  return pool.find((item) => ownSeason(item) === 1) || pool[0];
}

function animeIdFromTarget(target: SearchResult | string): string | null {
  if (typeof target === 'string') {
    if (/^\d+$/.test(target)) return target;
    const urlId = target.match(/-(\d+)(?:[?#]|$)/) || target.match(/\/anime\/(\d+)/);
    return urlId ? urlId[1] : null;
  }

  const details = target.details || {};
  const candidate = details.anihubId ?? details.id ?? target.id;
  if (candidate && /^\d+$/.test(String(candidate))) return String(candidate);

  const fromUrl = target.url?.match(/-(\d+)(?:[?#]|$)/);
  return fromUrl ? fromUrl[1] : null;
}

/** Впорядковані кандидати тайтла: id з таргета → imdb → пошук за назвою (з урахуванням сезону). */
async function resolveAnimeCandidates(
  target: SearchResult | string,
  options?: ProviderGetOptions,
): Promise<AniHubAnimeShort[]> {
  const meta = options?.meta;
  const season = options?.season ?? meta?.season ?? 1;

  const candidates: AniHubAnimeShort[] = [];
  const push = (list: Array<AniHubAnimeShort | null | undefined>) => {
    for (const item of list) {
      if (!item?.id) continue;
      if (!candidates.some((existing) => existing.id === item.id)) candidates.push(item);
    }
  };

  const directId = animeIdFromTarget(target);
  if (directId) {
    const detail = await fetchAniHubAnime(directId, options?.signal);
    push([detail ?? ({ id: Number(directId) } as AniHubAnimeShort)]);
  }

  if (meta?.imdbId) {
    const byImdb = await searchAniHubAnime('', { imdbId: meta.imdbId, signal: options?.signal });
    push([pickCandidate(byImdb, season, meta), ...byImdb]);
  }

  const directQuery =
    typeof target === 'string' && !/^tt\d+$/i.test(target) && !/^\d+$/.test(target.trim()) ? target : '';
  const query = meta?.title || directQuery;
  if (query) {
    const found = await searchAniHubAnime(query, { signal: options?.signal });
    push([pickCandidate(found, season, meta), ...found]);
  }

  return candidates;
}

function findEpisode(studio: AniHubStudio, episode: number): AniHubStudioEpisode | undefined {
  return (studio.episodes || []).find((item) => item.episode_number === episode);
}

function ashdiSources(data: AniHubEpisodeSources, episode: number): StreamSource[] {
  const sources: StreamSource[] = [];
  for (const studio of data.ashdi || []) {
    const item = findEpisode(studio, episode);
    const ashdiId = item?.ashdi_episode_id || item?.url?.match(/\/vod\/(\d+)/)?.[1];
    if (!ashdiId) continue;

    const lazyUrl = `/master.m3u8?cdn=ashdi&type=vod&id=${ashdiId}`;
    sources.push({
      title: studio.studio_name || studio.display_name || 'Ashdi',
      audio: studio.studio_name || undefined,
      url: lazyUrl,
      mime: 'application/x-mpegURL',
      poster: anihubPoster(item?.poster_url),
      lazy: { cdn: 'ashdi', type: 'vod', id: String(ashdiId), url: lazyUrl },
    });
  }
  return sources;
}

function moonAnimeSources(data: AniHubEpisodeSources, episode: number): StreamSource[] {
  const sources: StreamSource[] = [];
  for (const studio of data.moonanime || []) {
    const item = findEpisode(studio, episode);
    const target = item?.iframe_url || item?.vod_url;
    if (!target) continue;

    const lazyUrl = buildMoonAnimeLazyUrl(target);
    sources.push({
      title: studio.studio_name || studio.display_name || 'MoonAnime',
      audio: studio.studio_name || undefined,
      url: lazyUrl,
      mime: 'application/x-mpegURL',
      poster: anihubPoster(item?.poster_url),
      lazy: { cdn: 'moonanime', type: 'vod', url: lazyUrl },
    });
  }
  return sources;
}

/**
 * Fenix тримає одне відео на епізод і окремі аудіодоріжки, тому згортаємо всі
 * треки епізоду в ОДНЕ джерело: відео спільне, озвучки — в audioTracks,
 * а плеєр/клієнт перемикає їх нативно на рівні HLS (master&mergeAudio=1).
 */
function fenixSource(data: AniHubEpisodeSources, episode: number): StreamSource | null {
  const tracks = (data.fenix || []).filter((studio) => findEpisode(studio, episode));
  if (tracks.length === 0) return null;

  const labels: string[] = [];
  for (const studio of tracks) {
    const label = studio.studio_name || studio.display_name;
    if (label && !labels.includes(label)) labels.push(label);
  }

  const primary = tracks[0];
  const embed = primary.embed_url || data.fenix_embed_url;
  if (!embed) return null;

  const voice = primary.studio_name || labels[0] || 'Fenix';
  const lazyUrl = buildFenixLazyUrl(embed, { episode, voice });

  return {
    title: voice,
    audio: voice,
    audioTracks: labels.length > 0 ? sortAudioTrackLabels(labels) : undefined,
    sharedVideo: true,
    url: lazyUrl,
    mime: 'application/x-mpegURL',
    lazy: { cdn: 'fenix', type: 'vod', url: lazyUrl },
  };
}

function buildEpisodeSources(data: AniHubEpisodeSources, episode: number): StreamSource[] {
  const sources = [...ashdiSources(data, episode), ...moonAnimeSources(data, episode)];
  const fenix = fenixSource(data, episode);
  if (fenix) sources.push(fenix);
  return sortSources(sources);
}

function episodeNumbers(data: AniHubEpisodeSources): number[] {
  const numbers = new Set<number>();
  const collect = (studios?: AniHubStudio[]) => {
    for (const studio of studios || []) {
      for (const item of studio.episodes || []) {
        if (typeof item.episode_number === 'number') numbers.add(item.episode_number);
      }
    }
  };
  collect(data.ashdi);
  collect(data.moonanime);
  collect(data.fenix);
  return [...numbers].sort((a, b) => a - b);
}

function episodeTitle(data: AniHubEpisodeSources, episode: number): string | undefined {
  for (const studio of [...(data.fenix || []), ...(data.ashdi || []), ...(data.moonanime || [])]) {
    const item = findEpisode(studio, episode);
    if (item?.title) return item.title;
  }
  return undefined;
}

/** «Частина 2» / «Part 2» → 2 (для склейки абсолютної нумерації частин сезону). */
function partFromTitle(value?: string): number {
  if (!value) return 1;
  const match =
    value.match(/(?:частина|часть|part)\s*(\d+)/i) || value.match(/(\d+)\s*-?\s*(?:а\s*)?(?:частина|часть|part)\b/i);
  return match ? parseInt(match[1], 10) : 1;
}

export async function getAniHub(
  target: SearchResult | string,
  options?: ProviderGetOptions,
): Promise<ProviderResult | null> {
  const candidates = await resolveAnimeCandidates(target, options);
  if (candidates.length === 0) return null;

  const season = options?.season ?? options?.meta?.season ?? 1;
  const episode = options?.episode ?? options?.meta?.episode ?? 1;

  // Перший кандидат може виявитись іншим сезоном/дублем тайтла, а частини сезону
  // («Сезон 1» + «Сезон 1, Частина 2») мають власну нумерацію — тому лишаємо
  // кандидатів тієї ж родини назв, впорядковуємо за частиною і рахуємо offset.
  const titleNames = (item: AniHubAnimeShort): string[] =>
    [item.title_ukrainian, item.title_original, item.title_english].filter(Boolean) as string[];
  const inSeason = (item: AniHubAnimeShort): number =>
    seasonFromTitle(item.title_ukrainian) ?? seasonFromTitle(item.title_original) ?? seasonFromTitle(item.slug) ?? 1;

  const top = candidates[0];
  const familyBases = new Set(titleNames(top).flatMap((name) => [normalizeTitle(name), normalizeTitle(baseTitle(name))]));
  const sameFamily = (item: AniHubAnimeShort): boolean =>
    item.id === top.id ||
    titleNames(item).some((name) => familyBases.has(normalizeTitle(baseTitle(name))));

  const pool = candidates.filter((item) => inSeason(item) === season && sameFamily(item));
  const ordered = (pool.length > 0 ? pool : candidates)
    .slice()
    .sort((a, b) => {
      const partA = partFromTitle(a.title_ukrainian) || partFromTitle(a.title_original);
      const partB = partFromTitle(b.title_ukrainian) || partFromTitle(b.title_original);
      return partA - partB || a.id - b.id;
    });

  let offset = 0;

  for (const anime of ordered.slice(0, 6)) {
    const data = await fetchAniHubEpisodeSources(anime.id, season, options?.signal);
    if (!data) continue;

    const numbers = episodeNumbers(data);
    if (numbers.length === 0) continue;

    const local = episode - offset;
    let target: number | null = null;
    if (numbers.includes(local)) target = local;
    else if (numbers.includes(episode)) target = episode;
    if (target === null) {
      offset += numbers.length;
      continue;
    }
    const shift = target === local ? offset : 0;

    const mediaType = anime.type === 'movie' && (anime.episodes_count ?? 1) <= 1 ? 'movie' : 'tv';

    if (mediaType === 'movie') {
      const sources = buildEpisodeSources(data, target);
      if (sources.length === 0) continue;
      return { provider: 'anihub', type: 'movie', sources };
    }

    const seasons: Season[] = [];
    const episodes: Episode[] = [];
    for (const number of numbers) {
      const absolute = number + shift;
      const sources = buildEpisodeSources(data, number);
      if (sources.length === 0) continue;
      episodes.push({
        episode: absolute,
        title: episodeTitle(data, number) || `Серія ${absolute}`,
        sources,
      });
    }

    if (episodes.length === 0) continue;
    seasons.push({ season, episodes });

    return {
      provider: 'anihub',
      type: 'tv',
      seasons: sortSeasons(seasons),
    };
  }

  return null;
}
