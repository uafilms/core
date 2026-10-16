import type {
  MediaType,
  ProviderResult,
  SearchResult,
  Season,
  Episode,
  StreamSource,
} from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { extractSeasonFromTitle, sortAudioTrackLabels, sortSeasons, sortSources } from '../../utils/sort.js';
import { fetchAnimeOnItems, mapAnimeOnItem, searchAnimeOn } from './search.js';
import type { AnimeOnEpisodeItem, AnimeOnTranslation } from './types.js';

interface TranslationsResponse {
  translations?: Array<{
    translation: {
      id: number;
      name: string;
      isSub?: boolean;
    };
    player: Array<{
      id: number;
      name: string;
      episodesCount?: number;
    }>;
  }>;
}

interface EpisodesResponse {
  episodes?: Array<{
    id: number;
    episode: number;
    poster?: string;
  }>;
}

type AnimeOnTranslations = NonNullable<TranslationsResponse['translations']>;

const ANIMEON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://animeon.club/',
};

/**
 * AnimeON translation names that do not match the dub they actually host.
 * 'Далі буде' streams the Amanogawa dub (verified via ashdi vod ids: S1 part 1
 * episode 1 -> ashdi.vip/vod/147293, which is the first episode of the Amanogawa
 * playlist in the uakino.app catalog; part 2 episode 1 -> vod/147305 = episode 13).
 */
const TRANSLATION_ALIASES: Record<string, string> = {
  'далі буде': 'Amanogawa',
};

const TRANSLATIONS_TTL_MS = 10 * 60 * 1000;
const translationsCache = new Map<string, { at: number; data: AnimeOnTranslations }>();

async function getAnimeOnTranslations(
  animeId: string,
  options?: { signal?: AbortSignal; refresh?: boolean }
): Promise<AnimeOnTranslations> {
  const cached = translationsCache.get(animeId);
  if (cached && !options?.refresh && Date.now() - cached.at < TRANSLATIONS_TTL_MS) {
    return cached.data;
  }

  const res = await httpRequest<TranslationsResponse>(
    `https://animeon.club/api/player/${animeId}/translations`,
    { headers: ANIMEON_HEADERS, signal: options?.signal, timeout: 8000 }
  );

  const data = res.data?.translations || [];
  translationsCache.set(animeId, { at: Date.now(), data });
  return data;
}

interface TitleParts {
  base: string;
  season: number;
  part: number;
}

/**
 * AnimeON splits cours into separate catalog entries, e.g.
 * "Сім'я шпигуна" (season 1, part 1) and "Сім'я шпигуна - 1 сезон, 2 частина".
 * Episode numbers restart at 1 in every part, so they must be translated to the
 * absolute season numbering that TMDB (and our API) uses.
 */
function parseTitleParts(title: string): TitleParts {
  const seasonMatch =
    title.match(/(\d+)\s*-?\s*(?:й\s*)?(?:сезон|season)\b/i) ||
    title.match(/(?:сезон|season)\s*(\d+)/i);
  const partMatch =
    title.match(/(\d+)\s*-?\s*(?:а\s*)?(?:частина|частину|часть|part)\b/i) ||
    title.match(/(?:частина|частину|часть|part)\s*(\d+)/i);

  const season = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
  const part = partMatch ? parseInt(partMatch[1], 10) : 1;

  const base = title
    .replace(/[\s,–—-]*\d+\s*-?\s*(?:й\s*)?(?:сезон|season)\b/gi, '')
    .replace(/[\s,–—-]*(?:\d+\s*-?\s*(?:а\s*)?(?:частина|частину|часть|part)|(?:частина|частину|часть|part)\s*\d+)\b/gi, '')
    .replace(/[\s,–—:-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { base: base || title.trim(), season, part };
}

function translationVoiceName(name: string): string {
  return TRANSLATION_ALIASES[name.trim().toLowerCase()] || name;
}

/** Episode count of one catalog entry, from search metadata or the translations list. */
async function animeOnEntryLength(
  animeId: string,
  fallback: number | null,
  options?: { signal?: AbortSignal }
): Promise<number | null> {
  if (fallback && fallback > 0) return fallback;
  try {
    const translations = await getAnimeOnTranslations(animeId, options);
    let max = 0;
    for (const t of translations) {
      for (const p of t.player || []) {
        if (p.episodesCount && p.episodesCount > max) max = p.episodesCount;
      }
    }
    return max > 0 ? max : null;
  } catch {
    return null;
  }
}

/**
 * Picks the catalog entry (part/cour) that contains the requested absolute episode
 * and returns the offset that must be added to AnimeON episode numbers.
 */
async function resolveSeasonPart(
  current: { id: string; title: string },
  requestedSeason: number,
  requestedEpisode: number,
  options?: { signal?: AbortSignal }
): Promise<{ id: string; title: string; offset: number }> {
  const fallback = { id: current.id, title: current.title, offset: 0 };
  if (requestedEpisode <= 0) return fallback;

  const base = parseTitleParts(current.title).base;
  if (!base) return fallback;

  const items = await fetchAnimeOnItems(base, { signal: options?.signal });
  if (items.length === 0) return fallback;

  const siblings: Array<{ id: string; title: string; part: number; length: number | null }> = [];
  for (const item of items) {
    const mapped = mapAnimeOnItem(item);
    if (mapped.type === 'movie') continue;
    const parsed = parseTitleParts(mapped.title);
    if (parsed.season !== requestedSeason) continue;
    siblings.push({
      id: String(item.id),
      title: mapped.title,
      part: parsed.part,
      length: item.episodes ?? item.episodesAired ?? null,
    });
  }

  if (siblings.length <= 1) return fallback;

  siblings.sort((a, b) => a.part - b.part || Number(a.id) - Number(b.id));

  let offset = 0;
  let chosen = siblings[0];
  for (const candidate of siblings) {
    const length = await animeOnEntryLength(candidate.id, candidate.length, options);
    chosen = candidate;
    if (!length || requestedEpisode <= offset + length) break;
    offset += length;
  }

  return { id: chosen.id, title: chosen.title || current.title, offset };
}

/**
 * Fenix віддає одне спільне відео на всі озвучки, тому замість N майже однакових
 * джерел лишаємо одне: майстер злитий (`mergeAudio=1`) містить усі озвучки як HLS
 * audio renditions, а їхні назви перелічуємо в `audioTracks` (OMSS).
 */
function ensureMergeAudio(url: string): string {
  if (/[?&]mergeAudio=/.test(url)) return url.replace(/([?&]mergeAudio=)(0|false)/i, '$11');
  return `${url}${url.includes('?') ? '&' : '?'}mergeAudio=1`;
}

function mergeFenixSources(sources: StreamSource[]): StreamSource | null {
  const tracks: string[] = [];
  for (const source of sources) {
    const label = source.audio || source.title;
    if (label && !tracks.includes(label)) tracks.push(label);
  }

  const primary = sources[0];
  if (!primary) return null;
  if (tracks.length < 2) return primary;

  const url = ensureMergeAudio(primary.url);
  return {
    ...primary,
    url,
    audioTracks: sortAudioTrackLabels(tracks),
    sharedVideo: true,
    lazy: primary.lazy ? { ...primary.lazy, url: ensureMergeAudio(primary.lazy.url) } : primary.lazy,
  };
}

export async function getAnimeOnStreams(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult> {
  let animeId: string | null = null;
  let mediaType: MediaType = 'tv';
  let title = '';

  if (typeof target === 'object' && target !== null) {
    animeId = target.id;
    mediaType = target.type || 'tv';
    title = target.title;
  } else {
    const raw = target.trim();
    // 1. Check if raw is a number or contains slug with id at start (e.g. 216-ataka-tytaniv)
    const matchSlug = raw.match(/(?:anime\/|^)(\d+)(?:-|$)/);
    if (matchSlug) {
      animeId = matchSlug[1];
    } else {
      // 2. Search by text / title
      const searchResults = await searchAnimeOn(raw, {
        signal: options?.signal,
        year: options?.meta?.year,
      });
      if (searchResults.length > 0) {
        animeId = searchResults[0].id;
        mediaType = searchResults[0].type || 'tv';
        title = searchResults[0].title;
      }
    }
  }

  if (!animeId) {
    return { provider: 'animeon', type: mediaType, seasons: [], sources: [] };
  }

  const headers = ANIMEON_HEADERS;

  try {
    // 0. AnimeON keeps every cours as its own entry with episode numbers restarting at 1;
    //    pick the part that contains the requested absolute episode and shift accordingly.
    let episodeOffset = 0;
    if (mediaType === 'tv' && options?.episode !== undefined) {
      const requestedSeason = options.season !== undefined && options.season > 0
        ? options.season
        : parseTitleParts(title).season;
      const resolved = await resolveSeasonPart(
        { id: animeId, title },
        requestedSeason,
        options.episode,
        { signal: options?.signal }
      );
      animeId = resolved.id;
      title = resolved.title || title;
      episodeOffset = resolved.offset;
    }

    // 1. Fetch available translations and players
    const rawTranslations = await getAnimeOnTranslations(animeId, { signal: options?.signal });
    if (rawTranslations.length === 0) {
      return { provider: 'animeon', type: mediaType, seasons: [], sources: [] };
    }

    // 2. Build list of player/translation pairs to fetch episodes for
    const tasks: Array<{
      translationName: string;
      translationId: number;
      playerName: string;
      playerId: number;
    }> = [];

    for (const t of rawTranslations) {
      const transName = t.translation.name;
      const transId = t.translation.id;
      for (const p of t.player || []) {
        tasks.push({
          translationName: transName,
          translationId: transId,
          playerName: p.name,
          playerId: p.id,
        });
      }
    }

    // 3. Fetch episodes concurrently
    const episodeResults = await Promise.allSettled(
      tasks.map((task) =>
        httpRequest<EpisodesResponse>(
          `https://animeon.club/api/player/${animeId}/episodes?take=2000&skip=0&playerId=${task.playerId}&translationId=${task.translationId}&includeAlternative=true`,
          { headers, signal: options?.signal, timeout: 10000 }
        ).then((res) => ({ task, episodes: res.data?.episodes || [] }))
      )
    );

    // 4. Group by episode number
    // Map: episodeNumber (absolute, within the season) -> StreamSource[]
    const episodesMap = new Map<number, StreamSource[]>();
    // Fenix: один embed на серіал, окремий трек на кожну озвучку і спільне відео —
    // збираємо тут, щоб потім згорнути в одне джерело з audioTracks.
    const fenixMap = new Map<number, StreamSource[]>();
    let maxEpisode = 0;

    for (const res of episodeResults) {
      if (res.status !== 'fulfilled') continue;
      const { task, episodes } = res.value;
      const voiceName = translationVoiceName(task.translationName);

      for (const ep of episodes) {
        const epNum = ep.episode + episodeOffset;
        if (epNum > maxEpisode) maxEpisode = epNum;

        const playerLower = task.playerName.toLowerCase();
        const cdnType = playerLower === 'moon' ? 'moonanime' : playerLower === 'fenix' ? 'fenix' : 'ashdi';
        // Fenix віддає один embed на серіал із треками на кожну озвучку — голос треба передати явно.
        const voiceQuery = cdnType === 'fenix' ? `&voice=${encodeURIComponent(voiceName)}` : '';
        const lazyUrl = `/master.m3u8?cdn=${cdnType}&type=animeon&id=${ep.id}${voiceQuery}`;

        const source: StreamSource = {
          quality: '1080p',
          title: `${voiceName} (${task.playerName})`,
          audio: voiceName,
          url: lazyUrl,
          mime: 'application/x-mpegURL',
          poster: ep.poster || undefined,
          headers: {
            Origin: 'https://animeon.club',
            Referer: 'https://animeon.club/',
          },
          lazy: {
            cdn: cdnType,
            type: 'animeon',
            // Fenix обирає трек за нашим `voice`-параметром у lazyUrl, тож id не ставимо:
            // оркестратор з id перебудував би URL за cdn/type/id і загубив voice.
            ...(cdnType === 'fenix' ? {} : { id: String(ep.id) }),
            url: lazyUrl,
            directUrl: `https://animeon.club/api/player/${ep.id}/episode`,
          },
        };

        if (cdnType === 'fenix') {
          const existing = fenixMap.get(epNum) || [];
          existing.push(source);
          fenixMap.set(epNum, existing);
        } else {
          const existing = episodesMap.get(epNum) || [];
          existing.push(source);
          episodesMap.set(epNum, existing);
        }
      }
    }

    // Згортаємо озвучки Fenix: одне джерело на епізод з усіма доріжками в audioTracks.
    for (const [epNum, sources] of fenixMap.entries()) {
      const merged = mergeFenixSources(sources);
      if (!merged) continue;
      const existing = episodesMap.get(epNum) || [];
      existing.push(merged);
      episodesMap.set(epNum, existing);
    }

    // Check if it's a single movie or series
    if (maxEpisode <= 1 && mediaType === 'movie') {
      const movieSources = episodesMap.get(1) || [];
      return {
        provider: 'animeon',
        type: 'movie',
        sources: sortSources(movieSources),
      };
    }

    // Build TV Seasons
    const episodeList: Episode[] = [];
    for (const [epNum, sources] of episodesMap.entries()) {
      episodeList.push({
        episode: epNum,
        sources: sortSources(sources),
      });
    }

    episodeList.sort((a, b) => a.episode - b.episode);

    const detectedSeason =
      extractSeasonFromTitle(title) ||
      (options?.season !== undefined ? options.season : 1);
    const seasonNum = detectedSeason > 0 ? detectedSeason : 1;
    const seasons: Season[] = [
      {
        season: seasonNum,
        episodes: episodeList,
      },
    ];

    return {
      provider: 'animeon',
      type: 'tv',
      seasons: sortSeasons(seasons),
    };
  } catch {
    return { provider: 'animeon', type: mediaType, seasons: [], sources: [] };
  }
}

/**
 * Резолвить конкретну серію AnimeON в реальний VOD URL (Ashdi або MoonAnime)
 */
export async function resolveAnimeOnEpisode(
  episodeId: number | string,
  options?: { signal?: AbortSignal }
): Promise<{ cdn: 'ashdi' | 'moonanime'; url: string } | null> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://animeon.club/',
  };

  const res = await httpRequest<{ videoUrl?: string }>(
    `https://animeon.club/api/player/${episodeId}/episode`,
    { headers, signal: options?.signal, timeout: 8000 }
  );

  const videoUrl = res.data?.videoUrl;
  if (!videoUrl) return null;

  if (videoUrl.includes('moonanime') || videoUrl.includes('mooncdn')) {
    return { cdn: 'moonanime', url: videoUrl };
  }

  return { cdn: 'ashdi', url: videoUrl };
}
