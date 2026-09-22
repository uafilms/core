import { Hono } from 'hono';
import axios from 'axios';
import { extractVod } from '../../vods/index.js';
import { parseMasterPlaylist, stripCorsProxy } from '../../utils/m3u8.js';
import { logWarn, logError } from '../../utils/logger.js';
import { m3u8PlaylistCache } from '../services/cache.js';

export const streamRouter = new Hono();

streamRouter.get('/master.m3u8', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const type = query.type;
  const id = query.id;
  const rawUrl = query.url;
  const translation = query.translation;
  const episodeId = query.episodeId;

  let streamUrl: string | undefined;

  if (rawUrl) {
    if (rawUrl.includes('.m3u8') && !rawUrl.includes('/master.m3u8')) {
      streamUrl = rawUrl;
    } else {
      try {
        const extracted = await extractVod(rawUrl);
        if (extracted) {
          if (typeof extracted === 'string') {
            streamUrl = extracted;
          } else if ('sources' in (extracted as any) && Array.isArray((extracted as any).sources)) {
            streamUrl = (extracted as any).sources[0]?.url;
          } else if (Array.isArray(extracted) && extracted.length > 0) {
            const first = extracted[0];
            streamUrl = typeof first === 'string' ? first : (first as any).url;
          }
        }
      } catch (err: unknown) {
        logWarn('stream', `extract from rawUrl failed: ${(err as Error).message}`);
      }
    }
  }

  // 1. If still not resolved and lazy params are provided, resolve target URL via VOD extractors
  if (!streamUrl && (cdn || episodeId || (type && id) || translation)) {
    try {
      const fullUrl = c.req.url;
      const extracted = await extractVod(fullUrl);

      if (extracted) {
        if (typeof extracted === 'string') {
          streamUrl = extracted;
        } else if ('sources' in (extracted as any) && Array.isArray((extracted as any).sources)) {
          streamUrl = (extracted as any).sources[0]?.url;
        } else if (Array.isArray(extracted) && extracted.length > 0) {
          const first = extracted[0];
          streamUrl = typeof first === 'string' ? first : (first as any).url;
        } else if (typeof extracted === 'object' && 'url' in (extracted as any)) {
          streamUrl = (extracted as any).url;
        }
      }
    } catch (err: unknown) {
      logWarn('stream', `lazy extract failed: ${(err as Error).message}`);
    }
  }

  // Prevent self-referencing loops (only if pointing to this server, not remote CDNs like factorios)
  if (streamUrl && !streamUrl.startsWith('http://') && !streamUrl.startsWith('https://') && streamUrl.includes('/master.m3u8')) {
    logWarn('stream', `streamUrl resolved to proxy self, aborting: ${streamUrl}`);
    streamUrl = undefined;
  } else if (streamUrl) {
    try {
      const parsedUrl = new URL(streamUrl);
      const host = c.req.header('host') || 'localhost:3000';
      if (parsedUrl.host === host && parsedUrl.pathname.includes('/master.m3u8')) {
        logWarn('stream', `streamUrl resolved to proxy self, aborting: ${streamUrl}`);
        streamUrl = undefined;
      }
    } catch {
      // not a valid absolute URL, let it continue or fail later
    }
  }

  if (!streamUrl) {
    return c.text('#EXTM3U\n#EXT-X-ERROR: Stream URL not found or could not be resolved', 404, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
    });
  }

  streamUrl = stripCorsProxy(streamUrl);

  // 2. Select appropriate headers based on target CDN
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };

  const isAshdi = streamUrl.includes('ashdi.vip');
  const isMoon = streamUrl.includes('moonanime.art') || streamUrl.includes('mooncdn') || streamUrl.includes('s.moonanime');
  const isBamboo = streamUrl.includes('bambooua.com');
  const isHdvb = streamUrl.includes('hdvbua.pro') || streamUrl.includes('vidcache');
  const isFranko = streamUrl.includes('factorios.live') || streamUrl.includes('uacdn.online');
  const isTortuga = streamUrl.includes('tortuga.tw') || streamUrl.includes('tortuga.wtf') || streamUrl.includes('tortuga');

  if (isAshdi) {
    headers['Origin'] = 'https://ashdi.vip';
    headers['Referer'] = 'https://ashdi.vip/';
  } else if (isMoon) {
    headers['Origin'] = 'https://moonanime.art';
    headers['Referer'] = 'https://moonanime.art/';
    headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0';
    headers['Sec-Fetch-Dest'] = 'empty';
    headers['Sec-Fetch-Mode'] = 'cors';
    headers['Sec-Fetch-Site'] = 'same-site';
  } else if (isBamboo) {
    headers['Origin'] = 'https://bambooua.com';
    headers['Referer'] = 'https://bambooua.com/';
  } else if (isHdvb) {
    headers['Referer'] = 'https://eneyida.tv/';
  } else if (isFranko) {
    headers['Origin'] = 'https://franko.uacdn.online';
    headers['Referer'] = 'https://franko.uacdn.online/';
  } else if (isTortuga) {
    headers['Referer'] = 'https://uaserials.com/';
    headers['Origin'] = 'https://uaserials.com';
  }

  // 3. Fetch manifest and rewrite
  try {
    const res = await axios.get<string>(streamUrl, {
      headers,
      responseType: 'text',
      timeout: 10000,
    });

    const host = c.req.header('host') || 'localhost:3000';
    const proto = c.req.header('x-forwarded-proto') || 'http';
    const proxyHost = `${proto}://${host}`;

    const cacheKey = `${proxyHost}:${streamUrl}`;
    const cachedM3u8 = m3u8PlaylistCache.get<string>(cacheKey);
    if (cachedM3u8) {
      return c.text(cachedM3u8, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });
    }

    const modifiedM3u8 = parseMasterPlaylist(res.data, streamUrl, proxyHost, {
      corsProxySegments: isMoon || isAshdi || isBamboo,
    });

    m3u8PlaylistCache.set(cacheKey, modifiedM3u8, 24 * 60 * 60 * 1000);

    return c.text(modifiedM3u8, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (err: unknown) {
    logError('stream', `m3u8 fetch error: ${(err as Error).message}`);
    return c.text(`#EXTM3U\n#EXT-X-ERROR: ${(err as Error).message}`, 502, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
    });
  }
});
