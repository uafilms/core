import { Hono } from 'hono';
import {
  extractVod,
  stripUakinoAxIntro,
  buildFenixMergedManifest,
  getCdnStreamHeaders,
  getCdnSubtitleHeaders,
  getCdnSegmentHeaders,
  resolveDirectVideoUrl,
} from '../../providers/cdn/index.js';
import { parseMasterPlaylist, stripCorsProxy, formatSubtitleUri, normalizeSubLang } from '../../utils/m3u8.js';
import { getActiveCorsProxy } from '../../utils/corsProxy.js';
import { logWarn, logError } from '../../utils/logger.js';
import { m3u8PlaylistCache } from '../services/cache.js';
import { proxyManager } from '../../utils/proxyManager.js';
import type { Subtitle } from '../../types/media.js';
import { TmdbService } from '../services/tmdb.js';
import { OrchestratorService } from '../services/orchestrator.js';
import { getClientIp } from '../services/security.js';
import { detectCdn } from '../../utils/cdn.js';
import {
  StreamGuardError,
  acquireSegmentSlot,
  assertSafeUpstreamUrl,
  fetchBufferLimited,
  fetchTextLimited,
  isAssContent,
  isBinarySegmentContentType,
  isM3u8Content,
  isTooLargeError,
  isVttContent,
  consumeSegmentBytes,
  getStreamClientIp,
  segmentByteBudgetAvailable,
  streamGuardMiddleware,
  STREAM_LIMITS,
} from './guard.js';
import { verifyStreamTarget } from '../../utils/streamSign.js';

export const streamRouter = new Hono();

function guardErrorStatus(err: unknown): 400 | 403 | 413 | 429 | 502 | 503 {
  if (isTooLargeError(err)) return 413;
  return err instanceof StreamGuardError ? err.status : 502;
}

function isSubtitleTarget(url: string): boolean {
  return (
    url.endsWith('.vtt') ||
    url.endsWith('.srt') ||
    url.includes('/subtitle/') ||
    url.includes('/hls/sub/') ||
    url.includes('/subtitles/') ||
    /\.(vtt|srt)\?/i.test(url)
  );
}

function isPlaylistTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\.m3u8$/i.test(parsed.pathname);
  } catch {
    return /\.m3u8(\?|$)/i.test(url);
  }
}

function envInt(name: string, fallback: number): number {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function signedProxyUrlsRequired(): boolean {
  return process.env.STREAM_REQUIRE_SIGNED_URLS !== 'false';
}

interface CachedPlaylist {
  body: string;
  cacheControl: string;
}

// Роут для прямих посилань на відтворення серій у плейлістах Lampa та external плеєрів
const handleDirectPlay = async (c: any) => {
  const query = c.req.query();
  const id = query.id;
  const sParam = query.s || '1';
  const eParam = query.e || '1';
  const media = (query.type || (query.s ? 'tv' : 'movie')) as 'movie' | 'tv';
  const provider = query.provider;
  const requestedProvider = (provider || '').replace(/^★\s*/, '').trim().toLowerCase();
  let cdnFilter: string | undefined;
  if (requestedProvider && requestedProvider !== 'uafilms') {
    const detected = detectCdn({
      url: `/master.m3u8?cdn=${encodeURIComponent(requestedProvider)}`,
    }).id;
    if (detected !== 'unknown') {
      cdnFilter = detected === 'uakinoax' ? 'uakino-ax' : detected;
    }
  }
  const voice = query.voice;
  const voiceMatches = (source: any): boolean => {
    if (!voice) return true;
    const clean = voice.toLowerCase().trim();
    const value = (
      source.studio?.name ||
      source.audioTracks?.[0] ||
      source.audio ||
      source.title ||
      ''
    )
      .toLowerCase()
      .trim();
    return value === clean || value.includes(clean) || clean.includes(value);
  };
  const abortWhenSourceReady = cdnFilter
    ? (sources: any[]) =>
        sources.some((source) => source.provider?.id === cdnFilter && voiceMatches(source))
    : undefined;
  const platform = (query.platform || 'web') as any;
  const corsParam = query.cors;
  const corsProxy = corsParam === undefined ? undefined : corsParam === '1' || corsParam === 'true';

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
      corsProxy,
      providerId: undefined,
      cdnId: cdnFilter,
      providerTimeoutMs: cdnFilter ? 10000 : 0,
      abortWhen: abortWhenSourceReady,
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

streamRouter.get('/play.m3u8', streamGuardMiddleware, handleDirectPlay);
streamRouter.get('/play.mp4', streamGuardMiddleware, handleDirectPlay);
streamRouter.get('/play', streamGuardMiddleware, handleDirectPlay);

// HLS Media Playlist для субтитрів (/subs.m3u8)
streamRouter.get('/subs.m3u8', streamGuardMiddleware, async (c) => {
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
  if (query.sig) params.set('sig', query.sig);

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
streamRouter.get('/subs.vtt', streamGuardMiddleware, async (c) => {
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

  if (rawUrl && signedProxyUrlsRequired() && !verifyStreamTarget(rawUrl, query.sig)) {
    return c.text('WEBVTT\n\n', 403, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }

  try {
    const subUrl = stripCorsProxy(targetUrl);
    const subHeaders = getCdnSubtitleHeaders(subUrl, cdn || undefined);

    const proxyOpts = proxyManager.getConfig(cdn || undefined, subUrl);
    const fetched = await fetchTextLimited(subUrl, {
      headers: subHeaders,
      timeoutMs: 10000,
      maxBytes: STREAM_LIMITS.subtitleBytes,
      axiosConfig: proxyOpts,
    });

    let content = fetched.data;

    if (!isVttContent(content)) {
      logWarn('stream', `subtitle proxy rejected non-VTT content: ${subUrl.slice(0, 120)}`);
      return c.text('WEBVTT\n\n', 502, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
    }

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
streamRouter.get('/subs.ass', streamGuardMiddleware, async (c) => {
  const query = c.req.query();
  const cdn = query.cdn;
  const targetUrl = query.url;

  if (!targetUrl) {
    return c.text('', 404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }

  if (signedProxyUrlsRequired() && !verifyStreamTarget(targetUrl, query.sig)) {
    return c.text('', 403, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
  }

  try {
    const subUrl = stripCorsProxy(targetUrl);
    const subHeaders = getCdnSubtitleHeaders(subUrl, cdn || undefined);

    const proxyOpts = proxyManager.getConfig(cdn || undefined, subUrl);
    const fetched = await fetchTextLimited(subUrl, {
      headers: subHeaders,
      timeoutMs: 15000,
      maxBytes: STREAM_LIMITS.assBytes,
      axiosConfig: proxyOpts,
    });

    const content = fetched.data;

    if (!isAssContent(content)) {
      logWarn('stream', `ass subtitle proxy rejected non-ASS content: ${subUrl.slice(0, 120)}`);
      return c.text('', 502, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
    }

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
streamRouter.get('/segment', streamGuardMiddleware, async (c) => {
  const target = stripCorsProxy(c.req.query('url') || '');
  if (!target || !/^https?:\/\//i.test(target)) {
    return c.text('Bad url', 400, { 'Access-Control-Allow-Origin': '*' });
  }

  const signatureRequired = process.env.STREAM_REQUIRE_SIGNED_SEGMENTS !== 'false';
  if (signatureRequired && !verifyStreamTarget(target, c.req.query('sig'))) {
    return c.text('Signed segment URL required', 403, { 'Access-Control-Allow-Origin': '*' });
  }

  const clientIp = getStreamClientIp(c);
  const hasClientIp = Boolean(clientIp && clientIp !== 'unknown');

  if (hasClientIp && !segmentByteBudgetAvailable(clientIp)) {
    return c.text('Daily segment traffic quota exceeded', 429, {
      'Access-Control-Allow-Origin': '*',
      'Retry-After': '3600',
    });
  }

  const release = acquireSegmentSlot();
  if (!release) {
    return c.text('Too many concurrent segment requests', 503, {
      'Access-Control-Allow-Origin': '*',
      'Retry-After': '2',
    });
  }

  try {
    const range = c.req.header('range');
    const reqHeaders: Record<string, string> = {
      ...getCdnSegmentHeaders(target),
      ...(range ? { Range: range } : {}),
    };

    const res = await fetchBufferLimited(target, {
      headers: reqHeaders,
      timeoutMs: 20000,
      maxBytes: STREAM_LIMITS.segmentBytes,
    });

    if (hasClientIp) {
      consumeSegmentBytes(clientIp, res.data.byteLength || 0);
    }

    if (res.status >= 400) {
      logWarn('stream', `segment fetch failed ${res.status}: ${target.slice(0, 120)}`);
      return c.text(`Segment upstream error ${res.status}`, 502, { 'Access-Control-Allow-Origin': '*' });
    }

    const upstreamContentType = String(res.headers['content-type'] || '');
    if (!isBinarySegmentContentType(upstreamContentType)) {
      logWarn('stream', `segment proxy rejected non-media content: ${upstreamContentType}`);
      return c.text('Segment upstream returned non-media content', 502, {
        'Access-Control-Allow-Origin': '*',
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': upstreamContentType || (target.includes('.m4s') || target.includes('.mp4') ? 'video/iso.segment' : 'video/mp2t'),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    };
    if (res.headers['content-range']) headers['Content-Range'] = String(res.headers['content-range']);
    if (res.headers['accept-ranges']) headers['Accept-Ranges'] = String(res.headers['accept-ranges']);
    if (res.headers['content-length']) headers['Content-Length'] = String(res.headers['content-length']);

    return c.body(res.data as ArrayBuffer, res.status as 200 | 206, headers);
  } catch (err: unknown) {
    if (isTooLargeError(err)) {
      logWarn('stream', `segment too large: ${target.slice(0, 120)}`);
      return c.text('Segment exceeds size limit', 413, { 'Access-Control-Allow-Origin': '*' });
    }

    const status = guardErrorStatus(err);
    if (status !== 502) {
      logWarn('stream', `segment blocked (${status}): ${(err as Error).message}`);
      return c.text((err as Error).message, status, { 'Access-Control-Allow-Origin': '*' });
    }

    logWarn('stream', `segment proxy error: ${(err as Error).message}`);
    return c.text('Segment fetch error', 502, { 'Access-Control-Allow-Origin': '*' });
  } finally {
    release();
  }
});

function fixRedirectLocation(location: string): string {
  try {
    const utf8 = Buffer.from(location, 'latin1').toString('utf8');
    return encodeURI(utf8);
  } catch {
    return encodeURI(location);
  }
}

streamRouter.get('/video.mp4', streamGuardMiddleware, async (c) => {
  const target = stripCorsProxy(c.req.query('url') || '');
  const cdn = c.req.query('cdn');
  const id = c.req.query('id');
  const clientIp = getClientIp(c);

  const idTarget = id && /^https?:\/\//i.test(id) ? id : '';
  const candidateTarget = target || idTarget;

  if (signedProxyUrlsRequired() && target && !verifyStreamTarget(target, c.req.query('sig'))) {
    return c.text('Signed URL required', 403, { 'Access-Control-Allow-Origin': '*' });
  }

  if (signedProxyUrlsRequired() && idTarget && !verifyStreamTarget(idTarget, c.req.query('sig'))) {
    return c.text('Signed URL required', 403, { 'Access-Control-Allow-Origin': '*' });
  }

  if (candidateTarget) {
    try {
      await assertSafeUpstreamUrl(candidateTarget);
    } catch (err: unknown) {
      return c.text((err as Error).message, guardErrorStatus(err), {
        'Access-Control-Allow-Origin': '*',
      });
    }
  }

  const finalUrl = await resolveDirectVideoUrl({ target, cdn, id, clientIp });
  if (!finalUrl) {
    return c.text('Bad url', 400, { 'Access-Control-Allow-Origin': '*' });
  }

  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return c.redirect(finalUrl, 302);
});

streamRouter.get('/master.m3u8', streamGuardMiddleware, async (c) => {
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
  if (rawUrl && isSubtitleTarget(rawUrl)) {
    if (signedProxyUrlsRequired() && !verifyStreamTarget(rawUrl, query.sig)) {
      return c.text('#EXTM3U\n#EXT-X-ERROR: Signed URL required', 403, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
      });
    }

    const sigSuffix = query.sig ? `&sig=${encodeURIComponent(query.sig)}` : '';
    return c.redirect(`/subs.vtt?url=${encodeURIComponent(rawUrl)}${sigSuffix}`);
  }

  if (rawUrl && !isSubtitleTarget(rawUrl)) {
    // Будь-який `url=` сюди має приходити з нашим підписом. Інакше
    // /master.m3u8 стає відкритим проксі для довільних m3u8/embed-URL.
    if (signedProxyUrlsRequired() && !verifyStreamTarget(rawUrl, query.sig)) {
      return c.text('#EXTM3U\n#EXT-X-ERROR: Signed URL required', 403, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
      });
    }

    if (!isPlaylistTarget(rawUrl)) {
      try {
        await assertSafeUpstreamUrl(rawUrl);
      } catch (err: unknown) {
        return c.text(`#EXTM3U\n#EXT-X-ERROR: ${(err as Error).message}`, guardErrorStatus(err), {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
        });
      }
    }
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
  const detectedCdn = detectCdn({ url: streamUrl }, cdn).id;
  const isAshdi = detectedCdn === 'ashdi';
  const isUakinoAx = detectedCdn === 'uakino-ax' || streamUrl.includes('cdn.uakino.ax');

  const corsQuery = c.req.query('cors');
  const corsValues = corsQuery
    ? corsQuery.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const corsActive = corsValues.length > 0 && (
    corsValues.includes('1') ||
    corsValues.includes('true') ||
    corsValues.includes('all') ||
    corsValues.includes(detectedCdn) ||
    (Boolean(cdn) && corsValues.includes(cdn!.toLowerCase()))
  );

  const headers = getCdnStreamHeaders(streamUrl, cdn || undefined);

  const host = c.req.header('host') || 'localhost:3000';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const proxyHost = `${proto}://${host}`;

  const corsCacheTag = corsActive ? `${corsQuery || 'cors'}:${getActiveCorsProxy() || 'none'}` : 'direct';
  const cacheKey = [
    proxyHost,
    streamUrl,
    cdn || '',
    extractedSubtitles.length,
    corsCacheTag,
    c.req.query('voice') || '',
    c.req.query('translation') || '',
    mergeAudio ? 'merge' : 'plain',
    c.req.query('_media') || '',
  ].join(':');

  const cachedPlaylist = m3u8PlaylistCache.get<CachedPlaylist | string>(cacheKey);
  if (cachedPlaylist) {
    const cachedBody = typeof cachedPlaylist === 'string' ? cachedPlaylist : cachedPlaylist.body;
    const cachedCacheControl =
      typeof cachedPlaylist === 'string'
        ? 'public, max-age=3600'
        : cachedPlaylist.cacheControl || 'public, max-age=3600';

    return c.text(cachedBody, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cachedCacheControl,
    });
  }

  // 4. Fetch manifest and rewrite
  try {
    let manifestData: string;
    const proxyOpts = proxyManager.getConfig(cdn || undefined, streamUrl);
    if (preparedManifest) {
      manifestData = preparedManifest;
    } else try {
      const fetched = await fetchTextLimited(streamUrl, {
        headers,
        timeoutMs: 10000,
        maxBytes: STREAM_LIMITS.manifestBytes,
        axiosConfig: proxyOpts,
      });
      manifestData = fetched.data;
    } catch (fetchErr: unknown) {
      logWarn('stream', `Failed fetching manifest from ${streamUrl}: ${(fetchErr as any).message}`);
      if ((fetchErr as any).response) {
        logWarn('stream', `Fetch response data: ${JSON.stringify((fetchErr as any).response.data)}`);
      }
      // Якщо Ashdi повернув помилку (наприклад, 404) на відновлений потік 1080/720/2160 — пробуємо резервний 480
      if (streamUrl.includes('ashdi.vip') && /\/hls\/(?:1080|2160|1440|720)\//.test(streamUrl)) {
        const fallbackUrl = streamUrl.replace(/\/hls\/(?:1080|2160|1440|720)\//, '/hls/480/');
        const fallbackRes = await fetchTextLimited(fallbackUrl, {
          headers,
          timeoutMs: 10000,
          maxBytes: STREAM_LIMITS.manifestBytes,
          axiosConfig: proxyOpts,
        });
        manifestData = fallbackRes.data;
      } else {
        throw fetchErr;
      }
    }

    if (!isM3u8Content(manifestData)) {
      logWarn('stream', `Upstream did not return an m3u8 playlist: ${streamUrl.slice(0, 120)}`);
      return c.text('#EXTM3U\n#EXT-X-ERROR: Upstream did not return a valid playlist', 502, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
      });
    }

    const isMaster = manifestData.includes('#EXT-X-STREAM-INF');
    // VOD-плейлисти статичні, тому їх можна кешувати на годину.
    // Live (без #EXT-X-ENDLIST) — лише на кілька секунд, інакше плеєр відстає.
    const isLive = !isMaster && !manifestData.includes('#EXT-X-ENDLIST');
    const cacheTtlSeconds = isLive
      ? envInt('STREAM_LIVE_PLAYLIST_CACHE_TTL_SECONDS', 5)
      : envInt('STREAM_PLAYLIST_CACHE_TTL_SECONDS', 3600);
    const cacheTtlMs = cacheTtlSeconds * 1000;
    const cacheControl = `public, max-age=${cacheTtlSeconds}`;

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
      m3u8PlaylistCache.set(cacheKey, { body: masterWrap, cacheControl }, cacheTtlMs);
      return c.text(masterWrap, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': cacheControl,
      });
    }

    const modifiedM3u8 = parseMasterPlaylist(
      // uakino.ax вклеює власне інтро на початок медіа-плейлиста — вирізаємо його
      isUakinoAx && !isMaster ? stripUakinoAxIntro(manifestData) : manifestData,
      streamUrl,
      proxyHost,
      {
        // CORS-проксі додається до сегментів лише коли передано відповідний параметр ?cors=...
        // Клієнти, які підтримують пряме відтворення (Lampa), не передають ?cors= і тягнуть сегменти напряму.
        corsProxySegments: corsActive,
        corsParam: corsQuery || undefined,
        // сегменти uakino.ax підписані на IP сервера, тому тягнемо їх самі
        segmentProxyBase: isUakinoAx ? `${proxyHost}/segment?url=` : undefined,
        subtitles: extractedSubtitles.filter((sub) => sub.format !== 'ass'),
        voice: c.req.query('voice') || c.req.query('translation'),
      }
    );

    m3u8PlaylistCache.set(cacheKey, { body: modifiedM3u8, cacheControl }, cacheTtlMs);

    return c.text(modifiedM3u8, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cacheControl,
    });
  } catch (err: unknown) {
    logError('stream', `m3u8 fetch error: ${(err as Error).message}`);
    return c.text(`#EXTM3U\n#EXT-X-ERROR: ${(err as Error).message}`, guardErrorStatus(err), {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
    });
  }
});
