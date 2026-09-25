import { Hono } from 'hono';
import axios from 'axios';
import { extractVod } from '../../vods/index.js';
import { parseMasterPlaylist, stripCorsProxy } from '../../utils/m3u8.js';
import { logWarn, logError } from '../../utils/logger.js';
import { m3u8PlaylistCache } from '../services/cache.js';
import { proxyManager } from '../../utils/proxyManager.js';
import type { Subtitle } from '../../types/media.js';

export const streamRouter = new Hono();

// HLS Media Playlist для субтитрів (/subs.m3u8)
streamRouter.get('/subs.m3u8', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const id = query.id;
  const lang = query.lang || 'ua';
  const rawUrl = query.url;

  const host = c.req.header('host') || 'localhost:3000';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const proxyHost = `${proto}://${host}`;

  let vttUrl = `${proxyHost}/subs.vtt`;
  const params = new URLSearchParams();
  if (cdn) params.set('cdn', cdn);
  if (id) params.set('id', id);
  if (lang) params.set('lang', lang);
  if (rawUrl) params.set('url', rawUrl);

  const queryString = params.toString();
  if (queryString) {
    vttUrl += `?${queryString}`;
  }

  // Віддаємо валідний HLS Media Playlist для субтитрів (RFC 8216)
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:10800',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXTINF:10800.0,',
    vttUrl,
    '#EXT-X-ENDLIST',
  ].join('\n');

  return c.text(playlist, 200, {
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400',
  });
});

// Роут для віддачі сегменту/файлу WebVTT (/subs.vtt)
streamRouter.get('/subs.vtt', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const id = query.id;
  const lang = query.lang || 'ua';
  const rawUrl = query.url;

  let targetUrl = rawUrl;

  if (!targetUrl && cdn && id) {
    if (cdn === 'ashdi') {
      targetUrl = `https://ashdi.vip/player/subtitle/${id}_${lang}.vtt`;
    } else if (cdn === 'zetvideo') {
      targetUrl = `https://zetvideo.net/player/subtitle/${id}_${lang}.vtt`;
    } else if (cdn === 'hdvb') {
      targetUrl = `https://s11.hdvbua.pro/media/content/stream/2025/${id}/subtitle.vtt`;
    }
  }

  if (!targetUrl) {
    return c.text('WEBVTT\n\n', 404, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }

  try {
    const subUrl = stripCorsProxy(targetUrl);
    const subHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    };
    if (subUrl.includes('ashdi.vip')) {
      subHeaders['Origin'] = 'https://ashdi.vip';
      subHeaders['Referer'] = 'https://ashdi.vip/';
    } else if (subUrl.includes('zetvideo.net')) {
      subHeaders['Origin'] = 'https://zetvideo.net';
      subHeaders['Referer'] = 'https://uafix.net/';
    } else if (subUrl.includes('hdvbua.pro') || subUrl.includes('vidcache')) {
      subHeaders['Referer'] = 'https://eneyida.tv/';
    }

    const proxyOpts = proxyManager.getConfig(cdn || undefined, subUrl);
    const res = await axios.get<string>(subUrl, {
      headers: subHeaders,
      responseType: 'text',
      timeout: 10000,
      ...proxyOpts,
    });

    let content = res.data;

    // 1. Нормалізуємо таймкоди WebVTT: перетворюємо MM:SS.mmm на 00:MM:SS.mmm
    content = content.replace(/(\r?\n|^)(\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}\.\d{3})/g, '$100:$2 --> 00:$3');
    content = content.replace(/(\r?\n|^)(\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/g, '$100:$2 --> $3');
    content = content.replace(/(\r?\n|^)(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}\.\d{3})/g, '$1$2 --> 00:$3');

    // 2. Додаємо X-TIMESTAMP-MAP для точної синхронізації MPEGTS PTS у HLS
    // Не додаємо штучний X-TIMESTAMP-MAP, оскільки це спричиняє розсинхрон і затримку (~1.5-3 сек)
    // у VHS через різницю PTS аудіо/відео та LOCAL time.
    // WebVTT таймкоди вже синхронізовані з початком потоку (0:00).

    return c.text(content, 200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (err: unknown) {
    logWarn('stream', `subtitle proxy error: ${(err as Error).message}`);
    return c.text('WEBVTT\n\n', 200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }
});

streamRouter.get('/master.m3u8', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const type = query.type;
  const id = query.id;
  const rawUrl = query.url;
  const translation = query.translation;
  const episodeId = query.episodeId;

  // Пряме перенаправлення для субтитрів, якщо запитано через /master.m3u8
  if (rawUrl && (rawUrl.endsWith('.vtt') || rawUrl.endsWith('.srt') || rawUrl.includes('/subtitle/'))) {
    return c.redirect(`/subs.vtt?url=${encodeURIComponent(rawUrl)}`);
  }

  let streamUrl: string | undefined;
  let extractedSubtitles: Subtitle[] = [];

  const pickResolvedStreamUrl = (first: any): string | undefined => {
    if (!first) return undefined;
    if (typeof first === 'string') {
      if (!first.includes('/master.m3u8')) return first;
      try {
        const u = new URL(first, 'http://localhost');
        const inner = u.searchParams.get('url');
        if (inner) return decodeURIComponent(inner);
      } catch {}
      return first;
    }
    const candidates = [first.lazy?.directUrl, first.lazy?.url, first.url];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) {
        if (!candidate.includes('/master.m3u8')) {
          return candidate;
        }
        try {
          const u = new URL(candidate, 'http://localhost');
          const inner = u.searchParams.get('url');
          if (inner) return decodeURIComponent(inner);
        } catch {}
      }
    }
    return first.url || first.lazy?.url;
  };

  if (rawUrl) {
    if (rawUrl.includes('.m3u8') && !rawUrl.includes('/master.m3u8')) {
      streamUrl = rawUrl;
    } else {
      try {
        const extracted = await extractVod(rawUrl);
        if (extracted) {
          if (typeof extracted === 'string') {
            streamUrl = pickResolvedStreamUrl(extracted);
          } else if ('sources' in (extracted as any) && Array.isArray((extracted as any).sources)) {
            const first = (extracted as any).sources[0];
            streamUrl = pickResolvedStreamUrl(first);
            if (first?.subtitles && Array.isArray(first.subtitles)) {
              extractedSubtitles = first.subtitles;
            }
          } else if (Array.isArray(extracted) && extracted.length > 0) {
            const first = extracted[0];
            streamUrl = pickResolvedStreamUrl(first);
            if (typeof first === 'object' && first?.subtitles && Array.isArray(first.subtitles)) {
              extractedSubtitles = first.subtitles;
            }
          }
        }
      } catch (err: unknown) {
        logWarn('stream', `extract from rawUrl failed: ${(err as Error).message}`);
      }
    }
  }

  // 2. If still not resolved and lazy params are provided, resolve target URL via VOD extractors
  if (!streamUrl && (cdn || episodeId || (type && id) || translation)) {
    try {
      const fullUrl = c.req.url;
      const extracted = await extractVod(fullUrl);

      if (extracted) {
        if (typeof extracted === 'string') {
          streamUrl = pickResolvedStreamUrl(extracted);
        } else if ('sources' in (extracted as any) && Array.isArray((extracted as any).sources)) {
          const first = (extracted as any).sources[0];
          streamUrl = pickResolvedStreamUrl(first);
          if (first?.subtitles && Array.isArray(first.subtitles)) {
            extractedSubtitles = first.subtitles;
          }
        } else if (Array.isArray(extracted) && extracted.length > 0) {
          const first = extracted[0];
          streamUrl = pickResolvedStreamUrl(first);
          if (typeof first === 'object' && first?.subtitles && Array.isArray(first.subtitles)) {
            extractedSubtitles = first.subtitles;
          }
        } else if (typeof extracted === 'object' && 'url' in (extracted as any)) {
          streamUrl = pickResolvedStreamUrl(extracted);
          if ((extracted as any).subtitles && Array.isArray((extracted as any).subtitles)) {
            extractedSubtitles = (extracted as any).subtitles;
          }
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

  // 3. Select appropriate headers based on target CDN
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
  const isZetvideo = streamUrl.includes('zetvideo.net');

  if (isAshdi) {
    headers['Origin'] = 'https://ashdi.vip';
    headers['Referer'] = 'https://ashdi.vip/';
  } else if (isMoon) {
    headers['Origin'] = 'https://moonanime.art';
    headers['Referer'] = 'https://moonanime.art/';
    headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0';
    headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    headers['Accept-Language'] = 'en-US,en;q=0.9';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers['Upgrade-Insecure-Requests'] = '1';
    headers['Priority'] = 'u=0, i';
    headers['Pragma'] = 'no-cache';
    headers['Cache-Control'] = 'no-cache';
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
  } else if (isZetvideo) {
    headers['Origin'] = 'https://zetvideo.net';
    headers['Referer'] = 'https://uafix.net/';
  }

  // 4. Fetch manifest and rewrite
  try {
    let manifestData: string;
    const proxyOpts = proxyManager.getConfig(cdn || undefined, streamUrl);
    try {
      const res = await axios.get<string>(streamUrl, {
        headers,
        responseType: 'text',
        timeout: 10000,
        ...proxyOpts,
      });
      manifestData = res.data;
    } catch (fetchErr: unknown) {
      logWarn('stream', `Failed fetching manifest from ${streamUrl}: ${(fetchErr as any).message}`);
      if ((fetchErr as any).response) {
        logWarn('stream', `Fetch response data: ${JSON.stringify((fetchErr as any).response.data)}`);
      }
      // Якщо Ashdi повернув помилку (наприклад, 404) на відновлений потік 1080/720/2160 — пробуємо резервний 480
      if (streamUrl.includes('ashdi.vip') && /\/hls\/(?:1080|2160|1440|720)\//.test(streamUrl)) {
        const fallbackUrl = streamUrl.replace(/\/hls\/(?:1080|2160|1440|720)\//, '/hls/480/');
        const fallbackRes = await axios.get<string>(fallbackUrl, {
          headers,
          responseType: 'text',
          timeout: 10000,
          ...proxyOpts,
        });
        manifestData = fallbackRes.data;
      } else {
        throw fetchErr;
      }
    }

    const host = c.req.header('host') || 'localhost:3000';
    const proto = c.req.header('x-forwarded-proto') || 'http';
    const proxyHost = `${proto}://${host}`;

    const cacheKey = `${proxyHost}:${streamUrl}:${extractedSubtitles.length}`;
    // Master playlists are dynamic or short-lived, while child media playlists can be cached briefly
    const isMaster = manifestData.includes('#EXT-X-STREAM-INF');
    const cachedM3u8 = m3u8PlaylistCache.get<string>(cacheKey);
    if (cachedM3u8) {
      return c.text(cachedM3u8, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': isMaster ? 'no-cache' : 'public, max-age=3600',
      });
    }

    const modifiedM3u8 = parseMasterPlaylist(manifestData, streamUrl, proxyHost, {
      corsProxySegments: isMoon || isAshdi || isBamboo,
      subtitles: extractedSubtitles,
    });

    if (!isMaster) {
      m3u8PlaylistCache.set(cacheKey, modifiedM3u8, 60 * 60 * 1000);
    }

    return c.text(modifiedM3u8, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isMaster ? 'no-cache' : 'public, max-age=3600',
    });
  } catch (err: unknown) {
    logError('stream', `m3u8 fetch error: ${(err as Error).message}`);
    return c.text(`#EXTM3U\n#EXT-X-ERROR: ${(err as Error).message}`, 502, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
    });
  }
});
