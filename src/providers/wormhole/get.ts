import { httpRequest } from '../../utils/http.js';
import { ashdiVod } from '../../vods/ashdi/main.js';
import type { ProviderGetOptions, ProviderResult, StreamSource, Season, LazyStream } from '../../types/index.js';

const WORMHOLE_BASE = 'https://wh.lme.isroot.in';

export interface WormholeApiResponse {
  play?: string;
  error?: string;
}

export async function get(
  target: string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let imdbId = options?.meta?.imdbId;

  if (!imdbId) {
    const match = target.match(/imdb_id=(tt\d+)/) || target.match(/(tt\d{6,8})/);
    if (match) {
      imdbId = match[1];
    }
  }

  if (!imdbId) {
    return null;
  }

  try {
    const response = await httpRequest<WormholeApiResponse>({
      url: `${WORMHOLE_BASE}/?imdb_id=${imdbId}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: options?.signal,
    });

    const ashdiUrl = response.data?.play;
    if (!ashdiUrl || typeof ashdiUrl !== 'string' || !ashdiUrl.includes('ashdi')) {
      return null;
    }

    // Determine type (movie vs tv)
    const isSerial = ashdiUrl.includes('/serial/');
    const mediaType = isSerial ? 'tv' : 'movie';

    // Parse ID for lazy routing
    const idMatch = ashdiUrl.match(/\/(vod|serial)\/(\d+)/);
    const endpointType = isSerial ? 'serial' : 'vod';
    const vodId = idMatch ? idMatch[2] : '';

    // Extract actual streams/seasons from Ashdi
    const vodResult = await ashdiVod.extract(ashdiUrl, {
      signal: options?.signal,
      headers: {
        'Referer': 'https://wh.lme.isroot.in/',
      },
    });

    if (!vodResult) {
      // Fallback to lazy stream if direct extraction failed
      const lazy: LazyStream = {
        cdn: 'ashdi',
        type: endpointType,
        id: vodId,
        url: `/master.m3u8?cdn=ashdi&type=${endpointType}&id=${vodId}`,
        directUrl: ashdiUrl,
      };

      return {
        provider: 'wormhole',
        type: mediaType,
        sources: [{
          title: 'Ashdi',
          url: lazy.url,
          lazy,
        }],
      };
    }

    // Attach lazy stream metadata to sources
    if (vodResult.sources) {
      for (const src of vodResult.sources) {
        src.lazy = {
          cdn: 'ashdi',
          type: endpointType,
          id: vodId,
          url: `/master.m3u8?cdn=ashdi&type=${endpointType}&id=${vodId}`,
          directUrl: src.url,
        };
      }
    }

    return {
      provider: 'wormhole',
      type: mediaType,
      sources: vodResult.sources,
      seasons: vodResult.seasons,
    };
  } catch {
    return null;
  }
}
