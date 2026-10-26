import { Hono } from 'hono';
import axios from 'axios';
import { extractVod, stripUakinoAxIntro, buildFenixMergedManifest } from '../../providers/cdn/index.js';
import { parseMasterPlaylist, stripCorsProxy, formatSubtitleUri, normalizeSubLang } from '../../utils/m3u8.js';
import { logWarn, logError } from '../../utils/logger.js';
import { m3u8PlaylistCache } from '../services/cache.js';
import { proxyManager } from '../../utils/proxyManager.js';
import type { Subtitle } from '../../types/media.js';
import { TmdbService } from '../services/tmdb.js';
import { OrchestratorService } from '../services/orchestrator.js';

export const streamRouter = new Hono();

// Роут для прямих посилань на відтворення серій у плейлістах Lampa та external плеєрів
const handleDirectPlay = async (c: any) => {
  const query = c.req.query();
  const id = query.id;
  const sParam = query.s || '1';
  const eParam = query.e || '1';
  const media = (query.type || (query.s ? 'tv' : 'movie')) as 'movie' | 'tv';
  const provider = query.provider;
  const voice = query.voice;
  const platform = (query.platform || 'web') as any;

  if (!id) {
    return c.text('Missing id parameter', 400);
  }

  const host = c.req.header('host') || 'localhost:3000';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const proxyHost = `${proto}://${host}`;

  const season = parseInt(sParam, 10) || 1;
  const episode = parseInt(eParam, 10) || 1;

  try {
    const meta = await TmdbService.getMetadata(id, media);
    if (!meta) {
      return c.text('Media metadata not found', 404);
    }

    const result = await OrchestratorService.resolveSources({
      meta,
      type: media,
      season,
      episode,
      platform,
      proxyHost,
      providerId: undefined,
    });

    if (!result.sources || result.sources.length === 0) {
      return c.text('No sources found for this episode', 404);
    }

    let matchedSources = result.sources;
    if (provider) {
      const cleanProv = provider.replace(/^★\s*/, '').toLowerCase().trim();
      const byProv = matchedSources.filter((s) => {
        const pName = (s.provider?.name || '').toLowerCase().trim();
        const pId = (s.provider?.id || '').toLowerCase().trim();
        return pName === cleanProv || pId === cleanProv || pName.includes(cleanProv) || cleanProv.includes(pName);
      });
      if (byProv.length > 0) {
        matchedSources = byProv;
      }
    }

    let targetSource = matchedSources[0];
    if (voice) {
      const cleanWanted = voice.toLowerCase().trim();
      const matched = matchedSources.find((s) => {
        const v = (
          s.studio?.name ||
          (s.audioTracks && s.audioTracks[0]) ||
          (s as any).audio ||
          (s as any).title ||
          ''
        )
          .toLowerCase()
          .trim();
        return v === cleanWanted || v.includes(cleanWanted) || cleanWanted.includes(v);
      });
      if (matched) {
        targetSource = matched;
      }
    }

    let targetUrl = targetSource.url;
    if (voice && targetSource.sharedVideo && !targetUrl.includes('voice=')) {
      targetUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}voice=${encodeURIComponent(voice)}&mergeAudio=1`;
    }

    c.header('Access-Control-Allow-Origin', '*');
    c.header('Cache-Control', 'public, max-age=300');
    return c.redirect(targetUrl, 302);
  } catch (err: unknown) {
    return c.text(`Play error: ${(err as Error).message}`, 500);
  }
};

streamRouter.get('/play.m3u8', handleDirectPlay);
streamRouter.get('/play.mp4', handleDirectPlay);
streamRouter.get('/play', handleDirectPlay);

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
    } else if (subUrl.includes('tortuga.tw') || subUrl.includes('tortuga.wtf')) {
      subHeaders['Referer'] = 'https://tortuga.tw/';
      subHeaders['Origin'] = 'https://tortuga.tw';
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

    // 2. Прибираємо ASS-подібні escape-послідовності, які трапляються у VTT
    //    деяких CDN (Fenix): \h — нерозривний пробіл, \N/\n — перенос рядка,
    //    {\an8}, {\k10} — блоки override. Без цього плеєр показує "\h" як текст.
    content = content
      .replace(/\\h/g, ' ')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\{[^}]*\}/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n');

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

// Роут для віддачі стилізованих ASS-субтитрів (Fenix styled_url).
// Рендерить не плеєр, а libass/JASSUB на канвасі, тому це не VTT і через
// EXT-X-MEDIA такий файл не проксіюється — плеєр тягне його окремо.
streamRouter.get('/subs.ass', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const targetUrl = query.url;

  if (!targetUrl) {
    return c.text('', 404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }

  try {
    const subUrl = stripCorsProxy(targetUrl);
    const subHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    };
    if (subUrl.includes('fenixplay.xyz')) {
      subHeaders['Referer'] = 'https://fenixplay.xyz/';
      subHeaders['Origin'] = 'https://fenixplay.xyz';
    }

    const proxyOpts = proxyManager.getConfig(cdn || undefined, subUrl);
    const res = await axios.get<string>(subUrl, {
      headers: subHeaders,
      responseType: 'text',
      timeout: 15000,
      ...proxyOpts,
    });

    const content = typeof res.data === 'string' ? res.data : String(res.data ?? '');

    return c.text(content, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (err: unknown) {
    logWarn('stream', `ass subtitle proxy error: ${(err as Error).message}`);
    return c.text('', 502, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }
});

// Проксі сегментів для CDN з підписами, прив'язаними до IP (uakino.ax).
// Браузер не може тягнути такі сегменти напряму — токен виданий на IP сервера.
streamRouter.get('/segment', async (c) => {
  const target = stripCorsProxy(c.req.query('url') || '');
  if (!target || !/^https?:\/\//i.test(target)) {
    return c.text('Bad url', 400, { 'Access-Control-Allow-Origin': '*' });
  }

  try {
    const range = c.req.header('range');
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept': '*/*',
      ...(range ? { Range: range } : {}),
    };

    if (target.includes('fenixplay.xyz') || target.includes('fanixplay.xyz')) {
      reqHeaders['Origin'] = 'https://fenixplay.xyz';
      reqHeaders['Referer'] = 'https://fenixplay.xyz/';
    } else if (target.includes('ashdi.vip')) {
      reqHeaders['Origin'] = 'https://ashdi.vip';
      reqHeaders['Referer'] = 'https://ashdi.vip/';
    }

    const res = await axios.get<ArrayBuffer>(target, {
      headers: reqHeaders,
      responseType: 'arraybuffer',
      timeout: 20000,
      validateStatus: () => true,
    });

    if (res.status >= 400) {
      logWarn('stream', `segment fetch failed ${res.status}: ${target.slice(0, 120)}`);
      return c.text(`Segment upstream error ${res.status}`, 502, { 'Access-Control-Allow-Origin': '*' });
    }

    const headers: Record<string, string> = {
      'Content-Type': (res.headers['content-type'] as string) || (target.includes('.m4s') || target.includes('.mp4') ? 'video/iso.segment' : 'video/mp2t'),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    };
    if (res.headers['content-range']) headers['Content-Range'] = String(res.headers['content-range']);
    if (res.headers['accept-ranges']) headers['Accept-Ranges'] = String(res.headers['accept-ranges']);
    if (res.headers['content-length']) headers['Content-Length'] = String(res.headers['content-length']);

    return c.body(res.data as ArrayBuffer, res.status as 200 | 206, headers);
  } catch (err: unknown) {
    logWarn('stream', `segment proxy error: ${(err as Error).message}`);
    return c.text('Segment fetch error', 502, { 'Access-Control-Allow-Origin': '*' });
  }
});

streamRouter.get('/video.mp4', async (c) => {
  let target = stripCorsProxy(c.req.query('url') || '');
  const cdn = c.req.query('cdn');
  const id = c.req.query('id');

  if (!target && cdn === 'ufdub' && id) {
    target = `https://video.ufdub.com/V2/VP.php?ID=${encodeURIComponent(id)}`;
  }

  if (!target) {
    return c.text('Bad url', 400, { 'Access-Control-Allow-Origin': '*' });
  }

  // Якщо target вказує на сторінку плеєра (наприклад, video.ufdub.com/V2/VP.php?ID=...)
  if (target.includes('video.ufdub.com')) {
    try {
      const extracted = await extractVod(target);
      if (extracted?.sources?.[0]?.url) {
        target = extracted.sources[0].url;
      }
    } catch {
      // продовжуємо з вихідним target
    }
  }

  try {
    const range = c.req.header('range');
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept': '*/*',
      ...(target.includes('ufdub.com') ? { 'Referer': 'https://video.ufdub.com/' } : {}),
      ...(range ? { Range: range } : {}),
    };

    const proxyOpts = proxyManager.getConfig(cdn || undefined, target);

    const res = await axios.get(target, {
      headers: reqHeaders,
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true,
      ...proxyOpts,
    });

    if (res.status >= 400) {
      logWarn('stream', `video.mp4 upstream error ${res.status}: ${target}`);
      return c.text(`Video upstream error ${res.status}`, 502, { 'Access-Control-Allow-Origin': '*' });
    }

    const headers: Record<string, string> = {
      'Content-Type': (res.headers['content-type'] as string) || 'video/mp4',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    };
    if (res.headers['content-range']) headers['Content-Range'] = String(res.headers['content-range']);
    if (res.headers['accept-ranges']) headers['Accept-Ranges'] = String(res.headers['accept-ranges']);
    if (res.headers['content-length']) headers['Content-Length'] = String(res.headers['content-length']);

    return c.body(res.data, res.status as 200 | 206, headers);
  } catch (err: unknown) {
    logWarn('stream', `video.mp4 proxy error: ${(err as Error).message}`);
    return c.text('Video fetch error', 502, { 'Access-Control-Allow-Origin': '*' });
  }
});

streamRouter.get('/master.m3u8', async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const type = query.type;
  const id = query.id;
  const rawUrl = query.url || (id && (id.startsWith('http://') || id.startsWith('https://')) ? id : undefined);
  const translation = query.translation;
  const episodeId = query.episodeId;
  // Клієнт просить злитий майстер для CDN, де всі озвучки ділять одне відео (Fenix)
  const mergeAudio = query.mergeAudio === '1' || query.mergeAudio === 'true';

  // Пряме перенаправлення для субтитрів, якщо запитано через /master.m3u8
  if (rawUrl && (rawUrl.endsWith('.vtt') || rawUrl.endsWith('.srt') || rawUrl.includes('/subtitle/') || rawUrl.includes('/hls/sub/') || rawUrl.includes('/subtitles/') || /\.(vtt|srt)\?/i.test(rawUrl))) {
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
        const inner = u.searchParams.get('url') || u.searchParams.get('id');
        if (inner && (inner.startsWith('http://') || inner.startsWith('https://'))) return decodeURIComponent(inner);
      } catch {}
      return first;
    }
    const candidates = [first.lazy?.directUrl, first.lazy?.url, first.lazy?.id, first.url, first.id];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) {
        if (!candidate.includes('/master.m3u8')) {
          if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
            return candidate;
          }
        } else {
          try {
            const u = new URL(candidate, 'http://localhost');
            const inner = u.searchParams.get('url') || u.searchParams.get('id');
            if (inner && (inner.startsWith('http://') || inner.startsWith('https://'))) return decodeURIComponent(inner);
          } catch {}
        }
      }
    }
    return first.url || first.lazy?.url || (typeof first.lazy?.id === 'string' && first.lazy.id.startsWith('http') ? first.lazy.id : undefined);
  };

  const applyExtractedResult = (extracted: any) => {
    if (!extracted) return;
    if (typeof extracted === 'string') {
      streamUrl = pickResolvedStreamUrl(extracted);
    } else if ('sources' in extracted && Array.isArray(extracted.sources) && extracted.sources.length > 0) {
      const first = extracted.sources[0];
      streamUrl = pickResolvedStreamUrl(first);
      if (first?.subtitles && Array.isArray(first.subtitles)) {
        extractedSubtitles = first.subtitles;
      } else if (extracted.subtitles && Array.isArray(extracted.subtitles)) {
        extractedSubtitles = extracted.subtitles;
      }
    } else if (Array.isArray(extracted) && extracted.length > 0) {
      const first = extracted[0];
      streamUrl = pickResolvedStreamUrl(first);
      if (typeof first === 'object' && first?.subtitles && Array.isArray(first.subtitles)) {
        extractedSubtitles = first.subtitles;
      }
    } else if ('seasons' in extracted && Array.isArray(extracted.seasons)) {
      const reqSeason = parseInt(c.req.query('s') || c.req.query('season') || '1', 10);
      const reqEpisode = parseInt(c.req.query('e') || c.req.query('episode') || '1', 10);
      const voice = c.req.query('voice') || c.req.query('translation');
      const seasonObj = extracted.seasons.find((s: any) => s.season === reqSeason) || extracted.seasons[0];
      const epObj = seasonObj?.episodes?.find((e: any) => e.episode === reqEpisode) || seasonObj?.episodes?.[0];
      if (epObj?.sources?.length) {
        let matchedSource = epObj.sources[0];
        if (voice) {
          const found = epObj.sources.find((s: any) =>
            s.title?.toLowerCase().includes(voice.toLowerCase()) ||
            s.audio?.toLowerCase().includes(voice.toLowerCase())
          );
          if (found) matchedSource = found;
        }
        streamUrl = pickResolvedStreamUrl(matchedSource);
        if (matchedSource?.subtitles && Array.isArray(matchedSource.subtitles)) {
          extractedSubtitles = matchedSource.subtitles;
        }
      }
    } else if (typeof extracted === 'object' && 'url' in extracted) {
      streamUrl = pickResolvedStreamUrl(extracted);
      if (extracted.subtitles && Array.isArray(extracted.subtitles)) {
        extractedSubtitles = extracted.subtitles;
      }
    }
  };

  if (rawUrl) {
    if (rawUrl.includes('.m3u8') && !rawUrl.includes('/master.m3u8')) {
      streamUrl = rawUrl;
    } else {
      try {
        const extracted = await extractVod(rawUrl);
        applyExtractedResult(extracted);
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
      applyExtractedResult(extracted);
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

  // Злитий майстер (одне відео + усі озвучки як аудіогрупи) — плеєр перемикає
  // доріжки на місці, без перезавантаження джерела.
  let preparedManifest: string | undefined;
  if (mergeAudio) {
    try {
      const merged = await buildFenixMergedManifest(c.req.url);
      if (merged) {
        preparedManifest = merged.manifest;
        streamUrl = merged.baseUrl;
        if (merged.subtitles.length > 0) extractedSubtitles = merged.subtitles;
      }
    } catch (err: unknown) {
      logWarn('stream', `mergeAudio failed: ${(err as Error).message}`);
    }
  }

  // 3. Select appropriate headers based on target CDN
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };

  const isAshdi =
    streamUrl.includes('ashdi.vip') ||
    streamUrl.includes('ashdi.me') ||
    streamUrl.includes('0yql3tj') ||
    streamUrl.includes('oyql3tj');
  const isMoon = streamUrl.includes('moonanime.art') || streamUrl.includes('mooncdn') || streamUrl.includes('s.moonanime');
  const isBamboo = streamUrl.includes('bambooua.com');
  const isHdvb = streamUrl.includes('hdvbua.pro') || streamUrl.includes('vidcache');
  const isFranko = streamUrl.includes('factorios.live') || streamUrl.includes('uacdn.online');
  const isTortuga = streamUrl.includes('tortuga.tw') || streamUrl.includes('tortuga.wtf') || streamUrl.includes('tortuga');
  const isZetvideo = streamUrl.includes('zetvideo.net');
  const isUakinoAx = streamUrl.includes('cdn.uakino.ax');
  const isFenix = streamUrl.includes('fenixplay.xyz');

  if (isAshdi) {
    headers['Origin'] = 'https://ashdi.vip';
    headers['Referer'] = 'https://ashdi.vip/';
  } else if (isMoon) {
    headers['Origin'] = 'https://moonanime.art';
    headers['Referer'] = 'https://moonanime.art/';
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
    headers['Accept'] = '*/*';
    headers['Accept-Language'] = 'en-US,en;q=0.9';
    headers['sec-fetch-dest'] = 'empty';
    headers['sec-fetch-mode'] = 'cors';
    headers['sec-fetch-site'] = 'same-site';
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
  } else if (isFenix) {
    headers['Referer'] = 'https://fenixplay.xyz/';
    headers['Origin'] = 'https://fenixplay.xyz';
  } else if (streamUrl.includes('ufdub.com')) {
    headers['Referer'] = 'https://video.ufdub.com/';
  } else if (streamUrl.includes('unimay.media')) {
    headers['Referer'] = 'https://unimay.media/';
    headers['Origin'] = 'https://unimay.media';
  }

  // 4. Fetch manifest and rewrite
  try {
    let manifestData: string;
    const proxyOpts = proxyManager.getConfig(cdn || undefined, streamUrl);
    if (preparedManifest) {
      manifestData = preparedManifest;
    } else try {
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

    // Якщо це одиночний медіа-плейлист, але у нас є субтитри — загортаємо у master playlist для RFC 8216
    if (!isMaster && extractedSubtitles.length > 0 && !c.req.query('_media')) {
      const mediaUrl = `${c.req.url}${c.req.url.includes('?') ? '&' : '?'}_media=1`;
      let masterWrap = '#EXTM3U\n#EXT-X-VERSION:3\n';
      extractedSubtitles.filter((sub) => sub.format !== 'ass').forEach((sub, idx) => {
        const subLang = normalizeSubLang(sub.lang);
        const subLabel = sub.label || `Субтитри ${idx + 1}`;
        const isDefault = idx === 0 ? 'YES' : 'NO';
        const subUri = formatSubtitleUri(sub.url, proxyHost, sub.lang || subLang);
        masterWrap += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${subLabel}",DEFAULT=${isDefault},AUTOSELECT=YES,LANGUAGE="${subLang}",URI="${subUri}"\n`;
      });
      masterWrap += `#EXT-X-STREAM-INF:BANDWIDTH=3000000,SUBTITLES="subs"\n${mediaUrl}\n`;
      return c.text(masterWrap, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
    }

    const cachedM3u8 = m3u8PlaylistCache.get<string>(cacheKey);
    if (cachedM3u8) {
      return c.text(cachedM3u8, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': isMaster ? 'no-cache' : 'public, max-age=3600',
      });
    }

    const modifiedM3u8 = parseMasterPlaylist(
      // uakino.ax вклеює власне інтро на початок медіа-плейлиста — вирізаємо його
      isUakinoAx && !isMaster ? stripUakinoAxIntro(manifestData) : manifestData,
      streamUrl,
      proxyHost,
      {
        // CORS-проксі потрібен лише ashdi: його сегменти віддаються з жорстким
        // Access-Control-Allow-Origin: https://ashdi.vip і вимагають Referer.
        // Решта CDN (moonanime, dawn, zetvideo, hdvb, fenix, bamboo) мають
        // дозвільний CORS, тому браузер тягне їхні сегменти напряму.
        corsProxySegments: isAshdi,
        // сегменти uakino.ax підписані на IP сервера, тому тягнемо їх самі
        segmentProxyBase: isUakinoAx ? `${proxyHost}/segment?url=` : undefined,
        subtitles: extractedSubtitles.filter((sub) => sub.format !== 'ass'),
        voice: c.req.query('voice') || c.req.query('translation'),
      }
    );

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
