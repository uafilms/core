import * as cheerio from 'cheerio';
import type {
  VodExtractionOptions,
  VodExtractionResult,
  VodExtractor,
} from '../../types/vod.js';
import type { Episode, Season, StreamSource } from '../../types/media.js';
import { httpRequest } from '../../utils/http.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import type {
  FrankoFilesRequest,
  FrankoFilesResponse,
  FrankoPlayerPayload,
} from './types.js';

/**
 * Отримує пряме M3U8 посилання з API Franko
 */
export async function resolveFrankoFile(
  req: FrankoFilesRequest,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await httpRequest<FrankoFilesResponse>(
      'https://franko.uacdn.online/api/player/files',
      {
        method: 'POST',
        data: {
          id: req.id,
          translation: req.translation,
          season_number: req.season_number ?? null,
          episode_number: req.episode_number ?? null,
          force_cdn: req.force_cdn || '',
          turnstile_token: req.turnstile_token || '',
        },
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          Referer: `https://franko.uacdn.online/show/${req.id}/`,
          Origin: 'https://franko.uacdn.online',
        },
        signal,
        timeout: 10000,
      }
    );
    return res.data?.file || null;
  } catch {
    return null;
  }
}

export class FrankoVodExtractor implements VodExtractor {
  readonly name = 'franko';

  async extract(
    urlOrContent: string,
    options: VodExtractionOptions = {}
  ): Promise<VodExtractionResult | null> {
    if (!urlOrContent) return null;

    const trimmed = urlOrContent.trim();

    // 1. Direct HLS stream from factorios or franko CDN
    if (
      (trimmed.includes('factorios.live') || trimmed.includes('uacdn.online')) &&
      trimmed.includes('.m3u8')
    ) {
      return {
        sources: [
          {
            quality: '1080p',
            title: 'Franko CDN',
            url: trimmed,
            mime: 'application/x-mpegURL',
            headers: {
              Origin: 'https://franko.uacdn.online',
            },
          },
        ],
      };
    }

    // 2. Lazy stream route: /master.m3u8?cdn=franko&id=...&translation=...
    if (trimmed.includes('cdn=franko') || (trimmed.startsWith('/master.m3u8') && trimmed.includes('franko'))) {
      const urlObj = new URL(trimmed, 'http://localhost');
      const id = parseInt(urlObj.searchParams.get('id') || '0', 10);
      const translation = parseInt(urlObj.searchParams.get('translation') || '0', 10);
      const season = urlObj.searchParams.get('season') ? parseInt(urlObj.searchParams.get('season')!, 10) : null;
      const episode = urlObj.searchParams.get('episode') ? parseInt(urlObj.searchParams.get('episode')!, 10) : null;

      if (id && translation) {
        const file = await resolveFrankoFile(
          { id, translation, season_number: season, episode_number: episode },
          options.signal
        );
        if (file) {
          return {
            sources: [
              {
                quality: '1080p',
                title: 'Franko CDN',
                url: file,
                mime: 'application/x-mpegURL',
                headers: {
                  Origin: 'https://franko.uacdn.online',
                },
              },
            ],
          };
        }
      }
    }

    // 3. Resolve show ID or fetch player page
    let showId: number | null = null;
    let html = '';

    const showMatch = trimmed.match(/franko\.uacdn\.online\/show\/(\d+)/);
    if (showMatch) {
      showId = parseInt(showMatch[1], 10);
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const res = await httpRequest<string>(trimmed, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            Referer: 'https://uakino.watch/',
          },
          signal: options.signal,
          timeout: 10000,
        });
        html = res.data;
      } catch {
        return null;
      }
    } else {
      html = trimmed;
    }

    // Check if HTML contains an iframe to Franko
    if (!html.includes('__PLAYER_PAYLOAD__')) {
      const $ = cheerio.load(html);
      const iframeSrc = $('iframe[src*="franko.uacdn.online"]').attr('src');
      if (iframeSrc) {
        return this.extract(iframeSrc, options);
      }
    }

    // 4. Extract window.__PLAYER_PAYLOAD__
    const payloadMatch = html.match(/window\.__PLAYER_PAYLOAD__\s*=\s*(\{[\s\S]*?\});/);
    if (!payloadMatch) {
      return null;
    }

    let payload: FrankoPlayerPayload;
    try {
      payload = JSON.parse(payloadMatch[1]);
    } catch {
      return null;
    }

    const translations = payload.translations || [];
    const isSerial = Boolean(payload.is_serial);
    const poster = payload.cover_url?.replace(/@h\d+/, '') || undefined;

    // A. Movie
    if (!isSerial) {
      const sources: StreamSource[] = [];

      for (const t of translations) {
        const title = t.title || 'Original';
        const lazyUrl = `/master.m3u8?cdn=franko&id=${payload.id}&translation=${t.id}`;

        let streamUrl = lazyUrl;
        if (options.prefetch) {
          const file = await resolveFrankoFile(
            { id: payload.id, translation: t.id },
            options.signal
          );
          if (file) streamUrl = file;
        }

        sources.push({
          quality: '1080p',
          title,
          audio: title,
          url: streamUrl,
          mime: 'application/x-mpegURL',
          poster,
          headers: {
            Origin: 'https://franko.uacdn.online',
          },
          lazy: {
            cdn: 'franko',
            type: 'hls',
            id: String(payload.id),
            url: lazyUrl,
          },
        });
      }

      return {
        sources: sortSources(sources),
      };
    }

    // B. Series
    const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

    // Structure of seasons_episodes: { "1": [1, 2, 3, ...], "2": [...] }
    const seasonsEpisodes = payload.seasons_episodes || {};
    const seasonsKeys = Object.keys(seasonsEpisodes);

    if (seasonsKeys.length > 0) {
      for (const sKey of seasonsKeys) {
        const sNum = parseInt(sKey, 10);
        const epList = seasonsEpisodes[sKey] || [];

        let epMap = seasonsMap.get(sNum);
        if (!epMap) {
          epMap = new Map<number, StreamSource[]>();
          seasonsMap.set(sNum, epMap);
        }

        for (const epNum of epList) {
          const sourcesForEp: StreamSource[] = [];

          for (const t of translations) {
            const title = t.title || 'Original';
            const lazyUrl = `/master.m3u8?cdn=franko&id=${payload.id}&translation=${t.id}&season=${sNum}&episode=${epNum}`;

            sourcesForEp.push({
              quality: '1080p',
              title,
              audio: title,
              url: lazyUrl,
              mime: 'application/x-mpegURL',
              poster,
              headers: {
                Origin: 'https://franko.uacdn.online',
              },
              lazy: {
                cdn: 'franko',
                type: 'hls',
                id: `${payload.id}_${sNum}_${epNum}_${t.id}`,
                url: lazyUrl,
              },
            });
          }

          epMap.set(epNum, sortSources(sourcesForEp));
        }
      }
    } else if (payload.episodes && payload.episodes.length > 0) {
      // Single season fallback
      const sNum = 1;
      const epMap = new Map<number, StreamSource[]>();
      seasonsMap.set(sNum, epMap);

      for (const epNum of payload.episodes) {
        const sourcesForEp: StreamSource[] = [];
        for (const t of translations) {
          const title = t.title || 'Original';
          const lazyUrl = `/master.m3u8?cdn=franko&id=${payload.id}&translation=${t.id}&season=${sNum}&episode=${epNum}`;

          sourcesForEp.push({
            quality: '1080p',
            title,
            audio: title,
            url: lazyUrl,
            mime: 'application/x-mpegURL',
            poster,
            headers: {
              Origin: 'https://franko.uacdn.online',
            },
            lazy: {
              cdn: 'franko',
              type: 'hls',
              id: `${payload.id}_${sNum}_${epNum}_${t.id}`,
              url: lazyUrl,
            },
          });
        }
        epMap.set(epNum, sortSources(sourcesForEp));
      }
    }

    const seasons: Season[] = [];
    for (const [sNum, epMap] of seasonsMap.entries()) {
      const episodes: Episode[] = [];
      for (const [epNum, sources] of epMap.entries()) {
        episodes.push({
          episode: epNum,
          sources,
        });
      }
      episodes.sort((a, b) => a.episode - b.episode);
      seasons.push({
        season: sNum,
        episodes,
      });
    }

    return {
      seasons: sortSeasons(seasons),
    };
  }
}

export const frankoVod = new FrankoVodExtractor();
