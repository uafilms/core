import { randomUUID } from 'node:crypto';
import type { MediaMetadata, MediaType, StreamSource } from '../../types/media.js';
import type { Provider } from '../../types/provider.js';
import type { OmssSource, OmssSubtitle, OmssDiagnostic, PlatformType, OmssQuality, OmssVideoType } from '../types.js';
import { providers } from '../../providers/index.js';
import { extractVod } from '../../providers/cdn/index.js';
import { detectCdn } from '../../utils/cdn.js';
import { isSearchResultMatch, rankSearchResults } from '../../utils/sort.js';
import { cleanStudioName, detectAudioLang, resolveStudioInfo } from '../../utils/studio.js';
import { omssSourceResolutionCache, mediaParsedTimestampCache } from '../services/cache.js';
import { runWithProvider } from '../../utils/proxyManager.js';
import { resolveSniplyoUrlForIp } from '../../providers/cdn/index.js';

interface OrchestratorOptions {
  meta: MediaMetadata;
  type: MediaType;
  season?: number;
  episode?: number;
  providerId?: string;
  platform?: PlatformType;
  proxyHost: string;
  clientIp?: string;
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
  if (url.includes('/video.mp4') || mime?.includes('mp4') || url.includes('.mp4') || url.includes('VIDEOS.php')) return 'mp4';
  if (mime?.includes('mpegURL') || url.includes('.m3u8') || url.includes('master.m3u8')) return 'hls';
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
    const { meta, type, season = 1, episode = 1, providerId, platform = 'web', proxyHost, clientIp, onProviderResult } = options;

    const mediaKey = meta.imdbId || meta.id || meta.title;
    const cacheKey = `orchestrator:${mediaKey}:${type}:${season}:${episode}:${providerId || 'all'}:${platform}:${proxyHost}:${clientIp || 'default'}`;

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
      const animeSpecificProviders = new Set(['anihub', 'animeon', 'aniworld', 'mikai', 'unimay', 'ufdub']);
      const isAnime = meta.isAnime ?? (
        meta.originalLanguage === 'ja' ||
        meta.genres?.some(g => g.toLowerCase().includes('аніме') || g.toLowerCase().includes('anime'))
      );

      if (!isAnime) {
        targetProviders = providers.filter(
          p => !animeSpecificProviders.has(p.name.toLowerCase()) && !p.animeOnly
        );
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

    // CDN redundancy check & AbortController management
    const isRedundant = (p: Provider): boolean => {
      if (!p.cdns || p.cdns.length === 0) return false;
      return p.cdns.every((cdn: string) => claimedCdns.has(cdn));
    };

    const activeControllers = new Map<Provider, AbortController>();

    const abortRedundantTasks = () => {
      for (const [p, controller] of activeControllers.entries()) {
        if (isRedundant(p)) {
          controller.abort();
        }
      }
    };

    const runProviderTask = async (provider: Provider, providerIndex: number) => {
      if (isRedundant(provider)) return;

      const abortController = new AbortController();
      activeControllers.set(provider, abortController);

      return runWithProvider(provider.name, async () => {
        try {
          const searchOptions = {
            meta,
            year: meta.year,
            type,
            season,
            episode,
            signal: abortController.signal,
            clientIp,
          };
          const query = meta.imdbId || meta.title;
          let searchResults = await provider.search(query, searchOptions);

          if (abortController.signal.aborted || isRedundant(provider)) return;

          // If no results by IMDb ID, fallback to title
          if ((!searchResults || searchResults.length === 0) && meta.title && meta.imdbId) {
            searchResults = await provider.search(meta.title, searchOptions);
          }

          if (abortController.signal.aborted || isRedundant(provider)) return;

          // If still no results, fallback to original title if available
          if ((!searchResults || searchResults.length === 0) && meta.originalTitle && meta.originalTitle !== meta.title) {
            searchResults = await provider.search(meta.originalTitle, searchOptions);
          }

          if (abortController.signal.aborted || !searchResults || searchResults.length === 0 || isRedundant(provider)) {
            return;
          }

          // Find candidate that best matches meta (taking season and year into account)
          let target: typeof searchResults[0] | null = null;

          if (meta.title) {
            const ranked = rankSearchResults(searchResults, meta.title, meta.year, meta.type, season, episode);
            if (ranked.length > 0) {
              target = ranked[0];
            }
          }

          if (!target && meta.originalTitle) {
            const ranked = rankSearchResults(searchResults, meta.originalTitle, meta.year, meta.type, season, episode);
            if (ranked.length > 0) {
              target = ranked[0];
            }
          }

          if (!target) {
            target = searchResults.find((r: any) =>
              (meta.title && isSearchResultMatch(r, meta.title, meta.year, meta.type, 50, season, episode)) ||
              (meta.originalTitle && isSearchResultMatch(r, meta.originalTitle, meta.year, meta.type, 50, season, episode))
            ) || null;
          }

          if (!target || abortController.signal.aborted || isRedundant(provider)) {
            return;
          }

          const res = await provider.get(target, { meta, season, episode, signal: abortController.signal, clientIp });
          if (!res || abortController.signal.aborted || isRedundant(provider)) return;

          let rawSources: StreamSource[] = [];

          if (type === 'movie') {
            rawSources = res.sources || [];
          } else {
            const s = res.seasons?.find((sn: any) => sn.season === season);
            const ep = s?.episodes?.find((e: any) => e.episode === episode);
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
            const ashdiMatch = checkUrl.match(/(?:ashdi\.(?:vip|me)|0yql3tj|oyql3tj)\/(vod|embed|serial)\/([a-zA-Z0-9_-]+)/i);
            const zetMatch = checkUrl.match(/zetvideo\.net\/(vod|embed|serial)\/([a-zA-Z0-9_-]+)/i);
            const hdvbMatch = checkUrl.match(/(?:hdvb|vidcache)/i);

            if (ashdiMatch) {
              const matchedType = ashdiMatch[1].toLowerCase() as 'vod' | 'embed' | 'serial';
              const matchedId = ashdiMatch[2];
              lazy = {
                cdn: 'ashdi',
                type: matchedType,
                id: matchedId,
                url: `/master.m3u8?cdn=ashdi&type=${matchedType}&id=${matchedId}`,
                directUrl: checkUrl,
              };
            } else if (zetMatch) {
              const matchedType = zetMatch[1].toLowerCase() as 'vod' | 'embed' | 'serial';
              const matchedId = zetMatch[2];
              lazy = {
                cdn: 'zetvideo',
                type: matchedType,
                id: matchedId,
                url: `/master.m3u8?cdn=zetvideo&type=${matchedType}&id=${matchedId}`,
                directUrl: checkUrl,
              };
            } else if (hdvbMatch) {
              lazy = {
                cdn: 'hdvb',
                type: 'vod',
                url: `/master.m3u8?cdn=hdvb&url=${encodeURIComponent(checkUrl)}`,
                directUrl: checkUrl,
              };
            }
          }

          const cdn = detectCdn({ ...raw, lazy }, provider.name);
          const isWebLike = platform === 'web' || platform === 'tv';
          const isMp4 = raw.mime === 'video/mp4' || raw.url?.includes('.mp4') || raw.url?.includes('VIDEOS.php') || raw.lazy?.directUrl?.includes('.mp4');

          if (isMp4) {
            let targetUrl = lazy?.directUrl || (lazy?.url && !lazy.url.startsWith('/master.m3u8') ? lazy.url : undefined) || raw.url;
            if (clientIp && (cdn.id === 'sniplyo' || targetUrl.includes('sniplyo.online') || targetUrl.includes('creavio.online'))) {
              targetUrl = await resolveSniplyoUrlForIp(targetUrl, clientIp);
            }
            playUrl = isWebLike ? `${proxyHost}/video.mp4?url=${encodeURIComponent(targetUrl)}` : targetUrl;
          } else if (isWebLike) {
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

            // Додаємо ?cors=ashdi лише для веб-платформи (браузер вимагає CORS для ashdi сегментів).
            // Lampa-клієнти (platform=tv) відтворюють напряму без CORS-проксі.
            if (platform === 'web' && cdn.id === 'ashdi' && playUrl.includes('/master.m3u8') && !playUrl.includes('cors=')) {
              playUrl += (playUrl.includes('?') ? '&' : '?') + 'cors=ashdi';
            }
          } else {
            // Native platform: if directUrl is an API endpoint, proxy it via master.m3u8
            if (lazy) {
              const isApi = lazy.directUrl?.includes('animeon.club/api/') || lazy.directUrl?.includes('/api/player');
              if (lazy.directUrl && !isApi) {
                playUrl = lazy.directUrl;
              } else if (lazy.url && lazy.url.startsWith('/master.m3u8')) {
                playUrl = `${proxyHost}${lazy.url}`;
              } else if (lazy.directUrl) {
                playUrl = `${proxyHost}/master.m3u8?url=${encodeURIComponent(lazy.directUrl)}`;
              } else {
                playUrl = lazy.directUrl || lazy.url || raw.url;
              }
            }
          }

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
            type: isMp4 ? 'mp4' : inferType(raw.url, raw.mime),
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
          let newlyClaimed = false;
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
            newlyClaimed = true;

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

          if (newlyClaimed) {
            abortRedundantTasks();
          }
        }
      } catch (err: unknown) {
        if ((err as any)?.name === 'AbortError' || (err as any)?.code === 'ERR_CANCELED') {
          return;
        }
        diagnostics.push({
          code: 'PROVIDER_ERROR',
          message: `Provider ${provider.name} error: ${(err as Error).message}`,
          source: provider.name,
          severity: 'warning',
        });
      } finally {
        activeControllers.delete(provider);
      }
      });
    };

    // Priority Waves execution:
    // Wave 1: Priority 1 (Primary providers, Unique CDNs, local DBs)
    // Wave 2: Priority 2 (Fallback scrapers: kinostrain, serialno, klon)
    const wave1 = targetProviders.filter((p) => (p.priority ?? 1) <= 1);
    const wave2 = targetProviders.filter((p) => (p.priority ?? 1) > 1);

    const wave1Tasks = wave1.map((p, idx) => runProviderTask(p, idx));

    if (wave2.length > 0) {
      // Start wave 2 after wave 1 settles or after 350ms delay
      const wave1Settled = Promise.allSettled(wave1Tasks);
      const delay = new Promise((resolve) => setTimeout(resolve, 350));
      await Promise.race([wave1Settled, delay]);

      const wave2Tasks = wave2.map((p, idx) => runProviderTask(p, wave1.length + idx));
      await Promise.allSettled([...wave1Tasks, ...wave2Tasks]);
    } else {
      await Promise.allSettled(wave1Tasks);
    }

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
