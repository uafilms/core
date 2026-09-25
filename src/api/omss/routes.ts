import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import type { PlatformType, OmssRootResponse, OmssSourceResponse, OmssErrorResponse } from '../types.js';
import { providers } from '../../providers/index.js';
import { TmdbService } from '../services/tmdb.js';
import { OrchestratorService } from '../services/orchestrator.js';
import {
  omssResponseCache,
  omssSourceResolutionCache,
  mediaParsedTimestampCache,
  omssResponseIdToMediaMap,
  type MediaParseInfo,
} from '../services/cache.js';
import { applyFilterToSources } from './filter.js';
import { enforceParsingSecurity } from '../services/security.js';

export const omssRouter = new Hono();

function makeError(code: string, message: string, status: 400 | 404 | 429 | 500, details?: Record<string, unknown>) {
  const payload: OmssErrorResponse = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    traceId: randomUUID(),
  };
  return { payload, status };
}

// 4.1 Home / Root Endpoints
const rootHandler = (c: any) => {
  const response: OmssRootResponse = {
    name: 'UAFilms',
    version: '1.0.0',
    status: 'operational',
    note: 'uafilms streaming backend',
    endpoints: {
      movie: '/v1/movies/{id}',
      tv: '/v1/tv/{id}/seasons/{s}/episodes/{e}',
    },
    media: {
      movies: '*',
      tv: '*',
    },
    providers: providers.map(p => ({
      id: p.name,
      name: p.name,
      capabilities: ['movies', 'tv'],
    })),
  };
  return c.json(response);
};

omssRouter.get('/', rootHandler);
omssRouter.get('/v1', rootHandler);

// 4.2 Movie Sources: GET /v1/movies/:id
omssRouter.get('/v1/movies/:id', async (c) => {
  const securityError = await enforceParsingSecurity(c);
  if (securityError) return securityError;

  const id = c.req.param('id');
  const platform = (c.req.query('platform') || 'web') as PlatformType;
  const provider = c.req.query('provider');
  const filter = c.req.query('filter');
  const sse = c.req.query('sse') === '1' || c.req.header('accept')?.includes('text/event-stream');

  // Validation
  if (!id || (!/^\d+$/.test(id) && !id.startsWith('tt'))) {
    const err = makeError('INVALID_PARAMETER', 'TMDB ID must contain numeric characters only', 400, {
      parameter: 'id',
      value: id,
    });
    return c.json(err.payload, err.status);
  }

  // Resolve metadata
  const meta = await TmdbService.getMetadata(id, 'movie');
  if (!meta) {
    const err = makeError('INVALID_TMDB_ID', `No media found with TMDB ID: ${id}`, 404);
    return c.json(err.payload, err.status);
  }

  const host = c.req.header('host') || 'localhost:3000';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const proxyHost = `${proto}://${host}`;

  if (sse) {
    return streamSSE(c, async (stream) => {
      try {
        const result = await OrchestratorService.resolveSources({
          meta,
          type: 'movie',
          providerId: provider,
          platform,
          proxyHost,
          onProviderResult: async (chunk) => {
            let filteredSources = chunk.sources;
            if (filter) {
              try {
                filteredSources = applyFilterToSources(filteredSources, filter);
              } catch (e) {
                // ignore
              }
            }
            if (filteredSources.length > 0) {
              await stream.writeSSE({
                event: 'provider',
                data: JSON.stringify({
                  provider: chunk.provider,
                  name: chunk.providerName,
                  sources: filteredSources,
                  subtitles: chunk.subtitles,
                }),
              });
            }
          },
        });

        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            total: result.sources.length,
            diagnostics: result.diagnostics,
          }),
        });
      } catch (err: unknown) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: (err as Error).message }),
        });
      }
    });
  }

  try {
    const result = await OrchestratorService.resolveSources({
      meta,
      type: 'movie',
      providerId: provider,
      platform,
      proxyHost,
    });

    // Apply filtering
    let sources = result.sources;
    if (filter) {
      try {
        sources = applyFilterToSources(sources, filter);
      } catch (err: unknown) {
        const fErr = makeError('INVALID_PARAMETER', (err as Error).message, 400);
        return c.json(fErr.payload, fErr.status);
      }
    }

    if (sources.length === 0) {
      const err = makeError('NO_SOURCES_AVAILABLE', `No streaming sources found for TMDB ID: ${id}`, 404);
      return c.json(err.payload, err.status);
    }

    const responseId = randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const response: OmssSourceResponse = {
      id: responseId,
      expiresAt,
      sources,
      subtitles: result.subtitles,
      diagnostics: result.diagnostics,
    };

    omssResponseCache.set(responseId, response);
    omssResponseIdToMediaMap.set(responseId, {
      mediaKey: String(meta.imdbId || meta.id || id),
      tmdbId: String(meta.id || id),
      imdbId: meta.imdbId,
      parsedAt: mediaParsedTimestampCache.get(String(meta.id || id)) || Date.now(),
    });

    return c.json(response);
  } catch (err: unknown) {
    if ((err as Error).message.startsWith('PROVIDER_NOT_FOUND')) {
      const pErr = makeError('PROVIDER_NOT_FOUND', (err as Error).message, 404);
      return c.json(pErr.payload, pErr.status);
    }
    const sErr = makeError('INTERNAL_ERROR', (err as Error).message, 500);
    return c.json(sErr.payload, sErr.status);
  }
});

// 4.3 TV Episode Sources: GET /v1/tv/:id/seasons/:s/episodes/:e
omssRouter.get('/v1/tv/:id/seasons/:s/episodes/:e', async (c) => {
  const securityError = await enforceParsingSecurity(c);
  if (securityError) return securityError;

  const id = c.req.param('id');
  const sParam = c.req.param('s');
  const eParam = c.req.param('e');
  const platform = (c.req.query('platform') || 'web') as PlatformType;
  const provider = c.req.query('provider');
  const filter = c.req.query('filter');
  const sse = c.req.query('sse') === '1' || c.req.header('accept')?.includes('text/event-stream');

  // Validation
  if (!id || (!/^\d+$/.test(id) && !id.startsWith('tt'))) {
    const err = makeError('INVALID_PARAMETER', 'TMDB ID must contain numeric characters only', 400, {
      parameter: 'id',
      value: id,
    });
    return c.json(err.payload, err.status);
  }

  const season = parseInt(sParam, 10);
  if (isNaN(season) || season < 0 || season > 99) {
    const err = makeError('INVALID_SEASON', 'Season number out of valid range (0-99)', 400, {
      parameter: 's',
      value: sParam,
    });
    return c.json(err.payload, err.status);
  }

  const episode = parseInt(eParam, 10);
  if (isNaN(episode) || episode < 1 || episode > 9999) {
    const err = makeError('INVALID_EPISODE', 'Episode number out of valid range (1-9999)', 400, {
      parameter: 'e',
      value: eParam,
    });
    return c.json(err.payload, err.status);
  }

  const meta = await TmdbService.getMetadata(id, 'tv');
  if (!meta) {
    const err = makeError('INVALID_TMDB_ID', `No media found with TMDB ID: ${id}`, 404);
    return c.json(err.payload, err.status);
  }

  const host = c.req.header('host') || 'localhost:3000';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const proxyHost = `${proto}://${host}`;

  if (sse) {
    return streamSSE(c, async (stream) => {
      try {
        const result = await OrchestratorService.resolveSources({
          meta,
          type: 'tv',
          season,
          episode,
          providerId: provider,
          platform,
          proxyHost,
          onProviderResult: async (chunk) => {
            let filteredSources = chunk.sources;
            if (filter) {
              try {
                filteredSources = applyFilterToSources(filteredSources, filter);
              } catch (e) {
                // ignore
              }
            }
            if (filteredSources.length > 0) {
              await stream.writeSSE({
                event: 'provider',
                data: JSON.stringify({
                  provider: chunk.provider,
                  name: chunk.providerName,
                  sources: filteredSources,
                  subtitles: chunk.subtitles,
                }),
              });
            }
          },
        });

        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            total: result.sources.length,
            diagnostics: result.diagnostics,
          }),
        });
      } catch (err: unknown) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: (err as Error).message }),
        });
      }
    });
  }

  try {
    const result = await OrchestratorService.resolveSources({
      meta,
      type: 'tv',
      season,
      episode,
      providerId: provider,
      platform,
      proxyHost,
    });

    let sources = result.sources;
    if (filter) {
      try {
        sources = applyFilterToSources(sources, filter);
      } catch (err: unknown) {
        const fErr = makeError('INVALID_PARAMETER', (err as Error).message, 400);
        return c.json(fErr.payload, fErr.status);
      }
    }

    if (sources.length === 0) {
      const err = makeError(
        'NO_SOURCES_AVAILABLE',
        `No streaming sources found for TMDB ID: ${id} S${season}E${episode}`,
        404
      );
      return c.json(err.payload, err.status);
    }

    const responseId = randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const response: OmssSourceResponse = {
      id: responseId,
      expiresAt,
      sources,
      subtitles: result.subtitles,
      diagnostics: result.diagnostics,
    };

    omssResponseCache.set(responseId, response);
    omssResponseIdToMediaMap.set(responseId, {
      mediaKey: String(meta.imdbId || meta.id || id),
      tmdbId: String(meta.id || id),
      imdbId: meta.imdbId,
      parsedAt: mediaParsedTimestampCache.get(String(meta.id || id)) || Date.now(),
    });

    return c.json(response);
  } catch (err: unknown) {
    if ((err as Error).message.startsWith('PROVIDER_NOT_FOUND')) {
      const pErr = makeError('PROVIDER_NOT_FOUND', (err as Error).message, 404);
      return c.json(pErr.payload, pErr.status);
    }
    const sErr = makeError('INTERNAL_ERROR', (err as Error).message, 500);
    return c.json(sErr.payload, sErr.status);
  }
});

// 4.5 Refresh Endpoint: POST /v1/refresh/:id
omssRouter.post('/v1/refresh/:id', async (c) => {
  const securityError = await enforceParsingSecurity(c);
  if (securityError) return securityError;

  const id = c.req.param('id');
  if (!id) {
    const err = makeError('MISSING_PARAMETER', 'Missing id parameter', 400);
    return c.json(err.payload, err.status);
  }

  // 1. Resolve mediaKey and parsedAt
  let mediaKey: string | undefined;
  let tmdbId: string | undefined;
  let parsedAt: number | undefined;

  const mapped = omssResponseIdToMediaMap.get<MediaParseInfo>(id);
  if (mapped) {
    mediaKey = mapped.mediaKey;
    tmdbId = mapped.tmdbId;
    parsedAt = mapped.parsedAt;
  } else if (mediaParsedTimestampCache.has(id)) {
    mediaKey = id;
    tmdbId = id;
    parsedAt = mediaParsedTimestampCache.get<number>(id);
  } else {
    // Check if any entries exist in omssSourceResolutionCache for this id
    for (const key of omssSourceResolutionCache.keys()) {
      if (key.includes(`:${id}:`)) {
        mediaKey = id;
        tmdbId = id;
        const entry = omssSourceResolutionCache.getEntry(key);
        parsedAt = entry?.createdAt || Date.now();
        break;
      }
    }
  }

  if (!parsedAt || !mediaKey) {
    const err = makeError('RESPONSE_ID_NOT_FOUND', 'No cached response or sources found for the provided ID', 404);
    return c.json(err.payload, err.status);
  }

  // 2. Check Cooldown (default: 2 hours)
  const cooldownHours = parseInt(process.env.REFRESH_COOLDOWN_HOURS || '2', 10) || 2;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const elapsedMs = Date.now() - parsedAt;

  if (elapsedMs < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    const remainingHours = (remainingMinutes / 60).toFixed(1);

    const timeText = remainingMinutes > 60 
      ? `~${remainingHours} год.` 
      : `${remainingMinutes} хв.`;

    c.header('Retry-After', String(remainingSeconds));
    const err = makeError(
      'REFRESH_COOLDOWN_ACTIVE',
      `Оновлення джерел для цього медіа тимчасово недоступне. Зачекайте ще ${timeText}`,
      429,
      {
        cooldownHours,
        remainingSeconds,
        remainingMinutes,
        retryAfter: remainingSeconds,
      }
    );
    return c.json(err.payload, err.status);
  }

  // 3. Cooldown passed: clear caches
  omssResponseCache.delete(id);
  omssResponseIdToMediaMap.delete(id);

  omssSourceResolutionCache.deleteMatching((key) => key.includes(`:${mediaKey}:`));
  if (tmdbId && tmdbId !== mediaKey) {
    omssSourceResolutionCache.deleteMatching((key) => key.includes(`:${tmdbId}:`));
  }

  mediaParsedTimestampCache.delete(mediaKey);
  if (tmdbId) mediaParsedTimestampCache.delete(tmdbId);

  return c.json({
    status: 'OK',
    message: 'Кеш джерел успішно очищено',
  });
});
