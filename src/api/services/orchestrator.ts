import { randomUUID } from 'node:crypto';
import type { MediaMetadata, MediaType, StreamSource } from '../../types/media.js';
import type { OmssSource, OmssSubtitle, OmssDiagnostic, PlatformType, OmssQuality, OmssVideoType } from '../types.js';
import { providers } from '../../providers/index.js';
import { extractVod } from '../../vods/index.js';

interface OrchestratorOptions {
  meta: MediaMetadata;
  type: MediaType;
  season?: number;
  episode?: number;
  providerId?: string;
  platform?: PlatformType;
  proxyHost: string;
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
    const { meta, type, season = 1, episode = 1, providerId, platform = 'web', proxyHost } = options;

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

    // Run providers in parallel with individual error catching
    const tasks = targetProviders.map(async (provider) => {
      try {
        const query = meta.imdbId || meta.title;
        let searchResults = await provider.search(query, { meta });

        // If no results by IMDb ID, fallback to title
        if ((!searchResults || searchResults.length === 0) && meta.title && meta.imdbId) {
          searchResults = await provider.search(meta.title, { meta });
        }

        if (!searchResults || searchResults.length === 0) {
          return;
        }

        const target = searchResults[0];
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

        for (const raw of rawSources) {
          let playUrl = raw.url;
          let reqHeaders = raw.headers;

          if (platform === 'web') {
            if (raw.lazy) {
              if (raw.lazy.url && raw.lazy.url.startsWith('/master.m3u8')) {
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

          const audioName = raw.audio || raw.title || 'Ukrainian';
          const audioTracks = [audioName.includes('(') ? audioName : `Ukrainian (${audioName})`];

          sources.push({
            id: randomUUID(),
            url: playUrl,
            streamable: !raw.mime?.includes('text/html'),
            type: inferType(raw.url, raw.mime),
            quality: normalizeQuality(raw.quality),
            audioTracks,
            provider: {
              id: provider.name,
              name: provider.name.toUpperCase(),
            },
            ...(platform === 'native' && reqHeaders ? { headers: reqHeaders } : {}),
          });

          // Subtitles
          if (raw.subtitles && raw.subtitles.length > 0) {
            for (const sub of raw.subtitles) {
              subtitles.push({
                id: randomUUID(),
                url: platform === 'web' ? `${proxyHost}/master.m3u8?url=${encodeURIComponent(sub.url)}` : sub.url,
                label: sub.label || 'Ukrainian',
                format: sub.url.endsWith('.srt') ? 'srt' : 'vtt',
                provider: {
                  id: provider.name,
                  name: provider.name.toUpperCase(),
                },
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

    return { sources, subtitles, diagnostics };
  }
}
