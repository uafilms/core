import type { Episode, Season, StreamSource } from '../../../types/media.js';
import type { VodExtractionOptions } from '../../../types/vod.js';
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

/** Парсинг фільму (/vod/). */
export async function parseTortugaVod(
  vodUrl: string,
  options: VodExtractionOptions = {},
): Promise<{ file: string; poster?: string | null; subtitle?: string | null } | null> {
  try {
    const html = await fetchTortugaHtml(vodUrl, options);

    const fileMatch = html.match(TORTUGA_VOD_FILE_RE);
    if (!fileMatch) return null;

    const file = decodeTortuga(fileMatch[1]);
    if (!file) return null;

    const posterMatch = html.match(TORTUGA_POSTER_RE);
    const poster = posterMatch ? decodeTortuga(posterMatch[1]) : null;

    const subMatch = html.match(TORTUGA_SUBTITLE_ENCODED_RE);
    const decodedSub = subMatch ? decodeTortuga(subMatch[1]) : null;
    const rawSubMatch = !decodedSub ? html.match(TORTUGA_SUBTITLE_PLAIN_RE) : null;
    const subString = decodedSub || (rawSubMatch ? rawSubMatch[1] : null);

    return { file, poster, subtitle: subString };
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

    const fileMatch = html.match(TORTUGA_EMBED_FILE_RE);
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
                const subStr = dub.subtitle ? (decodeTortuga(dub.subtitle) || dub.subtitle) : undefined;
                sources.push({
                  title: dub.title || 'Tortuga',
                  url: dub.file,
                  mime: 'application/x-mpegURL',
                  poster: dub.poster || null,
                  subtitles: subStr ? parsePlayerjsSubtitles(subStr) : undefined,
                });
              }
            }
          } else if (rawEp.file) {
            const subStr = rawEp.subtitle ? (decodeTortuga(rawEp.subtitle) || rawEp.subtitle) : undefined;
            sources.push({
              title: rawEp.title || 'Tortuga',
              url: rawEp.file,
              mime: 'application/x-mpegURL',
              subtitles: subStr ? parsePlayerjsSubtitles(subStr) : undefined,
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
