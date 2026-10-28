import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { MediaType, MediaMetadata } from '../../types/media.js';
import type { OmssSource } from '../types.js';
import { TmdbService } from '../services/tmdb.js';
import { OrchestratorService } from '../services/orchestrator.js';
import { getClientIp } from '../services/security.js';

export const lampacRouter = new Hono();

// Memory cache for life events tracking
const lifeEventsCache = new Map<string, { balancers: any[]; expires: number }>();

function cleanupLifeEventsCache() {
  const now = Date.now();
  for (const [k, v] of lifeEventsCache.entries()) {
    if (v.expires < now) lifeEventsCache.delete(k);
  }
}

// 7 exact CDN balancers
const CDN_BALANCERS: { id: string; name: string }[] = [
  { id: 'ashdi', name: 'Ashdi' },
  { id: 'bamboo', name: 'Bamboo' },
  { id: 'tortuga', name: 'Tortuga' },
  { id: 'fenix', name: 'Fenix' },
  { id: 'moonanime', name: 'MoonAnime' },
  { id: 'hdvbua', name: 'HdvbUA' },
  { id: 'zetvideo', name: 'ZetVideo' },
  { id: 'sniplyo', name: 'Sniplyo' },
];

function matchesCdn(source: OmssSource, cdnSlug: string): boolean {
  const target = cdnSlug.toLowerCase();
  const cdnId = source.provider?.id?.toLowerCase() || '';
  const cdnName = source.provider?.name?.toLowerCase() || '';
  const url = source.url?.toLowerCase() || '';

  if (target === 'hdvbua' || target === 'hdvb') {
    return (
      cdnId === 'hdvb' ||
      cdnId === 'hdvbua' ||
      cdnName.includes('hdvb') ||
      url.includes('cdn=hdvb')
    );
  }

  if (target === 'bamboo' || target === 'bambooua') {
    return (
      cdnId === 'bamboo' ||
      cdnId === 'bambooua' ||
      cdnName.includes('bamboo') ||
      url.includes('cdn=bamboo')
    );
  }

  if (target === 'moonanime' || target === 'moon') {
    return (
      cdnId === 'moonanime' ||
      cdnId === 'moon' ||
      cdnId === 'dawn' ||
      cdnName.includes('moon') ||
      url.includes('cdn=moon') ||
      url.includes('cdn=dawn')
    );
  }

  if (target === 'uafilms') {
    return true;
  }

  return cdnId === target || cdnName.includes(target) || url.includes(`cdn=${target}`);
}

function getBaseUrl(c: any): string {
  const proto = c.req.header('x-forwarded-proto') || (c.req.url.startsWith('https') ? 'https' : 'http');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
  const path: string = c.req.path || '';
  const isPrefixedWithL = path.startsWith('/l/') || path === '/l';
  const basePath = isPrefixedWithL ? '/l' : '';
  return `${proto}://${host}${basePath}`;
}

function shouldReturnJson(c: any): boolean {
  const rjson = c.req.query('rjson');
  if (rjson === 'true' || rjson === '1') return true;
  const accept = c.req.header('accept') || '';
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  return false;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveMediaMeta(query: {
  id?: string;
  tmdb_id?: string;
  imdb_id?: string;
  title?: string;
  original_title?: string;
  year?: string;
  serial?: string;
}): Promise<{ meta: MediaMetadata; type: MediaType } | null> {
  const isSerial = query.serial === '1';
  const mediaType: MediaType = isSerial ? 'tv' : 'movie';
  const targetId = query.id || query.tmdb_id;

  if (targetId && (targetId.startsWith('tt') || /^\d+$/.test(targetId))) {
    const meta = await TmdbService.getMetadata(targetId, mediaType);
    if (meta) return { meta, type: mediaType };
  }

  if (query.imdb_id && query.imdb_id.startsWith('tt')) {
    const meta = await TmdbService.getMetadata(query.imdb_id, mediaType);
    if (meta) return { meta, type: mediaType };
  }

  const title = query.title || query.original_title;
  if (title) {
    try {
      const searchRes = await TmdbService.search(title);
      if (searchRes && searchRes.results && searchRes.results.length > 0) {
        const match = searchRes.results.find((r: any) => r.media_type === mediaType) || searchRes.results[0];
        if (match) {
          const meta = await TmdbService.getMetadata(String(match.id), mediaType);
          if (meta) return { meta, type: mediaType };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function buildCdnBalancersList(baseUrl: string, queryParams: URLSearchParams) {
  return CDN_BALANCERS.map((b, idx) => ({
    name: b.name,
    url: `${baseUrl}/lite/${b.id}?${queryParams.toString()}`,
    balanser: b.id,
    index: idx,
    show: true,
  }));
}

// 1. Lampac withsearch & spider
lampacRouter.get('/lite/withsearch', (c) =>
  c.json(['ashdi', 'bamboo', 'tortuga', 'fenix', 'moonanime', 'hdvbua', 'zetvideo', 'sniplyo', 'uafilms'])
);
lampacRouter.get('/lite/spider', (c) => {
  const baseUrl = getBaseUrl(c);
  const title = c.req.query('title') || '';
  const encTitle = encodeURIComponent(title);
  const res: Record<string, string> = {};
  for (const b of CDN_BALANCERS) {
    res[b.name] = `${baseUrl}/lite/${b.id}?title=${encTitle}&clarification=1&rjson=true&similar=true`;
  }
  return c.json(res);
});
lampacRouter.get('/lite/spider/anime', (c) => {
  const baseUrl = getBaseUrl(c);
  const title = c.req.query('title') || '';
  const encTitle = encodeURIComponent(title);
  const res: Record<string, string> = {};
  for (const b of CDN_BALANCERS) {
    res[b.name] = `${baseUrl}/lite/${b.id}?title=${encTitle}&clarification=1&rjson=true&similar=true`;
  }
  return c.json(res);
});

// 2. Lampac externalids
lampacRouter.get('/externalids', (c) => {
  const imdb_id = c.req.query('imdb_id') || '';
  const kinopoisk_id = c.req.query('kinopoisk_id') || null;
  return c.json({ imdb_id, kinopoisk_id });
});

// 3. Lampac events: /lite/events -> returns 7 CDNs: Ashdi, Bamboo, Tortuga, Fenix, MoonAnime, HdvbUA, ZetVideo
lampacRouter.get('/lite/events', (c) => {
  const checksearch = c.req.query('checksearch');
  const serial = c.req.query('serial');
  const isSerial = serial === '1';

  // Fast path for checksearch probe
  if (checksearch === 'true' || checksearch === '1') {
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.text('{"show":true,"data-json=":true}');
  }

  const baseUrl = getBaseUrl(c);
  const id = c.req.query('id') || c.req.query('tmdb_id') || '';
  const imdb_id = c.req.query('imdb_id') || '';
  const title = c.req.query('title') || '';
  const original_title = c.req.query('original_title') || '';
  const year = c.req.query('year') || '';
  const life = c.req.query('life') === 'true';

  const queryParams = new URLSearchParams({
    id,
    imdb_id,
    serial: serial || '0',
    title,
    original_title,
    year,
  });

  const balancers = buildCdnBalancersList(baseUrl, queryParams);

  if (life) {
    cleanupLifeEventsCache();
    const memkey = randomUUID();
    lifeEventsCache.set(memkey, {
      balancers,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return c.json({
      life: true,
      memkey,
      title: title || original_title || undefined,
    });
  }

  return c.json(balancers);
});

// 4. Lampac lifeevents: /lifeevents
lampacRouter.get('/lifeevents', (c) => {
  const baseUrl = getBaseUrl(c);
  const memkey = c.req.query('memkey') || '';
  const cached = memkey ? lifeEventsCache.get(memkey) : undefined;

  let balancers: any[];
  if (cached) {
    balancers = cached.balancers;
  } else {
    const id = c.req.query('id') || '';
    const imdb_id = c.req.query('imdb_id') || '';
    const serial = c.req.query('serial') || '0';
    const title = c.req.query('title') || '';
    const original_title = c.req.query('original_title') || '';
    const year = c.req.query('year') || '';

    const queryParams = new URLSearchParams({
      id,
      imdb_id,
      serial,
      title,
      original_title,
      year,
    });
    balancers = buildCdnBalancersList(baseUrl, queryParams);
  }

  return c.json({
    ready: true,
    tasks: balancers.length,
    online: balancers,
  });
});

// 5. Lampac CDN Balancer Handler: /lite/:cdn
async function handleCdnBalancer(c: any) {
  const cdnSlug = c.req.param('cdn') || c.req.param('provider') || 'uafilms';
  const checksearch = c.req.query('checksearch');
  if (checksearch === 'true' || checksearch === '1') {
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.text('{"show":true,"data-json=":true}');
  }

  const query = {
    id: c.req.query('id'),
    tmdb_id: c.req.query('tmdb_id'),
    imdb_id: c.req.query('imdb_id'),
    title: c.req.query('title'),
    original_title: c.req.query('original_title'),
    year: c.req.query('year'),
    serial: c.req.query('serial'),
  };

  const resolved = await resolveMediaMeta(query);
  if (!resolved) {
    if (shouldReturnJson(c)) {
      return c.json({ accsdb: true, msg: 'Медіа не знайдено' });
    }
    return c.html('<div class="empty">Медіа не знайдено</div>');
  }

  const { meta, type } = resolved;
  const baseUrl = getBaseUrl(c);
  const proto = c.req.header('x-forwarded-proto') || (c.req.url.startsWith('https') ? 'https' : 'http');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
  const proxyHost = `${proto}://${host}`;
  const clientIp = getClientIp(c);
  const asJson = shouldReturnJson(c);

  const encTitle = encodeURIComponent(meta.title || query.title || '');
  const encOrig = encodeURIComponent(meta.originalTitle || query.original_title || '');
  const rjsonParam = asJson ? '&rjson=true' : '';

  // ── TV Series Branch ──
  if (type === 'tv') {
    const sParam = c.req.query('s');
    const hasSeason = sParam !== undefined && sParam !== null && sParam !== '' && sParam !== '-1';

    if (!hasSeason) {
      // Step 1: Return Seasons list
      const details = await TmdbService.getDetails(String(meta.id), 'tv');
      let seasonNumbers: number[] = [];
      if (details?.seasons?.length) {
        seasonNumbers = details.seasons
          .filter((sn) => sn.seasonNumber > 0)
          .map((sn) => sn.seasonNumber);
      }
      if (seasonNumbers.length === 0) {
        seasonNumbers = [1];
      }

      const seasonsData = seasonNumbers.map((sn) => ({
        name: `${sn} сезон`,
        url: `${baseUrl}/lite/${cdnSlug}?id=${meta.id}&imdb_id=${meta.imdbId || ''}&serial=1&s=${sn}&title=${encTitle}&original_title=${encOrig}&year=${meta.year || query.year || ''}${rjsonParam}`,
        id: String(sn),
      }));

      if (asJson) {
        return c.json({
          quality: '1080p',
          voice: [],
          data: seasonsData,
        });
      }

      const html = `
<div class="videos__line">
  ${seasonsData
    .map(
      (s, idx) => `
    <div class="videos__item videos__season selector ${idx === 0 ? 'focused' : ''}" data-json='${JSON.stringify(s)}'>
      <div class="videos__season-layers"></div>
      <div class="videos__item-imgbox videos__season-imgbox">
        <div class="videos__item-title videos__season-title">${escapeHtml(s.name)}</div>
      </div>
    </div>
  `
    )
    .join('')}
</div>`;
      return c.html(html);
    }

    // Step 2: Return Voice translations and Episodes for chosen Season
    const seasonNum = Number(sParam);
    const seasonDetails = await TmdbService.getSeasonDetails(String(meta.id), seasonNum);
    let episodeNumbers: { num: number; name: string }[] = [];

    if (seasonDetails?.episodes?.length) {
      episodeNumbers = seasonDetails.episodes.map((ep) => ({
        num: ep.episodeNumber,
        name: ep.name || `${ep.episodeNumber} серія`,
      }));
    } else {
      const details = await TmdbService.getDetails(String(meta.id), 'tv');
      const matchedSeason = details?.seasons?.find((sn) => sn.seasonNumber === seasonNum);
      const count = matchedSeason?.episodeCount || 12;
      episodeNumbers = Array.from({ length: count }, (_, i) => ({
        num: i + 1,
        name: `${i + 1} серія`,
      }));
    }

    const tParam = c.req.query('t');
    const selectedVoiceIndex = tParam !== undefined && tParam !== null && tParam !== '' ? Number(tParam) : -1;

    // Discover voices/translations available on this CDN for this season
    let voiceItems: { name: string; active: boolean; link: string }[] = [];
    try {
      const probeRes = await OrchestratorService.resolveSources({
        meta,
        type: 'tv',
        season: seasonNum,
        episode: 1,
        platform: 'tv',
        proxyHost,
        clientIp,
      });

      const filteredProbeSources = (probeRes.sources || []).filter((s) => matchesCdn(s, cdnSlug));

      if (filteredProbeSources.length > 0) {
        voiceItems = filteredProbeSources.map((src, idx) => {
          const audioName = src.studio?.name || (src.audioTracks?.length ? src.audioTracks.join(', ') : '');
          const label = audioName || `${src.provider.name} (${src.quality || 'Auto'})`;
          const isActive = selectedVoiceIndex >= 0 ? selectedVoiceIndex === idx : idx === 0;
          return {
            name: label,
            active: isActive,
            link: `${baseUrl}/lite/${cdnSlug}?id=${meta.id}&imdb_id=${meta.imdbId || ''}&serial=1&s=${seasonNum}&t=${idx}&title=${encTitle}&original_title=${encOrig}&year=${meta.year || query.year || ''}${rjsonParam}`,
          };
        });
      }
    } catch {
      // ignore probe errors
    }

    const tQuery = selectedVoiceIndex >= 0 ? `&t=${selectedVoiceIndex}` : '';
    const episodeItems = episodeNumbers.map((ep) => {
      const videoUrl = `${baseUrl}/lite/${cdnSlug}/video.m3u8?id=${meta.id}&imdb_id=${meta.imdbId || ''}&s=${seasonNum}&e=${ep.num}&title=${encTitle}${tQuery}`;
      return {
        method: 'play',
        url: videoUrl,
        stream: videoUrl,
        s: seasonNum,
        e: ep.num,
        name: ep.name,
        title: `${meta.title} (${ep.num} серія)`,
      };
    });

    if (asJson) {
      return c.json({
        voice: voiceItems,
        data: episodeItems,
      });
    }

    const voiceHtml = voiceItems.length
      ? `
<div class="videos__line">
  ${voiceItems
    .map(
      (v) => `
    <div class="videos__button selector ${v.active ? 'active' : ''}" data-json='${JSON.stringify(v)}'>
      ${escapeHtml(v.name)}
    </div>
  `
    )
    .join('')}
</div>`
      : '';

    const html = `
${voiceHtml}
<div class="videos__line">
  ${episodeItems
    .map(
      (ep, idx) => `
    <div class="videos__item videos__episode selector ${idx === 0 && !voiceItems.length ? 'focused' : ''}" s="${ep.s}" e="${ep.e}" data-json='${JSON.stringify(ep)}'>
      <div class="videos__item-imgbox videos__episode-imgbox"></div>
      <div class="videos__item-title">${escapeHtml(ep.name)}</div>
    </div>
  `
    )
    .join('')}
</div>`;
    return c.html(html);
  }

  // ── Movie Branch ──
  const result = await OrchestratorService.resolveSources({
    meta,
    type: 'movie',
    platform: 'tv',
    proxyHost,
    clientIp,
  });

  const sources = (result.sources || []).filter((s) => matchesCdn(s, cdnSlug));

  if (sources.length === 0) {
    if (asJson) {
      return c.json({ accsdb: true, msg: 'На даному CDN не знайдено' });
    }
    return c.html('<div class="empty">На даному CDN не знайдено</div>');
  }

  const tParam = c.req.query('t');
  const selectedVoiceIndex = tParam !== undefined && tParam !== null && tParam !== '' ? Number(tParam) : -1;

  // Build Voice translations buttons for this CDN
  const voiceItems = sources.map((src, idx) => {
    const audioName = src.studio?.name || (src.audioTracks?.length ? src.audioTracks.join(', ') : '');
    const qualityLabel = src.quality ? ` (${src.quality})` : '';
    const label = audioName ? `${audioName}${qualityLabel}` : `${src.provider.name}${qualityLabel}`;
    const isActive = selectedVoiceIndex >= 0 ? selectedVoiceIndex === idx : idx === 0;
    return {
      name: label,
      active: isActive,
      link: `${baseUrl}/lite/${cdnSlug}?id=${meta.id}&imdb_id=${meta.imdbId || ''}&serial=0&t=${idx}&title=${encTitle}&original_title=${encOrig}&year=${meta.year || query.year || ''}${rjsonParam}`,
    };
  });

  // If a specific voice was clicked, display that voice; otherwise display all available voice options as playable cards
  const displaySources = selectedVoiceIndex >= 0 && sources[selectedVoiceIndex]
    ? [sources[selectedVoiceIndex]]
    : sources;

  const movieItems = displaySources.map((src) => {
    const audioName = src.studio?.name || (src.audioTracks?.length ? src.audioTracks.join(', ') : '');
    const qualityLabel = src.quality ? ` (${src.quality})` : '';
    const voiceOrQuality = audioName ? `${audioName}${qualityLabel}` : `${src.provider.name}${qualityLabel}`;
    return {
      method: 'play',
      url: src.url,
      stream: src.url,
      quality: src.quality || '1080p',
      voiceOrQuality,
      title: `${meta.title} (${voiceOrQuality})`,
    };
  });

  if (asJson) {
    return c.json({
      voice: voiceItems.length > 1 ? voiceItems : [],
      data: movieItems,
    });
  }

  const voiceHtml = voiceItems.length > 1
    ? `
<div class="videos__line">
  ${voiceItems
    .map(
      (v) => `
    <div class="videos__button selector ${v.active ? 'active' : ''}" data-json='${JSON.stringify(v)}'>
      ${escapeHtml(v.name)}
    </div>
  `
    )
    .join('')}
</div>`
    : '';

  const html = `
${voiceHtml}
<div class="videos__line">
  ${movieItems
    .map(
      (m, idx) => `
    <div class="videos__item videos__movie selector ${idx === 0 ? 'focused' : ''}" data-json='${JSON.stringify(m)}'>
      <div class="videos__item-imgbox videos__movie-imgbox"></div>
      <div class="videos__item-title">${escapeHtml(m.voiceOrQuality)}</div>
    </div>
    <!--${m.quality}-->
  `
    )
    .join('')}
</div>`;
  return c.html(html);
}

// 6. Lampac Episode/Movie video stream resolution: /lite/:cdn/video.m3u8
async function handleVideo(c: any) {
  const cdnSlug = c.req.param('cdn') || c.req.param('provider') || 'uafilms';
  const id = c.req.query('id') || c.req.query('tmdb_id') || c.req.query('imdb_id');
  const imdbId = c.req.query('imdb_id');
  const season = c.req.query('s');
  const episode = c.req.query('e');
  const title = c.req.query('title');
  const tParam = c.req.query('t');

  const proto = c.req.header('x-forwarded-proto') || (c.req.url.startsWith('https') ? 'https' : 'http');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
  const proxyHost = `${proto}://${host}`;
  const clientIp = getClientIp(c);

  const isSerial = season !== undefined && season !== null && season !== '';
  const mediaType: MediaType = isSerial ? 'tv' : 'movie';

  let meta: MediaMetadata | null = null;
  if (id) {
    meta = await TmdbService.getMetadata(String(id), mediaType);
  }
  if (!meta && imdbId) {
    meta = await TmdbService.getMetadata(imdbId, mediaType);
  }
  if (!meta && title) {
    try {
      const searchRes = await TmdbService.search(title);
      if (searchRes?.results?.length) {
        const match = searchRes.results.find((r: any) => r.media_type === mediaType) || searchRes.results[0];
        if (match) {
          meta = await TmdbService.getMetadata(String(match.id), mediaType);
        }
      }
    } catch {
      // ignore
    }
  }

  if (!meta) {
    return c.text('Media metadata not found', 404);
  }

  const s = season ? Number(season) : 1;
  const e = episode ? Number(episode) : 1;

  const result = await OrchestratorService.resolveSources({
    meta,
    type: mediaType,
    season: s,
    episode: e,
    platform: 'tv',
    proxyHost,
    clientIp,
  });

  const sources = (result.sources || []).filter((src) => matchesCdn(src, cdnSlug));

  if (sources.length === 0) {
    return c.text(`No sources found for ${isSerial ? `S${s} E${e}` : 'movie'} on ${cdnSlug}`, 404);
  }

  const voiceIdx = tParam !== undefined && tParam !== null && tParam !== '' ? Number(tParam) : 0;
  const targetSource = sources[voiceIdx] || sources[0];

  return c.redirect(targetSource.url, 302);
}

lampacRouter.get('/lite/:cdn', handleCdnBalancer);
lampacRouter.get('/lite/:cdn/video.m3u8', handleVideo);
lampacRouter.get('/lite/:cdn/video', handleVideo);
