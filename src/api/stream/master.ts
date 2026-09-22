import { Hono } from 'hono';
import axios from 'axios';
import { extractVod } from '../../vods/index.js';
import { parseMasterPlaylist, stripCorsProxy } from '../../utils/m3u8.js';
import { logWarn, logError } from '../../utils/logger.js';

export const streamRouter = new Hono();

streamRouter.get('/master.m3u8', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const type = query.type;
  const id = query.id;
  const rawUrl = query.url;
  const translation = query.translation;
  const episodeId = query.episodeId;

  let streamUrl: string | undefined = rawUrl;

  // 1. If lazy params are provided, resolve target URL via VOD extractors
  if (cdn || episodeId || (type && id)) {
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

  if (isAshdi) {
    headers['Origin'] = 'https://ashdi.vip';
    headers['Referer'] = 'https://ashdi.vip/';
  } else if (isMoon) {
    headers['Origin'] = 'https://moonanime.art';
    headers['Referer'] = 'https://moonanime.art/';
  } else if (isBamboo) {
    headers['Origin'] = 'https://bambooua.com';
    headers['Referer'] = 'https://bambooua.com/';
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

    const modifiedM3u8 = parseMasterPlaylist(res.data, streamUrl, proxyHost, {
      corsProxySegments: isMoon || isAshdi || isBamboo,
    });

    return c.text(modifiedM3u8, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
  } catch (err: unknown) {
    logError('stream', `m3u8 fetch error: ${(err as Error).message}`);
    return c.text(`#EXTM3U\n#EXT-X-ERROR: ${(err as Error).message}`, 502, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
    });
  }
});
