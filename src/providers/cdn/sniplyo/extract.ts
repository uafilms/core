import type { Episode, Season, StreamSource } from '../../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import { getHtml, request } from '../../../utils/http.js';
import { sortSeasons, sortSources } from '../../../utils/sort.js';
import { SNIPLYO_FILE_RE, SNIPLYO_PL_RE } from './config.js';

export function parseEpisodeNumber(title: string, indexFallback: number): number {
  const labeledMatch = title.match(/(?:серія|серiя|episode|ep|e)\s*0*(\d+)/i);
  if (labeledMatch) return parseInt(labeledMatch[1], 10);

  const prefixMatch = title.match(/^0*(\d+)\s*(?:серія|серiя|cерія|cерiя|\.|\b)/i);
  if (prefixMatch) return parseInt(prefixMatch[1], 10);

  const bracketMatch = title.match(/\[0*(\d+)\]/);
  if (bracketMatch) return parseInt(bracketMatch[1], 10);

  const singleNumMatch = title.trim().match(/^0*(\d+)$/);
  if (singleNumMatch) return parseInt(singleNumMatch[1], 10);

  const anyNumMatch = title.match(/\b0*(\d+)\b/);
  if (anyNumMatch) return parseInt(anyNumMatch[1], 10);

  return indexFallback;
}

export function parseSeasonNumber(title: string, fallbackSeason: number): number {
  const match = title.match(/(?:сезон|season|s)\s*0*(\d+)/i) || title.match(/^0*(\d+)\s*(?:сезон|season)/i);
  if (match) return parseInt(match[1], 10);
  return fallbackSeason;
}

export async function parseSniplyoPlayerHtml(
  html: string,
  pageUrl: string,
  options: VodExtractionOptions = {}
): Promise<VodExtractionResult | null> {
  if (!html) return null;

  // 1. Single movie with direct file
  const fileMatch = html.match(SNIPLYO_FILE_RE);
  if (fileMatch && fileMatch[1]) {
    let fileUrl = fileMatch[1].trim();
    if (fileUrl.startsWith('//')) fileUrl = `https:${fileUrl}`;

    return {
      sources: [{
        title: 'Moviestape',
        url: fileUrl,
        mime: 'video/mp4',
        lazy: {
          cdn: 'sniplyo',
          type: 'vod',
          url: fileUrl,
          directUrl: fileUrl,
        },
      }],
    };
  }

  // 2. Playlist for serials / multivoice
  const plMatch = html.match(SNIPLYO_PL_RE);
  if (plMatch && plMatch[1]) {
    let plUrl = plMatch[1].trim();
    if (plUrl.startsWith('//')) plUrl = `https:${plUrl}`;
    if (!plUrl.startsWith('http')) {
      try {
        plUrl = new URL(plUrl, pageUrl).toString();
      } catch {
        plUrl = `https://sniplyo.online/${plUrl.replace(/^\/+/, '')}`;
      }
    }

    try {
      const plRes = await request<any>(plUrl, {
        signal: options.signal,
        headers: {
          'Referer': pageUrl,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...options.headers,
        },
      });

      let plData = plRes.data;
      if (typeof plData === 'string') {
        try {
          plData = JSON.parse(plData);
        } catch {
          return null;
        }
      }

      if (Array.isArray(plData) && plData.length > 0) {
        return parseSniplyoFolderTree(plData);
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function parseSniplyoFolderTree(items: any[]): VodExtractionResult | null {
  // If flat array of movie sources: [{ title, file }]
  if (items[0]?.file && !items[0]?.folder) {
    const sources: StreamSource[] = items.map((item) => ({
      title: item.title || 'Moviestape',
      url: item.file,
      mime: 'video/mp4',
      lazy: {
        cdn: 'sniplyo',
        type: 'vod',
        url: item.file,
        directUrl: item.file,
      },
    }));
    return { sources: sortSources(sources) };
  }

  const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

  const walk = (node: any, currentSeason: number, currentDub: string, depth = 0) => {
    if (!node) return;
    const titleStr = String(node.title || '').trim();

    let s = currentSeason;
    let dub = currentDub;

    const detectedSeason = parseSeasonNumber(titleStr, 0);
    if (detectedSeason > 0) {
      s = detectedSeason;
    } else if (titleStr && !node.file && Array.isArray(node.folder) && !/(?:серія|серiя|епізод|ep|e)/i.test(titleStr)) {
      dub = titleStr;
    }

    if (node.file && typeof node.file === 'string') {
      const epNum = parseEpisodeNumber(titleStr, 1);
      const effectiveSeason = s > 0 ? s : 1;

      if (!seasonsMap.has(effectiveSeason)) {
        seasonsMap.set(effectiveSeason, new Map());
      }
      const epMap = seasonsMap.get(effectiveSeason)!;

      if (!epMap.has(epNum)) {
        epMap.set(epNum, []);
      }

      epMap.get(epNum)!.push({
        title: dub || 'Moviestape',
        url: node.file,
        mime: 'video/mp4',
        lazy: {
          cdn: 'sniplyo',
          type: 'vod',
          url: node.file,
          directUrl: node.file,
        },
      });
    }

    if (Array.isArray(node.folder)) {
      node.folder.forEach((child: any, idx: number) => {
        walk(child, s > 0 ? s : (detectedSeason > 0 ? detectedSeason : idx + 1), dub, depth + 1);
      });
    }
  };

  items.forEach((item, idx) => {
    walk(item, idx + 1, '');
  });

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
