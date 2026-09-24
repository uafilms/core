import { randomUUID } from 'node:crypto';
import type { MediaMetadata, MediaType, StreamSource } from '../../types/media.js';
import type { OmssSource, OmssSubtitle, OmssDiagnostic, PlatformType, OmssQuality, OmssVideoType } from '../types.js';
import { providers } from '../../providers/index.js';
import { extractVod } from '../../vods/index.js';
import { detectCdn } from '../../utils/cdn.js';
import { isSearchResultMatch } from '../../utils/sort.js';
import { cleanStudioName, detectAudioLang, resolveStudioInfo } from '../../utils/studio.js';
import { omssSourceResolutionCache } from '../services/cache.js';

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
    }

    const sources: OmssSource[] = [];
    const subtitles: OmssSubtitle[] = [];
    const diagnostics: OmssDiagnostic[] = [];
    const seenSourceUrls = new Set<string>();
    const seenSubtitleUrls = new Set<string>();
    const claimedCdns = new Set<string>();

    // Run providers in parallel with individual error catching
    const tasks = targetProviders.map(async (provider) => {
      try {
        const query = meta.imdbId || meta.title;
        let searchResults = await provider.search(query, { meta });

        // If no results by IMDb ID, fallback to title
        if ((!searchResults || searchResults.length === 0) && meta.title && meta.imdbId) {
          searchResults = await provider.search(meta.title, { meta });
        }

        // If still no results, fallback to original title if available
        if ((!searchResults || searchResults.length === 0) && meta.originalTitle && meta.originalTitle !== meta.title) {
          searchResults = await provider.search(meta.originalTitle, { meta });
        }

        if (!searchResults || searchResults.length === 0) {
          return;
        }

        // Find candidate that actually matches meta
        const target = searchResults.find(r =>
          (meta.title && isSearchResultMatch(r, meta.title, meta.year, meta.type)) ||
          (meta.originalTitle && isSearchResultMatch(r, meta.originalTitle, meta.year, meta.type))
        ) || (meta.title && isSearchResultMatch(searchResults[0], meta.title, meta.year, meta.type) ? searchResults[0] : null);

        if (!target) {
          return;
        }
        const res = await provider.get(target, { meta });
        if (!res) return;

        let rawSources: StreamSource[] = [];

        if (type === 'movie') {
          rawSources = res.sources || [];
        } else {
          const s = res.seasons?.find(sn => sn.season === season);
          const ep = s?.episodes?.find(e => e.episode === episode);
          rawSources = ep?.sources || [];
        }

        const providerSources: OmssSource[] = [];
        const providerSubtitles: OmssSubtitle[] = [];

        for (const raw of rawSources) {
          let playUrl = raw.url;
          let reqHeaders = raw.headers;

          if (platform === 'web') {
            if (raw.lazy) {
              if (raw.lazy.directUrl) {
                playUrl = `${proxyHost}/master.m3u8?url=${encodeURIComponent(raw.lazy.directUrl)}`;
              } else if (raw.lazy.url && raw.lazy.url.startsWith('/master.m3u8')) {
                playUrl = `${proxyHost}${raw.lazy.url}`;
              } else {
                const params = new URLSearchParams();
                if (raw.lazy.cdn) params.set('cdn', raw.lazy.cdn);
                if (raw.lazy.type) params.set('type', raw.lazy.type);
                if (raw.lazy.id) params.set('id', raw.lazy.id);
                if (raw.lazy.url) params.set('url', raw.lazy.url);
                playUrl = `${proxyHost}/master.m3u8?${params.toString()}`;
              }
            } else if (raw.url.startsWith('http')) {
              playUrl = `${proxyHost}/master.m3u8?url=${encodeURIComponent(raw.url)}`;
            }
          } else {
            // Native platform: if lazy, try pre-resolving or keeping direct URL
            if (raw.lazy) {
              playUrl = raw.lazy.directUrl || raw.lazy.url || raw.url;
            }
          }

          const cdn = detectCdn(raw, provider.name);

          // First provider to obtain VOD from this CDN wins
          if (claimedCdns.has(cdn.id)) {
            continue;
          }

          if (seenSourceUrls.has(playUrl)) {
            continue;
          }
          seenSourceUrls.add(playUrl);

          const rawAudioName = raw.audio || raw.title || 'Озвучення';
          const studioCleaned = cleanStudioName(rawAudioName);
          const studio = resolveStudioInfo(studioCleaned, raw.poster || undefined);
          if (studio.logoUrl && studio.logoUrl.startsWith('/logos/')) {
            studio.logoUrl = `${proxyHost}${studio.logoUrl}`;
          }
          const audioTracks = [studio.name];
          const lang = detectAudioLang(rawAudioName, meta.originalLanguage);

          const sourceObj: OmssSource = {
            id: randomUUID(),
            url: playUrl,
            streamable: !raw.mime?.includes('text/html'),
            type: inferType(raw.url, raw.mime),
            quality: normalizeQuality(raw.quality),
            audioTracks,
            lang,
            studio,
            provider: {
              id: cdn.id,
              name: cdn.name,
            },
            ...(platform === 'native' && reqHeaders ? { headers: reqHeaders } : {}),
          };

          sources.push(sourceObj);
          providerSources.push(sourceObj);

          // Subtitles
          if (raw.subtitles && raw.subtitles.length > 0) {
            for (const sub of raw.subtitles) {
              const subUrl = platform === 'web' ? `${proxyHost}/master.m3u8?url=${encodeURIComponent(sub.url)}` : sub.url;
              if (seenSubtitleUrls.has(subUrl)) {
                continue;
              }
              seenSubtitleUrls.add(subUrl);

              const subObj: OmssSubtitle = {
                id: randomUUID(),
                url: subUrl,
                label: sub.label || 'Ukrainian',
                format: sub.url.endsWith('.srt') ? 'srt' : 'vtt',
                provider: {
                  id: cdn.id,
                  name: cdn.name,
                },
              };
              subtitles.push(subObj);
              providerSubtitles.push(subObj);
            }
          }
        }

        if (providerSources.length > 0) {
          // Mark CDNs as claimed by the winning provider
          for (const s of providerSources) {
            claimedCdns.add(s.provider.id);
          }

          if (onProviderResult) {
            // Group sources and subtitles by CDN so SSE sends per-CDN events
            const cdnGroups = new Map<string, { id: string; name: string; sources: OmssSource[]; subtitles: OmssSubtitle[] }>();

            for (const s of providerSources) {
              const key = s.provider.id;
              if (!cdnGroups.has(key)) {
                cdnGroups.set(key, { id: key, name: s.provider.name, sources: [], subtitles: [] });
              }
              cdnGroups.get(key)!.sources.push(s);
            }

            for (const sub of providerSubtitles) {
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

    await Promise.allSettled(tasks);

    // Sort sources: 4K > FHD > HD > SD > Auto
    const qualityWeights: Record<OmssQuality, number> = {
      '8K': 6,
      '4K': 5,
      'QHD': 4,
      'FHD': 3,
      'HD': 2,
      'SD': 1,
      'Auto': 0,
    };

    sources.sort((a, b) => qualityWeights[b.quality] - qualityWeights[a.quality]);

    const finalResult = { sources, subtitles, diagnostics };
    if (sources.length > 0) {
      omssSourceResolutionCache.set(cacheKey, finalResult, 24 * 60 * 60 * 1000);
    }

    return finalResult;
  }
}
