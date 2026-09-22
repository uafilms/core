import type { Episode, ProviderResult, Season, SearchResult, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import { ashdiVod } from '../../vods/index.js';
import { logWarn } from '../../utils/logger.js';
import { rankSearchResults, sortSeasons, sortSources } from '../../utils/sort.js';
import { findByImdbId, findBySlug, searchKinoUkrDbRows } from './db.js';
import type { KinoUkrDbRow } from './types.js';

const BASE_URL = 'https://kinoukr.tv';

function extractIdFromPath(pathStr: string): string | null {
  const match = pathStr.match(/(?:vod|serial|embed)\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

export async function searchKinoUkrDb(
  query: string,
  options: ProviderSearchOptions = {}
): Promise<SearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const rows = await searchKinoUkrDbRows(cleanQ, options.year, 25);

  const rawResults: SearchResult[] = rows.map((row) => ({
    id: row.slug,
    title: row.title,
    originalTitle: row.eng_name || undefined,
    year: row.year ? Number(row.year) : undefined,
    type: row.is_tv ? 'tv' : 'movie',
    url: `${BASE_URL}/${row.slug}`,
    details: {
      source: 'db',
      imdbId: row.imdb_id || undefined,
      ashdi: row.ashdi || undefined,
      tortuga: row.tortuga || undefined,
    },
  }));

  return rankSearchResults(rawResults, cleanQ, options.year);
}

export async function getKinoUkrDb(
  target: SearchResult | string,
  options: ProviderGetOptions = {}
): Promise<ProviderResult | null> {
  let row: KinoUkrDbRow | null = null;

  if (typeof target === 'string') {
    if (target.startsWith('tt')) {
      row = await findByImdbId(target);
      if (!row && options.meta?.title) {
        const found = await searchKinoUkrDbRows(options.meta.title, options.meta.year, 1);
        row = found[0] || null;
      }
    } else if (target.endsWith('.html') || target.includes('-')) {
      const slug = target.replace(/^https?:\/\/[^/]+\//, '');
      row = await findBySlug(slug);
    } else {
      const found = await searchKinoUkrDbRows(target, undefined, 1);
      row = found[0] || null;
    }
  } else {
    const imdbId = target.details?.imdbId as string | undefined;
    if (imdbId) {
      row = await findByImdbId(imdbId);
    }
    if (!row && target.id) {
      row = await findBySlug(target.id);
    }
    if (!row && target.title) {
      const found = await searchKinoUkrDbRows(target.title, target.year, 1);
      row = found[0] || null;
    }
  }

  if (!row) return null;

  const isTv = row.is_tv === 1 || (row.ashdi && row.ashdi.includes('serial/')) || (row.tortuga && row.tortuga.includes('embed/'));

  if (isTv) {
    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

    // 1. Resolve Ashdi series if present
    if (row.ashdi && row.ashdi.includes('serial/')) {
      try {
        const ashdiUrl = `https://ashdi.vip/${row.ashdi}`;
        const ashdiRes = await ashdiVod.extract(ashdiUrl, { signal: options.signal });
        if (ashdiRes && ashdiRes.seasons) {
          for (const s of ashdiRes.seasons) {
            if (!seasonsMap.has(s.season)) {
              seasonsMap.set(s.season, new Map());
            }
            const epMap = seasonsMap.get(s.season)!;
            for (const ep of s.episodes) {
              if (!epMap.has(ep.episode)) {
                epMap.set(ep.episode, []);
              }
              epMap.get(ep.episode)!.push(...ep.sources);
            }
          }
        }
      } catch (err) {
        logWarn('kinoukr', `failed to extract ashdi serial: ${err}`);
      }
    }

    // 2. Add Tortuga embed lazy routes if present
    if (row.tortuga && row.tortuga.includes('embed/')) {
      const tortugaId = extractIdFromPath(row.tortuga);
      if (tortugaId) {
        const tortugaStream: StreamSource = {
          title: 'Tortuga (Mirror)',
          url: `/master.m3u8?cdn=tortuga&type=embed&id=${tortugaId}`,
          lazy: {
            cdn: 'tortuga',
            type: 'embed',
            id: tortugaId,
            url: `https://tortuga.tw/embed/${tortugaId}`,
          },
        };

        const targetSeason = seasonsMap.get(1) || new Map<number, StreamSource[]>();
        const epSources = targetSeason.get(1) || [];
        epSources.push(tortugaStream);
        targetSeason.set(1, epSources);
        seasonsMap.set(1, targetSeason);
      }
    }

    const seasons: Season[] = [];
    for (const [sNum, epMap] of seasonsMap.entries()) {
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
      provider: 'kinoukr',
      type: 'tv',
      seasons: sortSeasons(seasons),
    };
  }

  // Movie
  const sources: StreamSource[] = [];

  if (row.ashdi) {
    const ashdiId = extractIdFromPath(row.ashdi);
    sources.push({
      title: 'Ashdi',
      url: ashdiId
        ? `/master.m3u8?cdn=ashdi&type=vod&id=${ashdiId}`
        : `https://ashdi.vip/${row.ashdi}`,
      mime: 'application/x-mpegURL',
      lazy: ashdiId
        ? {
            cdn: 'ashdi',
            type: 'vod',
            id: ashdiId,
            url: `https://ashdi.vip/${row.ashdi}`,
          }
        : undefined,
    });
  }

  if (row.tortuga) {
    const tortugaId = extractIdFromPath(row.tortuga);
    sources.push({
      title: 'Tortuga',
      url: tortugaId
        ? `/master.m3u8?cdn=tortuga&type=vod&id=${tortugaId}`
        : `https://tortuga.tw/${row.tortuga}`,
      lazy: tortugaId
        ? {
            cdn: 'tortuga',
            type: 'vod',
            id: tortugaId,
            url: `https://tortuga.tw/${row.tortuga}`,
          }
        : undefined,
    });
  }

  if (sources.length === 0) return null;

  return {
    provider: 'kinoukr',
    type: 'movie',
    sources: sortSources(sources),
  };
}
