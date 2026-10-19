import { randomUUID } from 'node:crypto';
import type { MediaMetadata, MediaType, StreamSource } from '../../types/media.js';
import type { OmssSource, OmssSubtitle, OmssDiagnostic, PlatformType, OmssQuality, OmssVideoType } from '../types.js';
import { providers } from '../../providers/index.js';
import { extractVod } from '../../providers/cdn/index.js';
import { detectCdn } from '../../utils/cdn.js';
import { isSearchResultMatch, rankSearchResults } from '../../utils/sort.js';
import { cleanStudioName, detectAudioLang, resolveStudioInfo } from '../../utils/studio.js';
import { omssSourceResolutionCache, mediaParsedTimestampCache } from '../services/cache.js';
import { runWithProvider } from '../../utils/proxyManager.js';

interface OrchestratorOptions {
  meta: MediaMetadata;
  type: MediaType;
  season?: number;
  episode?: number;
  providerId?: string;
  platform?: PlatformType;
  proxyHost: string;
  onProviderResult?: (chunk: {
    provider: string;
    providerName?: string;
    sources: OmssSource[];
    subtitles: OmssSubtitle[];
    /** true = прибрати у клієнта джерела цього провайдера (CDN витіснив вищий пріоритет) */
    removed?: boolean;
  }) => void;
}

function normalizeQuality(q?: string): OmssQuality {
  if (!q) return 'Auto';
  const clean = q.toLowerCase();
  if (clean.includes('4k') || clean.includes('2160')) return '4K';
  if (clean.includes('1440') || clean.includes('qhd')) return 'QHD';
  if (clean.includes('1080') || clean.includes('fhd')) return 'FHD';
  if (clean.includes('720') || clean.includes('hd')) return 'HD';
  if (clean.includes('480') || clean.includes('360') || clean.includes('sd')) return 'SD';
  return 'Auto';
}

function inferType(url: string, mime?: string): OmssVideoType {
  if (mime?.includes('mpegURL') || url.includes('.m3u8') || url.includes('master.m3u8')) return 'hls';
  if (mime?.includes('mp4') || url.includes('.mp4')) return 'mp4';
  if (mime?.includes('mkv') || url.includes('.mkv')) return 'mkv';
  if (mime?.includes('dash') || url.includes('.mpd')) return 'dash';
  return 'hls';
}

export class OrchestratorService {
  static async resolveSources(options: OrchestratorOptions): Promise<{
    sources: OmssSource[];
    subtitles: OmssSubtitle[];
    diagnostics: OmssDiagnostic[];
  }> {
    const { meta, type, season = 1, episode = 1, providerId, platform = 'web', proxyHost, onProviderResult } = options;

    const mediaKey = meta.imdbId || meta.id || meta.title;
    const cacheKey = `orchestrator:${mediaKey}:${type}:${season}:${episode}:${providerId || 'all'}:${platform}:${proxyHost}`;

    // 24h caching for source resolution (when not streaming SSE or as baseline)
    if (!onProviderResult) {
      const cached = omssSourceResolutionCache.get<{
        sources: OmssSource[];
        subtitles: OmssSubtitle[];
        diagnostics: OmssDiagnostic[];
      }>(cacheKey);

      if (cached) {
        return cached;
      }
    } else {
      // If SSE requested and cached, emit cached items directly
      const cached = omssSourceResolutionCache.get<{
        sources: OmssSource[];
        subtitles: OmssSubtitle[];
        diagnostics: OmssDiagnostic[];
      }>(cacheKey);

      if (cached && cached.sources.length > 0) {
        const cdnGroups = new Map<string, { id: string; name: string; sources: OmssSource[]; subtitles: OmssSubtitle[] }>();
        for (const s of cached.sources) {
          const key = s.provider.id;
          if (!cdnGroups.has(key)) {
            cdnGroups.set(key, { id: key, name: s.provider.name, sources: [], subtitles: [] });
          }
          cdnGroups.get(key)!.sources.push(s);
        }
        for (const sub of cached.subtitles) {
          const key = sub.provider.id;
          if (!cdnGroups.has(key)) {
            cdnGroups.set(key, { id: key, name: sub.provider.name, sources: [], subtitles: [] });
          }
          cdnGroups.get(key)!.subtitles.push(sub);
        }
        for (const group of cdnGroups.values()) {
          onProviderResult({
            provider: group.id,
            providerName: group.name,
            sources: group.sources,
            subtitles: group.subtitles,
          });
        }
        return cached;
      }
    }

    let targetProviders = providers;
    if (providerId) {
      targetProviders = providers.filter(p => p.name.toLowerCase() === providerId.toLowerCase());
      if (targetProviders.length === 0) {
        throw new Error(`PROVIDER_NOT_FOUND: ${providerId}`);
      }
    } else {
      // Exclude anime-specific providers if media is definitively not anime
      const animeSpecificProviders = new Set(['animeon', 'aniworld', 'mikai']);
      const isAnime = meta.isAnime ?? (
        meta.originalLanguage === 'ja' ||
        meta.genres?.some(g => g.toLowerCase().includes('аніме'))
      );

      if (!isAnime) {
        targetProviders = providers.filter(p => !animeSpecificProviders.has(p.name.toLowerCase()));
      }
    }

    const sources: OmssSource[] = [];
    const subtitles: OmssSubtitle[] = [];
    const diagnostics: OmssDiagnostic[] = [];
    const seenSourceUrls = new Set<string>();
    const seenSubtitleUrls = new Set<string>();
    const claimedCdns = new Set<string>();
    // cdn.id → індекс провайдера, який зараз володіє джерелами цього CDN.
    // Пріоритет = порядок у providers[]; провайдер з меншим індексом витісняє
    // уже віддані джерела провайдера з більшим індексом (див. нижче).
    const claimedCdnOwner = new Map<string, number>();
    // CDN-и, які вже поїхали стримінговому клієнту: повторно (і з подією removed)
    // їх не надсилаємо — клієнт лишається з тим провайдером, що завершився першим.
    const emittedCdns = new Set<string>();

    // Run providers in parallel with individual error catching
    const tasks = targetProviders.map(async (provider, providerIndex) => {
      return runWithProvider(provider.name, async () => {
        try {
          const searchOptions = {
            meta,
            year: meta.year,
            type,
            season,
            episode,
          };
          const query = meta.imdbId || meta.title;
          let searchResults = await provider.search(query, searchOptions);

          // If no results by IMDb ID, fallback to title
          if ((!searchResults || searchResults.length === 0) && meta.title && meta.imdbId) {
            searchResults = await provider.search(meta.title, searchOptions);
          }

          // If still no results, fallback to original title if available
          if ((!searchResults || searchResults.length === 0) && meta.originalTitle && meta.originalTitle !== meta.title) {
            searchResults = await provider.search(meta.originalTitle, searchOptions);
          }

          if (!searchResults || searchResults.length === 0) {
            return;
          }

          // Find candidate that best matches meta (taking season and year into account)
          let target: typeof searchResults[0] | null = null;

          if (meta.title) {
            const ranked = rankSearchResults(searchResults, meta.title, meta.year, meta.type, season);
            if (ranked.length > 0) {
              target = ranked[0];
            }
          }

          if (!target && meta.originalTitle) {
            const ranked = rankSearchResults(searchResults, meta.originalTitle, meta.year, meta.type, season);
            if (ranked.length > 0) {
              target = ranked[0];
            }
          }

          if (!target) {
            target = searchResults.find(r =>
              (meta.title && isSearchResultMatch(r, meta.title, meta.year, meta.type, 50, season)) ||
              (meta.originalTitle && isSearchResultMatch(r, meta.originalTitle, meta.year, meta.type, 50, season))
            ) || null;
          }

          if (!target) {
            return;
          }
          const res = await provider.get(target, { meta, season, episode });
          if (!res) return;

          let rawSources: StreamSource[] = [];

          if (type === 'movie') {
            rawSources = res.sources || [];
          } else {
            const s = res.seasons?.find(sn => sn.season === season);
            const ep = s?.episodes?.find(e => e.episode === episode);
            rawSources = ep?.sources || [];
          }

          // Group this provider's sources per CDN so a CDN is claimed as a whole
          const providerGroups = new Map<string, { id: string; name: string; sources: OmssSource[]; subtitles: OmssSubtitle[] }>();

        for (const raw of rawSources) {
          let playUrl = raw.url;
          let reqHeaders = raw.headers;

          // Normalize lazy metadata if raw source has direct or proxy URL pointing to known CDNs
          let lazy = raw.lazy;
          if (!lazy) {
            const checkUrl = raw.url;
            const match = checkUrl.match(/(?:zetvideo\.net|ashdi\.vip)\/(vod|embed|serial)\/([a-zA-Z0-9_-]+)/i);
            if (match) {
              const matchedCdn = checkUrl.includes('zetvideo.net') ? 'zetvideo' : 'ashdi';
              const matchedType = match[1].toLowerCase() as 'vod' | 'embed' | 'serial';
              const matchedId = match[2];
              lazy = {
                cdn: matchedCdn,
                type: matchedType,
                id: matchedId,
                url: `/master.m3u8?cdn=${matchedCdn}&type=${matchedType}&id=${matchedId}`,
                directUrl: checkUrl,
              };
            }
          }

          if (platform === 'web') {
            if (lazy) {
              if (lazy.cdn && lazy.id) {
                const params = new URLSearchParams();
                params.set('cdn', lazy.cdn);
                params.set('type', lazy.type || 'vod');
                params.set('id', lazy.id);
                playUrl = `${proxyHost}/master.m3u8?${params.toString()}`;
              } else if (lazy.url && lazy.url.startsWith('/master.m3u8')) {
                playUrl = `${proxyHost}${lazy.url}`;
              } else if (lazy.directUrl) {
                playUrl = `${proxyHost}/master.m3u8?url=${encodeURIComponent(lazy.directUrl)}`;
              } else if (lazy.url) {
                playUrl = `${proxyHost}/master.m3u8?url=${encodeURIComponent(lazy.url)}`;
              }
            } else if (raw.url.startsWith('http')) {
              playUrl = `${proxyHost}/master.m3u8?url=${encodeURIComponent(raw.url)}`;
            }
          } else {
            // Native platform: if lazy, try pre-resolving or keeping direct URL
            if (lazy) {
              playUrl = lazy.directUrl || lazy.url || raw.url;
            }
          }

          const cdn = detectCdn(raw, provider.name);

          const rawAudioName = raw.audio || raw.title || 'Озвучення';
          const studioCleaned = cleanStudioName(rawAudioName);
          const studio = resolveStudioInfo(studioCleaned, raw.poster || undefined);
          if (studio.logoUrl && studio.logoUrl.startsWith('/logos/')) {
            studio.logoUrl = `${proxyHost}${studio.logoUrl}`;
          }
          const audioTracks = raw.audioTracks?.length ? raw.audioTracks : [studio.name];
          // Для злитих (Fenix) джерел уся озвучка лежить в одному `studio`, тому
          // зіставляємо логотип з кожною доріжкою окремо.
          const audioTrackStudios = raw.audioTracks?.length
            ? raw.audioTracks.map((label) => {
                const info = resolveStudioInfo(cleanStudioName(label));
                if (info.logoUrl && info.logoUrl.startsWith('/logos/')) {
                  info.logoUrl = `${proxyHost}${info.logoUrl}`;
                }
                return info;
              })
            : [];
          const lang = detectAudioLang(rawAudioName, meta.originalLanguage);

          const sourceObj: OmssSource = {
            id: randomUUID(),
            url: playUrl,
            streamable: !raw.mime?.includes('text/html'),
            type: inferType(raw.url, raw.mime),
            quality: normalizeQuality(raw.quality),
            audioTracks,
            ...(audioTrackStudios.length ? { audioTrackStudios } : {}),
            lang,
            studio,
            provider: {
              id: cdn.id,
              name: cdn.name,
            },
            ...(platform === 'native' && reqHeaders ? { headers: reqHeaders } : {}),
            ...(raw.sharedVideo ? { sharedVideo: true } : {}),
          };

          const group = providerGroups.get(cdn.id) ?? { id: cdn.id, name: cdn.name, sources: [], subtitles: [] };
          group.sources.push(sourceObj);
          providerGroups.set(cdn.id, group);

          // Subtitles
          if (raw.subtitles && raw.subtitles.length > 0) {
            for (const sub of raw.subtitles) {
              const subFormat: OmssSubtitle['format'] = sub.format === 'ass' || /\.ass(\?|$)/i.test(sub.url)
                ? 'ass'
                : sub.url.endsWith('.srt')
                  ? 'srt'
                  : 'vtt';

              // ASS рендерить libass на канвасі (плеєр тягне файл окремо),
              // VTT/SRT їдуть через HLS як звичайні текст-треки.
              const subUrl = platform === 'web'
                ? `${proxyHost}/${subFormat === 'ass' ? 'subs.ass' : 'master.m3u8'}?url=${encodeURIComponent(sub.url)}`
                : sub.url;

              const subObj: OmssSubtitle = {
                id: randomUUID(),
                url: subUrl,
                label: sub.label || 'Ukrainian',
                format: subFormat,
                provider: {
                  id: cdn.id,
                  name: cdn.name,
                },
              };
              group.subtitles.push(subObj);
            }
          }
        }

        // Видаляє раніше віддані джерела/саби цього CDN (коли його витісняє
        // провайдер з вищим пріоритетом) і звільняє їхні url для нового власника.
        const dropProviderSources = (cdnId: string) => {
          for (let i = sources.length - 1; i >= 0; i -= 1) {
            if (sources[i].provider.id === cdnId) {
              seenSourceUrls.delete(sources[i].url);
              sources.splice(i, 1);
            }
          }
          for (let i = subtitles.length - 1; i >= 0; i -= 1) {
            if (subtitles[i].provider.id === cdnId) {
              seenSubtitleUrls.delete(subtitles[i].url);
              subtitles.splice(i, 1);
            }
          }
        };

        if (providerGroups.size > 0) {
          // Клеймимо CDN-и одразу, щоб SSE стрімив джерела в міру готовності провайдерів.
          // Для фінального JSON/кешу пріоритет з providers[] зберігаємо витісненням:
          // пізніший провайдер з меншим індексом перебирає cdn.id собі. Стримінговому
          // клієнту при цьому нічого не пересилаємо — CDN, який уже поїхав у чанку,
          // лишається за тим провайдером, який завершився першим (без подій removed).
          for (const group of providerGroups.values()) {
            const owner = claimedCdnOwner.get(group.id);
            if (owner !== undefined && owner <= providerIndex) {
              continue;
            }

            const alreadyEmitted = emittedCdns.has(group.id);

            if (owner !== undefined && owner > providerIndex) {
              claimedCdns.delete(group.id);
              dropProviderSources(group.id);
            }

            claimedCdns.add(group.id);
            claimedCdnOwner.set(group.id, providerIndex);

            const acceptedSources = group.sources.filter((s) => {
              if (seenSourceUrls.has(s.url)) return false;
              seenSourceUrls.add(s.url);
              return true;
            });
            const acceptedSubtitles = group.subtitles.filter((sub) => {
              if (seenSubtitleUrls.has(sub.url)) return false;
              seenSubtitleUrls.add(sub.url);
              return true;
            });

            if (acceptedSources.length === 0 && acceptedSubtitles.length === 0) continue;

            sources.push(...acceptedSources);
            subtitles.push(...acceptedSubtitles);

            if (onProviderResult && !alreadyEmitted) {
              emittedCdns.add(group.id);
              onProviderResult({
                provider: group.id,
                providerName: group.name,
                sources: acceptedSources,
                subtitles: acceptedSubtitles,
              });
            }
          }
        }
      } catch (err: unknown) {
        diagnostics.push({
          code: 'PROVIDER_ERROR',
          message: `Provider ${provider.name} error: ${(err as Error).message}`,
          source: provider.name,
          severity: 'warning',
        });
      }
      });
    });

    await Promise.allSettled(tasks);

    // Sort sources: Ashdi always first, then quality 4K > FHD > HD > SD > Auto
    const qualityWeights: Record<OmssQuality, number> = {
      '8K': 6,
      '4K': 5,
      'QHD': 4,
      'FHD': 3,
      'HD': 2,
      'SD': 1,
      'Auto': 0,
    };

    sources.sort((a, b) => {
      const aIsAshdi = a.provider.id === 'ashdi' || a.url.includes('cdn=ashdi') || a.url.includes('ashdi.vip');
      const bIsAshdi = b.provider.id === 'ashdi' || b.url.includes('cdn=ashdi') || b.url.includes('ashdi.vip');
      if (aIsAshdi && !bIsAshdi) return -1;
      if (!aIsAshdi && bIsAshdi) return 1;

      return qualityWeights[b.quality] - qualityWeights[a.quality];
    });

    const finalResult = { sources, subtitles, diagnostics };
    if (sources.length > 0) {
      omssSourceResolutionCache.set(cacheKey, finalResult, 24 * 60 * 60 * 1000);
      const now = Date.now();
      if (mediaKey) mediaParsedTimestampCache.set(String(mediaKey), now);
      if (meta.id) mediaParsedTimestampCache.set(String(meta.id), now);
      if (meta.imdbId) mediaParsedTimestampCache.set(meta.imdbId, now);
    }

    return finalResult;
  }
}
