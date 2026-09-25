import { Hono } from 'hono';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { TmdbService } from '../services/tmdb.js';
import { TheIntroDbService } from '../services/theintrodb.js';
import { AniSkipService } from '../services/aniskip.js';
import { metaCache } from '../services/cache.js';

export const catalogRouter = new Hono();

catalogRouter.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'UAFilms API',
    version: '1.0.0',
  });
});

catalogRouter.get('/home', async (c) => {
  const adult = c.req.query('adult') === 'true';
  const cacheKey = `home_data_${adult}`;
  const cached = metaCache.get(cacheKey);
  if (cached) return c.json(cached);

  try {
    const [trending, recommended, ukrainian, cartoons, anime] = await Promise.all([
      TmdbService.getTrending('week', 'all'),
      TmdbService.getRecommended('movie', adult),
      TmdbService.getUkrainian('movie', adult),
      TmdbService.getCartoons('movie', adult),
      TmdbService.getAnime('movie', adult),
    ]);

    const data = {
      trending: trending.results || [],
      recommended: recommended.results || [],
      ukrainian: ukrainian.results || [],
      cartoons: cartoons.results || [],
      anime: anime.results || [],
    };

    metaCache.set(cacheKey, data, 300);
    return c.json(data);
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

catalogRouter.get('/search', async (c) => {
  const q = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const adult = c.req.query('adult') === 'true';

  if (!q.trim()) {
    return c.json({ results: [], total_pages: 0, total_results: 0 });
  }

  try {
    const data = await TmdbService.search(q, page, adult);
    return c.json(data);
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

catalogRouter.get('/details', async (c) => {
  const id = c.req.query('id');
  const type = (c.req.query('type') || 'movie') as 'movie' | 'tv';

  if (!id) {
    return c.json({ error: 'Missing required query parameter: id' }, 400);
  }

  try {
    const details = await TmdbService.getDetails(id, type);
    if (!details) {
      return c.json({ error: 'Media details not found' }, 404);
    }
    return c.json(details);
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

catalogRouter.get('/season', async (c) => {
  const id = c.req.query('id');
  const seasonNumber = parseInt(c.req.query('season') || '1', 10);

  if (!id) {
    return c.json({ error: 'Missing required query parameter: id' }, 400);
  }

  try {
    const seasonDetails = await TmdbService.getSeasonDetails(id, seasonNumber);
    if (!seasonDetails) {
      return c.json({ error: 'Season details not found' }, 404);
    }
    return c.json(seasonDetails);
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

catalogRouter.get('/segments', async (c) => {
  const rawId = c.req.query('id') || c.req.query('tmdb_id');
  const imdbId = c.req.query('imdb_id');
  const type = (c.req.query('type') || 'movie') as 'movie' | 'tv';
  const seasonStr = c.req.query('season');
  const episodeStr = c.req.query('episode');
  const durationStr = c.req.query('duration_ms');

  if (!rawId && !imdbId) {
    return c.json({ segments: [] });
  }

  const isNumeric = rawId && /^\d+$/.test(rawId);
  const tmdbId = isNumeric ? parseInt(rawId, 10) : undefined;
  const effectiveImdbId = imdbId || (!isNumeric && rawId?.startsWith('tt') ? rawId : undefined);

  const season = seasonStr ? parseInt(seasonStr, 10) : undefined;
  const episode = episodeStr ? parseInt(episodeStr, 10) : undefined;

  const durationRaw = c.req.query('duration_ms') || c.req.query('duration') || c.req.query('episodeLength');
  let durationMs: number | undefined;
  let durationSec: number | undefined;

  if (durationRaw) {
    const val = parseFloat(durationRaw);
    if (!isNaN(val) && val > 0) {
      if (val > 10000) {
        durationMs = Math.round(val);
        durationSec = Math.round(val / 1000);
      } else {
        durationSec = Math.round(val);
        durationMs = Math.round(val * 1000);
      }
    }
  }

  try {
    let segments = await TheIntroDbService.getSegments({
      tmdbId,
      imdbId: effectiveImdbId,
      type,
      season,
      episode,
      durationMs,
    });

    if (segments.length === 0) {
      let title = c.req.query('title');
      if (!title && !effectiveImdbId && tmdbId) {
        try {
          const d = await TmdbService.getDetails(String(tmdbId), type);
          if (d) {
            title = d.originalTitle || d.title;
          }
        } catch {}
      }

      segments = await AniSkipService.getSegments({
        imdbId: effectiveImdbId,
        title,
        episode: episode || 1,
        episodeLength: durationSec,
      });
    }

    return c.json({ segments });
  } catch (err: unknown) {
    return c.json({ segments: [] });
  }
});

catalogRouter.get('/comments', async (c) => {
  const imdbId = c.req.query('imdb_id');
  const page = parseInt(c.req.query('page') || '1', 10);

  if (!imdbId) {
    return c.json({ error: 'imdb_id is required' }, 400);
  }

  try {
    const searchUrl = 'https://uakino.best/engine/lazydev/dle_search/ajax.php';
    const params = new URLSearchParams();
    params.append('story', imdbId);

    const searchRes = await axios.post<any>(searchUrl, params, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      timeout: 5000,
    });

    const searchHtml = typeof searchRes.data === 'string' ? searchRes.data : searchRes.data?.content || '';
    const linkMatch = searchHtml.match(/href=["'](https?:\/\/uakino\.best\/(\d+)-[^"']+\.html)["']/);

    if (!linkMatch || !linkMatch[2]) {
      return c.json([]);
    }

    const newsId = linkMatch[2];
    const commentsUrl = `https://uakino.best/engine/ajax/controller.php?mod=comments&cstart=${page}&news_id=${newsId}&skin=uakino&massact=disable`;

    const commentsRes = await axios.get<string>(commentsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 5000,
    });

    const $ = cheerio.load(commentsRes.data || '');
    const items: any[] = [];

    $('li.comments-tree-item').each((_, el) => {
      const $el = $(el);
      const author = $el.find('.comm-author').text().trim();
      const date = $el.find('.comm-bottom .comm-date').text().trim();
      const text = $el.find('.comm-text').text().trim();
      const avatar = $el.find('.comm-av img').attr('src');

      if (text && author) {
        items.push({
          author,
          date,
          text,
          avatar: avatar ? (avatar.startsWith('http') ? avatar : `https://uakino.best${avatar}`) : undefined,
        });
      }
    });

    return c.json(items);
  } catch (err) {
    return c.json([]);
  }
});
