import type { Episode, Season, StreamSource, Subtitle } from '../../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { sortSeasons, sortSources } from '../../../utils/sort.js';
import { decodeTortuga } from './decrypt.js';
import { parsePlayerjsSubtitles } from '../shared/playerjs/index.js';
import {
  TORTUGA_EMBED_FILE_RE,
  TORTUGA_ORIGIN,
  TORTUGA_POSTER_RE,
  TORTUGA_REFERER,
  TORTUGA_SUBTITLE_ENCODED_RE,
  TORTUGA_SUBTITLE_PLAIN_RE,
  TORTUGA_VOD_FILE_RE,
} from './config.js';

async function fetchTortugaHtml(url: string, options: VodExtractionOptions = {}): Promise<string> {
  return getHtml(url, {
    signal: options.signal,
    headers: {
      'Referer': options.referer || TORTUGA_REFERER,
      'Origin': TORTUGA_ORIGIN,
      ...options.headers,
    },
  });
}

function parsePlayerjsFileString(raw: string, defaultTitle = 'Tortuga'): Array<{ title: string; url: string; subtitle?: string }> {
  const sources: Array<{ title: string; url: string; subtitle?: string }> = [];
  const regex = /(?:\{([^}]+)\})?([^({\s]+)(?:\(subtitle:([^)]+)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const title = match[1]?.trim() || defaultTitle;
    let url = match[2]?.trim();
    if (!url || url === 'or') continue;
    if (url.startsWith('or ')) url = url.slice(3).trim();
    if (!url.startsWith('http')) continue;
    const sub = match[3]?.trim();
    sources.push({ title, url, subtitle: sub });
  }
  return sources;
}

function extractMeta(html: string): { poster?: string; subtitles?: Subtitle[] } {
  const posterMatch = html.match(TORTUGA_POSTER_RE);
  const poster = posterMatch ? (decodeTortuga(posterMatch[1]) || posterMatch[1]) : undefined;

  const subMatch = html.match(TORTUGA_SUBTITLE_ENCODED_RE);
  const decodedSub = subMatch ? decodeTortuga(subMatch[1]) : null;
  const rawSubMatch = !decodedSub ? html.match(TORTUGA_SUBTITLE_PLAIN_RE) : null;
  const subString = decodedSub || (rawSubMatch ? rawSubMatch[1] : null);
  const subtitles = subString ? parsePlayerjsSubtitles(subString) : undefined;

  return {
    poster: poster || undefined,
    subtitles: subtitles && subtitles.length > 0 ? subtitles : undefined,
  };
}

/**
 * Парсинг HTML сторінки Tortuga плеєра (як /vod/, так і /embed/).
 */
export function parseTortugaPlayerHtml(html: string, _pageUrl?: string): VodExtractionResult | null {
  if (!html) return null;

  const fileMatch = html.match(TORTUGA_EMBED_FILE_RE) || html.match(TORTUGA_VOD_FILE_RE);
  if (!fileMatch) return null;

  const decoded = decodeTortuga(fileMatch[1]);
  if (!decoded) return null;

  const { poster, subtitles: fallbackSubs } = extractMeta(html);

  // Варіант 1: Пряме посилання на m3u8 або Playerjs рядок вигляду {Озвучка}url(subtitle:...)
  if (!decoded.startsWith('[') && !decoded.startsWith('{')) {
    const parsedSources = parsePlayerjsFileString(decoded, 'Tortuga');
    if (parsedSources.length > 0) {
      return {
        sources: sortSources(parsedSources.map(s => ({
          title: s.title,
          url: s.url,
          mime: 'application/x-mpegURL',
          poster,
          subtitles: s.subtitle ? parsePlayerjsSubtitles(s.subtitle) : fallbackSubs,
        }))),
      };
    }
    return null;
  }

  let json: any;
  try {
    json = JSON.parse(decoded);
  } catch {
    return null;
  }

  // Варіант 2: Масив озвучок фільму без папок: [{ title, file }]
  if (Array.isArray(json) && json[0]?.file && !json[0]?.folder) {
    const sources: StreamSource[] = [];
    for (const item of json) {
      const parsed = parsePlayerjsFileString(item.file, item.title || 'Tortuga');
      for (const s of parsed) {
        sources.push({
          title: s.title || item.title || 'Tortuga',
          url: s.url,
          mime: 'application/x-mpegURL',
          poster: item.poster ? (decodeTortuga(item.poster) || item.poster) : poster,
          subtitles: s.subtitle
            ? parsePlayerjsSubtitles(s.subtitle)
            : (item.subtitle ? parsePlayerjsSubtitles(decodeTortuga(item.subtitle) || item.subtitle) : fallbackSubs),
        });
      }
    }
    return sources.length > 0 ? { sources: sortSources(sources) } : null;
  }

  // Варіант 3: Дерево папок (сезони, серії, озвучки)
  const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

  const walk = (node: any, ctx: { dub?: string; season?: number; episode?: number }) => {
    if (!node) return;
    const currentCtx = { ...ctx };
    const titleStr = String(node.title || '').trim();

    const sMatch = titleStr.match(/(?:Сезон|Season)\s*(\d+)/i);
    if (sMatch) currentCtx.season = parseInt(sMatch[1], 10);

    const eMatch = titleStr.match(/(?:Серія|Серію|Серії|Episode|Ep\.?)\s*(\d+)/i);
    if (eMatch) currentCtx.episode = parseInt(eMatch[1], 10);

    if (titleStr && !sMatch && !eMatch && !currentCtx.dub && Array.isArray(node.folder)) {
      currentCtx.dub = titleStr;
    }

    if (node.file && typeof node.file === 'string') {
      const s = currentCtx.season || 1;
      const e = currentCtx.episode || 1;
      const parsedSources = parsePlayerjsFileString(node.file, currentCtx.dub || titleStr || 'Tortuga');

      if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
      const epMap = seasonsMap.get(s)!;
      if (!epMap.has(e)) epMap.set(e, []);

      for (const src of parsedSources) {
        const nodeSub = node.subtitle ? (decodeTortuga(node.subtitle) || node.subtitle) : undefined;
        const subStr = src.subtitle || nodeSub;
        epMap.get(e)!.push({
          title: src.title || currentCtx.dub || 'Tortuga',
          url: src.url,
          mime: 'application/x-mpegURL',
          poster: node.poster ? (decodeTortuga(node.poster) || node.poster) : poster,
          subtitles: subStr ? parsePlayerjsSubtitles(subStr) : fallbackSubs,
        });
      }
    }

    if (Array.isArray(node.folder)) {
      for (const child of node.folder) {
        walk(child, currentCtx);
      }
    }
  };

  if (Array.isArray(json)) {
    for (const root of json) walk(root, {});
  } else {
    walk(json, {});
  }

  if (seasonsMap.size === 0) return null;

  const seasons: Season[] = [];
  for (const [seasonNum, epMap] of seasonsMap.entries()) {
    const episodes: Episode[] = [];
    for (const [epNum, sources] of epMap.entries()) {
      episodes.push({
        episode: epNum,
        sources: sortSources(sources),
      });
    }
    episodes.sort((a, b) => a.episode - b.episode);
    seasons.push({
      season: seasonNum,
      episodes,
    });
  }

  return { seasons: sortSeasons(seasons) };
}

/** Парсинг фільму (/vod/). */
export async function parseTortugaVod(
  vodUrl: string,
  options: VodExtractionOptions = {},
): Promise<{ file: string; poster?: string | null; subtitle?: string | null } | null> {
  try {
    const html = await fetchTortugaHtml(vodUrl, options);
    const parsed = parseTortugaPlayerHtml(html, vodUrl);
    if (!parsed) return null;

    if (parsed.sources && parsed.sources.length > 0) {
      const first = parsed.sources[0];
      return {
        file: first.url,
        poster: first.poster || null,
        subtitle: first.subtitles?.[0]?.url || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Парсинг серіалу (/embed/). */
export async function parseTortugaEmbed(
  embedUrl: string,
  options: VodExtractionOptions = {},
): Promise<Season[] | null> {
  try {
    const html = await fetchTortugaHtml(embedUrl, options);
    const parsed = parseTortugaPlayerHtml(html, embedUrl);
    return parsed?.seasons || null;
  } catch {
    return null;
  }
}
