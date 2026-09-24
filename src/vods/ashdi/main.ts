import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../types/vod.js';
import type { Episode, Season, StreamSource } from '../../types/media.js';
import { getHtml } from '../../utils/http.js';
import { normalizeAshdiUrl, parseAshdiSubtitles } from './decrypt.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';

export class AshdiVodExtractor implements VodExtractor {
  readonly name = 'ashdi';

  /**
   * Витягує медіа-потоки з посилання на Ashdi плеєр або iframe
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes вигляду /master.m3u8?cdn=ashdi&type=vod&id=123
    if (targetUrl.includes('cdn=ashdi') || targetUrl.includes('/master.m3u8')) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const innerUrl = parsed.searchParams.get('url');
        if (innerUrl) {
          targetUrl = decodeURIComponent(innerUrl);
        } else {
          const id = parsed.searchParams.get('id');
          const type = parsed.searchParams.get('type') || 'vod';
          if (id) {
            targetUrl = `https://ashdi.vip/${type}/${id}`;
          }
        }
      } catch {
        // ігноруємо помилку парсингу URL
      }
    }

    const normalizedUrl = normalizeAshdiUrl(targetUrl);

    if (normalizedUrl.includes('.m3u8') && !normalizedUrl.includes('/master.m3u8')) {
      return {
        sources: [{
          title: 'Ashdi',
          url: normalizedUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    try {
      let fetchUrl = normalizedUrl;
      try {
        const u = new URL(fetchUrl.startsWith('http') ? fetchUrl : `https://${fetchUrl}`);
        if (/\/serial\/\d+/i.test(u.pathname)) {
          u.searchParams.delete('season');
          u.searchParams.delete('episode');
          if (!u.searchParams.has('multivoice')) {
            u.searchParams.set('multivoice', '');
          }
          fetchUrl = u.toString().replace(/multivoice=(&|$)/, 'multivoice$1').replace(/\?$/, '');
        } else if (/\/vod\/\d+/i.test(u.pathname) && !u.searchParams.has('multivoice')) {
          u.searchParams.set('multivoice', '');
          fetchUrl = u.toString().replace(/multivoice=(&|$)/, 'multivoice$1').replace(/\?$/, '');
        }
      } catch {
        if (/\/vod\/\d+/i.test(fetchUrl) && !fetchUrl.includes('multivoice')) {
          fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'multivoice';
        }
      }

      const html = await getHtml(fetchUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || 'https://ashdi.vip/',
          ...options.headers,
        },
      });

      return this.parsePlayerHtml(html, normalizedUrl);
    } catch {
      return null;
    }
  }

  /**
   * Парсинг HTML сторінки плеєра Ashdi
   */
  parsePlayerHtml(html: string, pageUrl: string): VodExtractionResult | null {
    const posterMatch = html.match(/poster\s*:\s*["']([^"']+)["']/);
    const poster = posterMatch ? normalizeAshdiUrl(posterMatch[1]) : null;

    const subMatch = html.match(/subtitle\s*:\s*['"]([^'"]+)['"]/);
    const subtitles = subMatch ? parseAshdiSubtitles(subMatch[1]) : [];

    let rawMatch = html.match(/file\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
    if (!rawMatch) {
      const arrMatch = html.match(/file\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (arrMatch) rawMatch = [arrMatch[0], '', arrMatch[1]];
    }
    if (!rawMatch) {
      const objMatch = html.match(/file\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
      if (objMatch) rawMatch = [objMatch[0], '', objMatch[1]];
    }

    if (!rawMatch || !rawMatch[2]) return null;

    let raw = rawMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"');

    // Якщо це прямий лінк
    if (/^https?:\/\//i.test(raw)) {
      return {
        sources: [{
          title: 'Ashdi',
          url: normalizeAshdiUrl(raw),
          mime: 'application/x-mpegURL',
          poster,
          subtitles,
        }],
      };
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    // Якщо це масив озвучок фільму: [{ title: '...', file: '...' }]
    if (Array.isArray(parsed) && parsed[0]?.file && !parsed[0]?.folder) {
      const sources: StreamSource[] = parsed.map(item => ({
        title: item.title || 'Ashdi',
        url: normalizeAshdiUrl(item.file),
        mime: 'application/x-mpegURL',
        poster: item.poster ? normalizeAshdiUrl(item.poster) : poster,
        subtitles: item.subtitle ? parseAshdiSubtitles(item.subtitle) : subtitles,
      }));

      return { sources: sortSources(sources) };
    }

    // Якщо це структура серіалу (folder / nested)
    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

    const walk = (node: any, ctx: { dub?: string; season?: number; episode?: number }) => {
      if (!node) return;
      const currentCtx = { ...ctx };

      if (node.title && !currentCtx.dub) {
        currentCtx.dub = String(node.title).trim();
      }

      const sMatch = String(node.title || '').match(/(?:сезон|season)\s*(\d+)/i);
      if (sMatch) currentCtx.season = parseInt(sMatch[1], 10);

      const eMatch = String(node.title || '').match(/(?:серія|серiя|episode|ep|e)\s*(\d+)/i);
      if (eMatch) currentCtx.episode = parseInt(eMatch[1], 10);

      if (node.file && typeof node.file === 'string') {
        const s = currentCtx.season || 1;
        const e = currentCtx.episode || 1;
        const dubTitle = currentCtx.dub || node.title || 'Ashdi';

        if (!seasonsMap.has(s)) seasonsMap.set(s, new Map());
        const epMap = seasonsMap.get(s)!;

        if (!epMap.has(e)) epMap.set(e, []);
        epMap.get(e)!.push({
          title: dubTitle,
          url: normalizeAshdiUrl(node.file),
          mime: 'application/x-mpegURL',
          poster: node.poster ? normalizeAshdiUrl(node.poster) : poster,
          subtitles: node.subtitle ? parseAshdiSubtitles(node.subtitle) : subtitles,
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

export const ashdiVod = new AshdiVodExtractor();
