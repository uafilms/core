import type { Episode, Season, StreamSource, Subtitle } from '../../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml } from '../../../utils/http.js';
import { sortSeasons, sortSources } from '../../../utils/sort.js';
import { decodeTortuga } from './decrypt.js';
import { parsePlayerjsSubtitles } from '../shared/playerjs/index.js';
import {
  TORTUGA_EMBED_FILE_RE,
  TORTUGA_FBU_RE,
  TORTUGA_ORIGIN,
  TORTUGA_POSTER_RE,
  TORTUGA_REFERER,
  TORTUGA_SUBTITLE_ENCODED_RE,
  TORTUGA_SUBTITLE_PLAIN_RE,
  TORTUGA_VOD_FILE_RE,
} from './config.js';

/** Підписаний лінк `/t/<token>/<hash>/...`: CDN звіряє IP і час із токеном у шляху. */
const TORTUGA_SIGNED_URL_RE = /https?:\/\/[^/\s"'()]+\/t\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)\/[A-Za-z0-9._~%+-]+/g;
const TORTUGA_SIGNED_PATH_RE = /\/t\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\//;

/** Декодує `fbu:` у мапу hash → канонічний URL (не прив'язаний до IP). */
function parseFbuMap(html: string): Record<string, string> {
  const match = html.match(TORTUGA_FBU_RE);
  const decoded = match ? decodeTortuga(match[1]) : null;
  if (!decoded) return {};

  try {
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const map: Record<string, string> = {};
    for (const [hash, url] of Object.entries(parsed)) {
      if (typeof url === 'string' && /^https?:\/\//.test(url)) map[hash] = url;
    }
    return map;
  } catch {
    return {};
  }
}

/** Замінює підписані `/t/` лінки на канонічні з `fbu`, якщо hash відомий. */
function applyFbuMap(text: string, fbu: Record<string, string>): string {
  if (!text || Object.keys(fbu).length === 0) return text;
  return text.replace(TORTUGA_SIGNED_URL_RE, (match, hash: string) => fbu[hash] || match);
}

/**
 * Декодує та резолвить URL. Підписані лінки без відповідника в `fbu`
 * відкидаються: з іншої IP вони віддають 403.
 */
function resolveTortugaUrl(encoded: string | null | undefined, fbu: Record<string, string>): string | undefined {
  const decoded = decodeTortuga(encoded);
  if (!decoded) return undefined;

  const resolved = applyFbuMap(decoded, fbu);
  return TORTUGA_SIGNED_PATH_RE.test(resolved) ? undefined : resolved;
}

/** Розбирає рядок Playerjs-субтитрів, відкидаючи підписані лінки без відповідника в `fbu`. */
function parseTortugaSubtitles(raw: string | null | undefined, fbu: Record<string, string>): Subtitle[] | undefined {
  if (!raw) return undefined;

  const subtitles = parsePlayerjsSubtitles(applyFbuMap(raw, fbu))
    .filter(s => !TORTUGA_SIGNED_PATH_RE.test(s.url));
  return subtitles.length > 0 ? subtitles : undefined;
}

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

function extractMeta(html: string, fbu: Record<string, string>): { poster?: string; subtitles?: Subtitle[] } {
  const posterMatch = html.match(TORTUGA_POSTER_RE);
  const poster = posterMatch ? resolveTortugaUrl(posterMatch[1], fbu) : undefined;

  const subMatch = html.match(TORTUGA_SUBTITLE_ENCODED_RE);
  const decodedSub = subMatch ? decodeTortuga(subMatch[1]) : null;
  const rawSubMatch = !decodedSub ? html.match(TORTUGA_SUBTITLE_PLAIN_RE) : null;
  const subString = decodedSub || (rawSubMatch ? rawSubMatch[1] : null);
  const subtitles = parseTortugaSubtitles(subString, fbu);

  return {
    poster: poster || undefined,
    subtitles,
  };
}

/**
 * Парсинг HTML сторінки Tortuga плеєра (як /vod/, так і /embed/).
 */
export function parseTortugaPlayerHtml(html: string, _pageUrl?: string): VodExtractionResult | null {
  if (!html) return null;

  const fileMatch = html.match(TORTUGA_EMBED_FILE_RE) || html.match(TORTUGA_VOD_FILE_RE);
  if (!fileMatch) return null;

  const rawDecoded = decodeTortuga(fileMatch[1]);
  if (!rawDecoded) return null;

  const fbu = parseFbuMap(html);
  // `file` містить підписані `/t/` лінки — замінюємо їх на канонічні з `fbu`,
  // інакше CDN віддасть 403, щойно IP запиту не збіжиться з IP генерації сторінки.
  const decoded = applyFbuMap(rawDecoded, fbu);

  const { poster, subtitles: fallbackSubs } = extractMeta(html, fbu);

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
          poster: item.poster ? (resolveTortugaUrl(item.poster, fbu) || poster) : poster,
          subtitles: s.subtitle
            ? parseTortugaSubtitles(s.subtitle, fbu)
            : (item.subtitle ? parseTortugaSubtitles(decodeTortuga(item.subtitle) || item.subtitle, fbu) : fallbackSubs),
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
          poster: node.poster ? (resolveTortugaUrl(node.poster, fbu) || poster) : poster,
          subtitles: subStr ? parseTortugaSubtitles(subStr, fbu) : fallbackSubs,
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
