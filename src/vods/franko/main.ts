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
  FrankoTranslation,
} from './types.js';

/**
 * Отримує пряме M3U8 посилання з API Franko
 */
export async function resolveFrankoFile(
  req: FrankoFilesRequest,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    let token = req.bootstrap_token;
    let translation = req.translation;
    if (!token || !translation) {
      const pageUrl = `https://franko.uacdn.online/show/${req.id}/${translation ? `?translation=${translation}` : ''}`;
      const pageRes = await httpRequest<string>(pageUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          Referer: 'https://uakino.watch/',
        },
        signal,
        timeout: 10000,
      });
      const match = pageRes.data.match(/window\.__PLAYER_PAYLOAD__\s*=\s*(\{[\s\S]*?\});/);
      if (match) {
        try {
          const payload = JSON.parse(match[1]) as FrankoPlayerPayload;
          if (!token) token = payload.player_files_token;
          if (!translation && payload.translate) {
            translation = payload.translate;
          }
        } catch {}
      }
      if (!token) {
        const tokenMatch = pageRes.data.match(/"player_files_token"\s*:\s*"([^"]+)"/);
        if (tokenMatch) token = tokenMatch[1];
      }
    }

    const res = await httpRequest<FrankoFilesResponse>(
      'https://franko.uacdn.online/api/player/files',
      {
        method: 'POST',
        data: {
          id: req.id,
          translation: translation || 0,
          season_number: req.season_number ?? null,
          episode_number: req.episode_number ?? null,
          force_cdn: req.force_cdn || '',
          turnstile_token: req.turnstile_token || '',
          bootstrap_token: token || '',
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
            title: 'Franko',
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
                quality: '1080p',
                title: 'Franko',
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
      return null;
    }

    // 3. Resolve show ID or fetch player page
    let showId: number | null = null;
    let html = '';

    const showMatch = trimmed.match(/franko\.uacdn\.online\/show\/(\d+)/);
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
            { id: payload.id, translation: t.id, bootstrap_token: payload.player_files_token },
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
            const tUrl = `https://franko.uacdn.online/show/${payload.id}/?translation=${t.id}`;
            const res = await httpRequest<string>(tUrl, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                Referer: 'https://uakino.watch/',
              },
              signal: options.signal,
              timeout: 5000,
            });
            const match = res.data.match(/window\.__PLAYER_PAYLOAD__\s*=\s*(\{[\s\S]*?\});/);
            if (match) {
              const subPayload = JSON.parse(match[1]);
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
          const lazyUrl = `/master.m3u8?cdn=franko&id=${payload.id}&translation=${t.id}&season=${sNum}&episode=${epNum}`;
          const currentSources = epMap.get(epNum) || [];

          currentSources.push({
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
