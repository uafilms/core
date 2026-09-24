import type { Episode, ProviderResult, Season, SearchResult, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import { rankSearchResults, sortSeasons, sortSources } from '../../utils/sort.js';
import { findById, findByImdbId, searchTitles } from './db.js';
import type { UakinoDbRow } from './types.js';

interface RawPlaylistItem {
  title?: string;
  file?: string;
  folder?: RawPlaylistItem[];
}

function extractAshdiVodId(url: string): string | null {
  const match = url.match(/ashdi\.(?:vip|site)\/vod\/(\d+)/i);
  return match ? match[1] : null;
}

function normalizeUrl(url: string): string {
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

function parseEpisodeNumber(title?: string, index?: number): number {
  if (title) {
    const match = title.match(/(?:серія|серiя|серію|серiю|episode|ep|e)\s*(\d+)/i) || title.match(/^(\d+)\s*(?:серія|серiя|ep)/i);
    if (match) return parseInt(match[1], 10);
    const numOnly = title.match(/\b(\d+)\b/);
    if (numOnly) return parseInt(numOnly[1], 10);
  }
  return (index ?? 0) + 1;
}

function parseSeasonNumber(title?: string, fallback = 1): number {
  if (title) {
    const match = title.match(/(?:сезон|season|s)\s*(\d+)/i) || title.match(/^(\d+)\s*(?:сезон|season)/i);
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function buildSourceFromUrl(url: string, dubTitle: string, poster?: string | null): StreamSource {
  const fullUrl = normalizeUrl(url);
  const ashdiId = extractAshdiVodId(fullUrl);

  return {
    title: dubTitle || 'UAKino',
    audio: dubTitle || 'UAKino',
    url: ashdiId ? `/master.m3u8?cdn=ashdi&type=vod&id=${ashdiId}` : fullUrl,
    mime: 'application/x-mpegURL',
    poster: poster || undefined,
    lazy: {
      cdn: 'ashdi',
      type: 'vod',
      id: ashdiId || undefined,
      url: ashdiId ? `/master.m3u8?cdn=ashdi&type=vod&id=${ashdiId}` : fullUrl,
    },
  };
}

function isTvContent(rows: UakinoDbRow[]): boolean {
  for (const r of rows) {
    if (r.season !== null && r.season !== undefined && r.season > 0) return true;
    if (r.playlist) {
      if (r.playlist.includes('"folder"')) return true;
      try {
        const parsed = JSON.parse(r.playlist.replace(/\\"/g, '"'));
        if (Array.isArray(parsed) && parsed.some((p: any) => p.folder || (p.title && /(?:сезон|сері|season|ep)/i.test(p.title)))) {
          return true;
        }
      } catch {}
    }
  }
  return false;
}

export async function searchUakinoApp(query: string, options?: ProviderSearchOptions): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  let rows: UakinoDbRow[] = [];

  if (/^tt\d+$/i.test(cleanQuery)) {
    rows = await findByImdbId(cleanQuery);
  } else {
    rows = await searchTitles(cleanQuery, options?.year, 30);
  }

  if (rows.length === 0) return [];

  const seenMap = new Map<string, SearchResult>();

  for (const row of rows) {
    const groupKey = row.imdb_id || `id_${row.id}`;
    if (seenMap.has(groupKey)) continue;

    const type: 'movie' | 'tv' = row.is_tv === 1 ? 'tv' : 'movie';
    if (options?.type && options.type !== type) continue;

    const item: SearchResult = {
      id: String(row.id),
      title: row.title,
      originalTitle: row.origname || undefined,
      year: row.year || undefined,
      type,
      url: `https://uakino.best/post/${row.id}`,
      poster: row.poster || undefined,
      details: { source: 'app', imdb_id: row.imdb_id },
    };

    seenMap.set(groupKey, item);
  }

  const results = Array.from(seenMap.values());
  return rankSearchResults(results, cleanQuery, options?.year);
}

export async function getUakinoApp(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let rows: UakinoDbRow[] = [];

  if (typeof target === 'object') {
    const id = parseInt(target.id, 10);
    if (!isNaN(id)) {
      const single = await findById(id);
      if (single) {
        if (single.imdb_id) {
          rows = await findByImdbId(single.imdb_id);
        } else {
          rows = [single];
        }
      }
    }
  } else {
    const str = target.trim();
    if (/^tt\d+$/i.test(str)) {
      rows = await findByImdbId(str);
    } else if (/^\d+$/.test(str)) {
      const single = await findById(parseInt(str, 10));
      if (single) {
        if (single.imdb_id) {
          rows = await findByImdbId(single.imdb_id);
        } else {
          rows = [single];
        }
      }
    } else {
      const searchRes = await searchUakinoApp(str, { year: options?.meta?.year });
      if (searchRes.length > 0) {
        return getUakinoApp(searchRes[0], options);
      }
    }
  }

  if (rows.length === 0) return null;

  const isTv = isTvContent(rows);

  if (!isTv) {
    const sources: StreamSource[] = [];
    for (const r of rows) {
      if (r.ashdivip) {
        sources.push(buildSourceFromUrl(r.ashdivip, r.title, r.poster));
      }
      if (r.playlist) {
        try {
          const raw = JSON.parse(r.playlist.replace(/\\"/g, '"'));
          if (Array.isArray(raw)) {
            for (const item of raw) {
              if (item.file) {
                sources.push(buildSourceFromUrl(item.file, item.title || r.title, r.poster));
              }
            }
          }
        } catch {}
      }
    }

    if (sources.length === 0) return null;

    return {
      provider: 'uakino',
      type: 'movie',
      sources,
    };
  }

  // TV series handling
  const seasonMap = new Map<number, Map<number, StreamSource[]>>();

  for (const r of rows) {
    const rowSeason = r.season && r.season > 0 ? r.season : 1;

    if (!r.playlist) {
      if (r.ashdivip) {
        const s = seasonMap.get(rowSeason) || new Map<number, StreamSource[]>();
        const epSources = s.get(1) || [];
        epSources.push(buildSourceFromUrl(r.ashdivip, r.title, r.poster));
        s.set(1, epSources);
        seasonMap.set(rowSeason, s);
      }
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(r.playlist.replace(/\\"/g, '"'));
    } catch {
      continue;
    }

    if (!Array.isArray(parsed)) continue;

    function traverse(items: RawPlaylistItem[], currentSeason: number, currentDub: string) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const title = item.title || '';

        if (item.folder && Array.isArray(item.folder)) {
          let sNum = parseSeasonNumber(title, currentSeason);
          let dub = currentDub;
          if (!/(?:сезон|season)/i.test(title)) {
            dub = title.replace(/[\[\]\(\)]/g, '').trim() || currentDub;
          }
          traverse(item.folder, sNum, dub);
        } else if (item.file) {
          const epNum = parseEpisodeNumber(title, i);
          const sNum = parseSeasonNumber(title, currentSeason);
          const dubTitle = currentDub || title || 'Original';

          const sMap = seasonMap.get(sNum) || new Map<number, StreamSource[]>();
          const epSources = sMap.get(epNum) || [];
          epSources.push(buildSourceFromUrl(item.file, dubTitle, r.poster));
          sMap.set(epNum, epSources);
          seasonMap.set(sNum, sMap);
        }
      }
    }

    traverse(parsed, rowSeason, '');
  }

  const seasons: Season[] = [];
  for (const [sNum, epMap] of seasonMap.entries()) {
    const episodes: Episode[] = [];
    for (const [epNum, sources] of epMap.entries()) {
      episodes.push({
        episode: epNum,
        sources: sortSources(sources),
      });
    }
    episodes.sort((a, b) => a.episode - b.episode);
    seasons.push({
      season: sNum,
      episodes,
    });
  }

  if (seasons.length === 0) return null;

  return {
    provider: 'uakino',
    type: 'tv',
    seasons: sortSeasons(seasons),
  };
}
