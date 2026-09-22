import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../types/vod.js';
import type { Episode, Season, StreamSource } from '../../types/media.js';
import { getHtml } from '../../utils/http.js';
import { decodeTortuga } from './decrypt.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';

export class TortugaVodExtractor implements VodExtractor {
  readonly name = 'tortuga';

  /**
   * Головний метод витягування потоків з Tortuga VOD / Embed сторінок
   */
  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    if (!url) return null;

    let targetUrl = url;

    // Підтримка lazy routes вигляду /master.m3u8?cdn=tortuga&type=vod&id=123
    if (targetUrl.includes('cdn=tortuga')) {
      try {
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const id = parsed.searchParams.get('id');
        const type = parsed.searchParams.get('type') || 'vod';
        if (id) {
          targetUrl = `https://tortuga.tw/${type}/${id}`;
        }
      } catch {
        // ігноруємо помилку парсингу URL
      }
    }

    // Якщо це прямий m3u8
    if (targetUrl.includes('.m3u8')) {
      return {
        sources: [{
          title: 'Tortuga',
          url: targetUrl,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    // Якщо це /vod/ (фільм)
    if (targetUrl.includes('/vod/')) {
      const vod = await this.parseVod(targetUrl, options);
      if (!vod || !vod.file) return null;

      return {
        sources: [{
          title: 'Tortuga',
          url: vod.file,
          poster: vod.poster,
          mime: 'application/x-mpegURL',
        }],
      };
    }

    // Якщо це /embed/ (серіал)
    if (targetUrl.includes('/embed/')) {
      const embedSeasons = await this.parseEmbed(targetUrl, options);
      if (!embedSeasons || embedSeasons.length === 0) return null;
      return { seasons: sortSeasons(embedSeasons) };
    }

    return null;
  }

  /**
   * Парсинг фільму (/vod/)
   */
  async parseVod(vodUrl: string, options: VodExtractionOptions = {}): Promise<{ file: string; poster?: string | null } | null> {
    try {
      const html = await getHtml(vodUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || 'https://tortuga.tw/',
          ...options.headers,
        },
      });

      const fileMatch = html.match(/file\s*:\s*["']([A-Za-z0-9+/=]+)["']/);
      if (!fileMatch) return null;

      const file = decodeTortuga(fileMatch[1]);
      if (!file) return null;

      const posterMatch = html.match(/poster\s*:\s*["']([A-Za-z0-9+/=]+)["']/);
      const poster = posterMatch ? decodeTortuga(posterMatch[1]) : null;

      return { file, poster };
    } catch {
      return null;
    }
  }

  /**
   * Парсинг серіалу (/embed/)
   */
  async parseEmbed(embedUrl: string, options: VodExtractionOptions = {}): Promise<Season[] | null> {
    try {
      const html = await getHtml(embedUrl, {
        signal: options.signal,
        headers: {
          'Referer': options.referer || 'https://tortuga.tw/',
          ...options.headers,
        },
      });

      const fileMatch = html.match(/file\s*:\s*["']([A-Za-z0-9+/=]{20,})["']/);
      if (!fileMatch) return null;

      const decoded = decodeTortuga(fileMatch[1]);
      if (!decoded) return null;

      const json = JSON.parse(decoded);
      if (!Array.isArray(json)) return null;

      const seasons: Season[] = [];

      for (let sIdx = 0; sIdx < json.length; sIdx++) {
        const rawSeason = json[sIdx];
        const seasonNum = parseInt(rawSeason.title?.match(/\d+/)?.[0] || String(sIdx + 1), 10);
        const episodes: Episode[] = [];

        if (Array.isArray(rawSeason.folder)) {
          for (let eIdx = 0; eIdx < rawSeason.folder.length; eIdx++) {
            const rawEp = rawSeason.folder[eIdx];
            const epNum = parseInt(rawEp.title?.match(/\d+/)?.[0] || String(eIdx + 1), 10);
            const sources: StreamSource[] = [];

            if (Array.isArray(rawEp.folder)) {
              for (const dub of rawEp.folder) {
                if (dub.file) {
                  sources.push({
                    title: dub.title || 'Tortuga',
                    url: dub.file,
                    mime: 'application/x-mpegURL',
                    poster: dub.poster || null,
                  });
                }
              }
            } else if (rawEp.file) {
              sources.push({
                title: rawEp.title || 'Tortuga',
                url: rawEp.file,
                mime: 'application/x-mpegURL',
              });
            }

            if (sources.length > 0) {
              episodes.push({
                episode: epNum,
                title: rawEp.title,
                sources: sortSources(sources),
              });
            }
          }
        }

        if (episodes.length > 0) {
          seasons.push({
            season: seasonNum,
            episodes,
          });
        }
      }

      return sortSeasons(seasons);
    } catch {
      return null;
    }
  }
}

export const tortugaVod = new TortugaVodExtractor();
export { decodeTortuga };
