import type { Episode, Season, StreamSource } from '../../../types/media.js';
import type { VodExtractionResult } from '../../../types/vod.js';
import { sortSeasons, sortSources } from '../../../utils/sort.js';
import {
  extractFileValueDeep,
  parsePlayerjsJson,
  parsePlayerjsSubtitles,
} from '../shared/playerjs/index.js';

interface TraversalContext {
  season?: number;
  episode?: number;
  dub?: string;
}

export function normalizeHdvbUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim();
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  }
  return clean;
}

export const parseHdvbSubtitles = parsePlayerjsSubtitles;

/**
 * Витягує та декодує значення `file:` з HTML коду Playerjs
 */
export function extractFileFromHtml(html: string): any {
  const fileValue = extractFileValueDeep(html);
  if (!fileValue) return null;

  // Якщо рядок починається з [ або { - пробуємо спарсити як JSON
  if (fileValue.startsWith('[') || fileValue.startsWith('{')) {
    return parsePlayerjsJson(fileValue);
  }

  // Пряме посилання на відео
  if (fileValue.startsWith('http') || fileValue.startsWith('//')) {
    return normalizeHdvbUrl(fileValue);
  }

  return fileValue;
}

/** Парсинг HTML сторінки плеєра HDVB. */
export function parseHdvbPlayerHtml(html: string, _pageUrl: string): VodExtractionResult | null {
  const posterMatch = html.match(/poster\s*:\s*["']([^"']+)["']/);
  const defaultPoster = posterMatch ? normalizeHdvbUrl(posterMatch[1]) : null;

  const subMatch = html.match(/subtitle\s*:\s*['"]([^'"]+)['"]/);
  const defaultSubtitles = subMatch ? parseHdvbSubtitles(subMatch[1]) : [];

  const fileData = extractFileFromHtml(html);
  if (!fileData) return null;

  // 1. Простий прямий URL (фільм)
  if (typeof fileData === 'string' && (fileData.startsWith('http') || fileData.includes('.m3u8'))) {
    const srcUrl = normalizeHdvbUrl(fileData);
    return {
      sources: [{
        title: 'HDVB',
        url: srcUrl,
        mime: srcUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
        poster: defaultPoster,
        subtitles: defaultSubtitles,
      }],
    };
  }

  // 2. Дерево плейлиста (масив або об'єкт)
  const items = Array.isArray(fileData) ? fileData : [fileData];
  const seasonsMap = new Map<number, Map<number, StreamSource[]>>();
  const flatSources: StreamSource[] = [];

  const traverse = (nodeList: any[], ctx: TraversalContext) => {
    for (const item of nodeList) {
      if (!item) continue;
      const currentCtx: TraversalContext = { ...ctx };
      const rawTitle: string = (item.title || '').trim();

      // Пошук сезону
      const sMatch = rawTitle.match(/(?:season|сезон|s)\s*(\d+)/i) || rawTitle.match(/(\d+)\s*(?:season|сезон)/i);
      if (sMatch) {
        currentCtx.season = parseInt(sMatch[1], 10);
      }

      // Пошук серії
      const eMatch = rawTitle.match(/(?:episode|серія|серiя|епізод|ep|e)\s*(\d+)/i) || rawTitle.match(/(\d+)\s*(?:episode|серія|серiя|епізод)/i);
      if (eMatch) {
        currentCtx.episode = parseInt(eMatch[1], 10);
      }

      if (item.folder && Array.isArray(item.folder)) {
        // Якщо назва папки - це не сезон і не серія, це може бути назва озвучки
        let cleanDub = rawTitle;
        if (sMatch) cleanDub = cleanDub.replace(sMatch[0], '');
        if (eMatch) cleanDub = cleanDub.replace(eMatch[0], '');
        cleanDub = cleanDub.replace(/[\(\)\[\]]/g, '').trim().replace(/^[\s\-\.]+|[\s\-\.]+$/g, '');

        if (cleanDub.length > 0 && !/^\d+$/.test(cleanDub)) {
          currentCtx.dub = cleanDub;
        }

        traverse(item.folder, currentCtx);
      } else if (item.file || item.link || item.url) {
        const streamUrl = normalizeHdvbUrl(item.file || item.link || item.url);
        if (!streamUrl) continue;

        const itemPoster = item.poster ? normalizeHdvbUrl(item.poster) : defaultPoster;
        const itemSubs = item.subtitle ? parseHdvbSubtitles(item.subtitle) : defaultSubtitles;
        const dubTitle = currentCtx.dub || item.name || 'HDVB';

        const source: StreamSource = {
          title: dubTitle,
          audio: currentCtx.dub,
          url: streamUrl,
          mime: streamUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
          poster: itemPoster,
          subtitles: itemSubs,
        };

        const s = currentCtx.season || item.season;
        let e = currentCtx.episode || item.episode;

        if (s !== undefined || e !== undefined) {
          const seasonNum = s || 1;
          const episodeNum = e || (seasonsMap.get(seasonNum)?.size || 0) + 1;

          if (!seasonsMap.has(seasonNum)) {
            seasonsMap.set(seasonNum, new Map());
          }
          const epMap = seasonsMap.get(seasonNum)!;
          if (!epMap.has(episodeNum)) {
            epMap.set(episodeNum, []);
          }
          epMap.get(episodeNum)!.push(source);
        } else {
          flatSources.push(source);
        }
      }
    }
  };

  traverse(items, {});

  if (seasonsMap.size > 0) {
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
        episodes: episodes.sort((a, b) => a.episode - b.episode),
      });
    }
    return { seasons: sortSeasons(seasons) };
  }

  if (flatSources.length > 0) {
    return { sources: sortSources(flatSources) };
  }

  return null;
}
