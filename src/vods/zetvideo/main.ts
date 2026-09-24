import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../types/vod.js';
import type { Episode, Season, StreamSource } from '../../types/media.js';
import { getHtml } from '../../utils/http.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import { parsePlayerjsSubtitles } from '../../utils/playerjs.js';

export const parseZetVideoSubtitles = parsePlayerjsSubtitles;

export class ZetVideoVodExtractor implements VodExtractor {
  readonly name = 'zetvideo';

  /**
   * Extracts media streams from ZetVideo player or iframe URL
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Support lazy routes like /master.m3u8?cdn=zetvideo&type=vod&id=123
    if (targetUrl.includes('cdn=zetvideo') || (targetUrl.includes('/master.m3u8') && targetUrl.includes('zetvideo'))) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const id = parsed.searchParams.get('id');
          const type = parsed.searchParams.get('type') || 'vod';
          if (id) {
            targetUrl = `https://zetvideo.net/${type}/${id}`;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    }

    if (targetUrl.includes('.m3u8') && !targetUrl.includes('/master.m3u8')) {
      return {
        sources: [{
          title: 'ZetVideo',
          url: targetUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    try {
      const html = await getHtml(targetUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || 'https://uafix.net/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...options.headers,
        },
      });

      return this.parsePlayerHtml(html, targetUrl);
    } catch {
      return null;
    }
  }

  /**
   * Parses HTML of ZetVideo Playerjs page
   */
  parsePlayerHtml(html: string, _pageUrl: string): VodExtractionResult | null {
    if (!html) return null;

    const posterMatch = html.match(/poster\s*:\s*["']([^"']+)["']/);
    const poster = posterMatch ? posterMatch[1].replace(/\\\//g, '/') : null;

    const subMatch = html.match(/subtitle\s*:\s*["']([^"']+)["']/);
    const subtitles = subMatch ? parseZetVideoSubtitles(subMatch[1]) : [];

    // Playerjs file extraction: can be file:"https://..." or file:'[{"title":...}]' or in new Playerjs({...})
    let fileContent: string | null = null;

    const fileMatch = html.match(/file\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
    if (fileMatch && fileMatch[2]) {
      fileContent = fileMatch[2];
    } else {
      // Check if inside new Playerjs({ ... })
      const pjsMatch = html.match(/new\s+Playerjs\s*\(\s*(\{[\s\S]*?\})\s*\)/);
      if (pjsMatch) {
        try {
          const parsedConfig = JSON.parse(pjsMatch[1]);
          if (parsedConfig.file) {
            fileContent = typeof parsedConfig.file === 'string' ? parsedConfig.file : JSON.stringify(parsedConfig.file);
          }
        } catch {
          // not strictly valid JSON, fallback
        }
      }
    }

    if (!fileContent) return null;

    // Clean escaped slashes
    let cleanedFile = fileContent.replace(/\\\//g, '/');

    // Direct m3u8 / mp4 URL
    if (/^https?:\/\//i.test(cleanedFile.trim())) {
      return {
        sources: [{
          title: 'ZetVideo',
          url: cleanedFile.trim(),
          mime: 'application/x-mpegURL',
          poster: poster || undefined,
          subtitles,
        }],
      };
    }

    // Try parsing as JSON playlist / tree
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleanedFile);
    } catch {
      // If escaping was broken or double-stringified
      try {
        cleanedFile = cleanedFile.replace(/\\'/g, "'").replace(/\\"/g, '"');
        parsed = JSON.parse(cleanedFile);
      } catch {
        return null;
      }
    }

    // If array of dubs for single movie
    if (Array.isArray(parsed) && parsed[0]?.file && !parsed[0]?.folder) {
      const sources: StreamSource[] = parsed.map(item => ({
        title: item.title?.trim() || 'ZetVideo',
        url: item.file?.replace(/\\\//g, '/'),
        mime: 'application/x-mpegURL',
        poster: item.poster ? item.poster.replace(/\\\//g, '/') : (poster || undefined),
        subtitles: item.subtitle ? parseZetVideoSubtitles(item.subtitle) : subtitles,
      }));

      return { sources: sortSources(sources) };
    }

    // Serial tree walk
    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

    const walk = (node: any, ctx: { dub?: string; season?: number; episode?: number }) => {
      if (!node) return;
      const currentCtx = { ...ctx };

      const titleStr = String(node.title || '').trim();

      const sMatch = titleStr.match(/(?:сезон|season)\s*(\d+)/i);
      if (sMatch) {
        currentCtx.season = parseInt(sMatch[1], 10);
      }

      const eMatch = titleStr.match(/(?:серія|серiя|episode|ep|e)\s*(\d+)/i);
      if (eMatch) {
        currentCtx.episode = parseInt(eMatch[1], 10);
      }

      // If it's a dub folder (has children but neither season nor episode in title)
      if (titleStr && !sMatch && !eMatch && !currentCtx.dub && Array.isArray(node.folder)) {
        currentCtx.dub = titleStr;
      }

      if (node.file && typeof node.file === 'string') {
        const s = currentCtx.season || 1;
        const e = currentCtx.episode || 1;
        const dubTitle = currentCtx.dub || titleStr || 'ZetVideo';

        if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
        const epMap = seasonsMap.get(s)!;

        if (!epMap.has(e)) epMap.set(e, []);
        epMap.get(e)!.push({
          title: dubTitle,
          url: node.file.replace(/\\\//g, '/'),
          mime: 'application/x-mpegURL',
          poster: node.poster ? node.poster.replace(/\\\//g, '/') : (poster || undefined),
          subtitles: node.subtitle ? parseZetVideoSubtitles(node.subtitle) : subtitles,
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
}

export const zetvideoVod = new ZetVideoVodExtractor();
