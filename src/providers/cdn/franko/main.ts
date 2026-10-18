import * as cheerio from 'cheerio';
import type {
  VodExtractionOptions,
  VodExtractionResult,
  VodExtractor,
} from '../../../types/vod.js';
import type { Episode, Season, StreamSource } from '../../../types/media.js';
import { httpRequest } from '../../../utils/http.js';
import { sortSeasons, sortSources } from '../../../utils/sort.js';
import {
  FRANKO_MIME,
  FRANKO_ORIGIN,
  FRANKO_QUALITY,
  FRANKO_REFERER,
  FRANKO_SHOW_ID_RE,
  FRANKO_SHOW_TIMEOUT,
  FRANKO_SOURCE_TITLE,
  FRANKO_TRANSLATION_TIMEOUT,
  FRANKO_UA,
} from './config.js';
import {
  buildFrankoEpisodeLazyUrl,
  buildFrankoMovieLazyUrl,
  frankoShowPageUrl,
  parseFrankoPlayerPayload,
  resolveFrankoFile,
  stripFrankoPoster,
} from './extract.js';
import type { FrankoTranslation } from './types.js';

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
            quality: FRANKO_QUALITY,
            title: FRANKO_SOURCE_TITLE,
            url: trimmed,
            mime: FRANKO_MIME,
            headers: {
              Origin: FRANKO_ORIGIN,
            },
          },
        ],
      };
    }

    // 2. Lazy stream route: /master.m3u8?cdn=franko&id=...&translation=...
    if (trimmed.includes('cdn=franko') || (trimmed.includes('/master.m3u8') && trimmed.includes('franko'))) {
      const urlObj = new URL(trimmed, 'http://localhost');
      const rawId = urlObj.searchParams.get('id') || '';
      let id = 0;
      let translation = parseInt(urlObj.searchParams.get('translation') || '0', 10);
      let season = urlObj.searchParams.get('season') ? parseInt(urlObj.searchParams.get('season')!, 10) : null;
      let episode = urlObj.searchParams.get('episode') ? parseInt(urlObj.searchParams.get('episode')!, 10) : null;

      if (rawId.includes('_')) {
        const parts = rawId.split('_').map(Number);
        if (parts.length >= 4) {
          id = parts[0];
          season = parts[1];
          episode = parts[2];
          translation = parts[3];
        } else if (parts.length === 2) {
          id = parts[0];
          translation = parts[1];
        }
      } else {
        id = parseInt(rawId || '0', 10);
      }

      if (id) {
        const file = await resolveFrankoFile(
          { id, translation: translation || undefined, season_number: season, episode_number: episode },
          options.signal
        );
        if (file) {
          return {
            sources: [
              {
                quality: FRANKO_QUALITY,
                title: FRANKO_SOURCE_TITLE,
                url: file,
                mime: FRANKO_MIME,
                headers: {
                  Origin: FRANKO_ORIGIN,
                },
              },
            ],
          };
        }
      }
      return null;
    }

    // 3. Resolve show ID or fetch player page
    let showId: number | null = null;
    let html = '';

    const showMatch = trimmed.match(FRANKO_SHOW_ID_RE);
    if (showMatch) {
      showId = parseInt(showMatch[1], 10);
    }

    if (
      (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
      !trimmed.includes('/master.m3u8') &&
      !trimmed.includes('localhost')
    ) {
      try {
        const res = await httpRequest<string>(trimmed, {
          headers: {
            'User-Agent': FRANKO_UA,
            Referer: FRANKO_REFERER,
          },
          signal: options.signal,
          timeout: FRANKO_SHOW_TIMEOUT,
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
    const payload = parseFrankoPlayerPayload(html);
    if (!payload) {
      return null;
    }

    const translations = payload.translations || [];
    const isSerial = Boolean(payload.is_serial);
    const poster = stripFrankoPoster(payload.cover_url);

    // A. Movie
    if (!isSerial) {
      const sources: StreamSource[] = [];

      for (const t of translations) {
        const title = t.title || 'Original';
        const lazyUrl = buildFrankoMovieLazyUrl(payload.id, t.id);

        let streamUrl = lazyUrl;
        if (options.prefetch) {
          const file = await resolveFrankoFile(
            { id: payload.id, translation: t.id, bootstrap_token: payload.player_files_token },
            options.signal
          );
          if (file) streamUrl = file;
        }

        sources.push({
          quality: FRANKO_QUALITY,
          title,
          audio: title,
          url: streamUrl,
          mime: FRANKO_MIME,
          poster,
          headers: {
            Origin: FRANKO_ORIGIN,
          },
          lazy: {
            cdn: 'franko',
            type: 'hls',
            id: `${payload.id}_${t.id}`,
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

    // If multiple translations exist, probe each translation page if payload.seasons_episodes doesn't cover all or if translations have different seasons
    type TranslationSeasonInfo = {
      translation: FrankoTranslation;
      seasonsEpisodes: Record<string, number[]>;
    };

    const translationInfoList: TranslationSeasonInfo[] = [];

    // For 1 translation, or if only 1 translation in payload:
    if (translations.length <= 1) {
      const se = payload.seasons_episodes || (payload.episodes ? { '1': payload.episodes } : {});
      if (translations[0]) {
        translationInfoList.push({
          translation: translations[0],
          seasonsEpisodes: se,
        });
      }
    } else {
      // Multiple translations: fetch /show/{id}/?translation={t.id} for translations to find their seasons
      await Promise.all(
        translations.map(async (t) => {
          // If translation is the one currently loaded in payload:
          if (t.id === payload.translate) {
            translationInfoList.push({
              translation: t,
              seasonsEpisodes: payload.seasons_episodes || (payload.episodes ? { [String(payload.season || 1)]: payload.episodes } : {}),
            });
            return;
          }

          try {
            const res = await httpRequest<string>(frankoShowPageUrl(payload.id, t.id), {
              headers: {
                'User-Agent': FRANKO_UA,
                Referer: FRANKO_REFERER,
              },
              signal: options.signal,
              timeout: FRANKO_TRANSLATION_TIMEOUT,
            });
            const subPayload = parseFrankoPlayerPayload(res.data);
            if (subPayload) {
              translationInfoList.push({
                translation: t,
                seasonsEpisodes: subPayload.seasons_episodes || (subPayload.episodes ? { [String(subPayload.season || 1)]: subPayload.episodes } : {}),
              });
              return;
            }
          } catch {
            // fallback to main payload
          }

          translationInfoList.push({
            translation: t,
            seasonsEpisodes: payload.seasons_episodes || (payload.episodes ? { '1': payload.episodes } : {}),
          });
        })
      );
    }

    // Populate seasonsMap strictly per translation's available seasons/episodes
    for (const info of translationInfoList) {
      const t = info.translation;
      const title = t.title || 'Original';
      const se = info.seasonsEpisodes;

      for (const sKey of Object.keys(se)) {
        const sNum = parseInt(sKey, 10);
        const epList = se[sKey] || [];

        let epMap = seasonsMap.get(sNum);
        if (!epMap) {
          epMap = new Map<number, StreamSource[]>();
          seasonsMap.set(sNum, epMap);
        }

        for (const epNum of epList) {
          const lazyUrl = buildFrankoEpisodeLazyUrl(payload.id, t.id, sNum, epNum);
          const currentSources = epMap.get(epNum) || [];

          currentSources.push({
            quality: FRANKO_QUALITY,
            title,
            audio: title,
            url: lazyUrl,
            mime: FRANKO_MIME,
            poster,
            headers: {
              Origin: FRANKO_ORIGIN,
            },
            lazy: {
              cdn: 'franko',
              type: 'hls',
              id: `${payload.id}_${sNum}_${epNum}_${t.id}`,
              url: lazyUrl,
            },
          });

          epMap.set(epNum, currentSources);
        }
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

export * from './config.js';
export * from './extract.js';
export type { FrankoFilesRequest, FrankoFilesResponse, FrankoPlayerPayload, FrankoTranslation } from './types.js';
