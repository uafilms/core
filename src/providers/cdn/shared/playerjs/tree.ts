import type { Episode, Season, StreamSource, Subtitle } from '../../../../types/media.js';
import type { VodExtractionResult } from '../../../../types/vod.js';
import { sortSeasons, sortSources } from '../../../../utils/sort.js';
import { parsePlayerjsSubtitles } from './subtitles.js';

export interface DubTreeOptions {
  /** Назва джерела, коли ні озвучка, ні title вузла невідомі. */
  defaultTitle: string;
  seasonRe: RegExp;
  episodeRe: RegExp;
  /** Нормалізація URL джерела й постера (CDN-специфічна). */
  normalizeUrl: (url: string) => string;
  /** true — озвучку бере з title будь-якого вузла (Ashdi); false — лише з папки без сезону/серії (ZetVideo). */
  dubFromAnyNode: boolean;
  /** Озвучка з `item.title` для списку фільму. */
  trimDubTitle?: boolean;
  /** Сортувати джерела у списку озвучок фільму. */
  sortMovieSources?: boolean;
  /** Постер і субтитри з верхнього рівня HTML, якщо їх немає у вузлі. */
  fallbackPoster?: string | null;
  fallbackSubtitles?: Subtitle[];
}

/**
 * Розбір дерева плейлиста Playerjs з папками озвучок і сезонами:
 * або плаский список озвучок фільму, або сезони з серіями.
 */
export function parsePlayerjsDubTree(parsed: any, opts: DubTreeOptions): VodExtractionResult | null {
  // Масив озвучок фільму: [{ title, file }]
  if (Array.isArray(parsed) && parsed[0]?.file && !parsed[0]?.folder) {
    const sources: StreamSource[] = parsed.map((item: any) => ({
      title: (opts.trimDubTitle ? item.title?.trim() : item.title) || opts.defaultTitle,
      url: opts.normalizeUrl(item.file),
      mime: 'application/x-mpegURL',
      poster: item.poster ? opts.normalizeUrl(item.poster) : opts.fallbackPoster || undefined,
      subtitles: item.subtitle ? parsePlayerjsSubtitles(item.subtitle) : opts.fallbackSubtitles,
    }));

    return { sources: opts.sortMovieSources ? sortSources(sources) : sources };
  }

  const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

  const walk = (node: any, ctx: { dub?: string; season?: number; episode?: number }) => {
    if (!node) return;
    const currentCtx = { ...ctx };
    const titleStr = String(node.title || '').trim();

    const sMatch = titleStr.match(opts.seasonRe);
    if (sMatch) currentCtx.season = parseInt(sMatch[1], 10);

    const eMatch = titleStr.match(opts.episodeRe);
    if (eMatch) currentCtx.episode = parseInt(eMatch[1], 10);

    if (opts.dubFromAnyNode) {
      if (node.title && !currentCtx.dub) currentCtx.dub = titleStr;
    } else if (titleStr && !sMatch && !eMatch && !currentCtx.dub && Array.isArray(node.folder)) {
      currentCtx.dub = titleStr;
    }

    if (node.file && typeof node.file === 'string') {
      const s = currentCtx.season || 1;
      const e = currentCtx.episode || 1;
      const dubTitle = currentCtx.dub || titleStr || opts.defaultTitle;

      if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
      const epMap = seasonsMap.get(s)!;

      if (!epMap.has(e)) epMap.set(e, []);
      epMap.get(e)!.push({
        title: dubTitle,
        url: opts.normalizeUrl(node.file),
        mime: 'application/x-mpegURL',
        poster: node.poster ? opts.normalizeUrl(node.poster) : opts.fallbackPoster || undefined,
        subtitles: node.subtitle ? parsePlayerjsSubtitles(node.subtitle) : opts.fallbackSubtitles,
      });
    }

    if (Array.isArray(node.folder)) {
      for (const child of node.folder) {
        walk(child, currentCtx);
      }
    }
  };

  if (Array.isArray(parsed)) {
    for (const root of parsed) walk(root, {});
  } else if (parsed && typeof parsed === 'object') {
    walk(parsed, {});
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
    seasons.push({
      season: seasonNum,
      episodes,
    });
  }

  return { seasons: sortSeasons(seasons) };
}
