import * as cheerio from 'cheerio';
import type {
  Episode,
  ProviderResult,
  SearchResult,
  Season,
  StreamSource,
} from '../../types/media.js';
import type { ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import { httpRequest } from '../../utils/http.js';
import { rankSearchResults, sortSeasons, sortSources } from '../../utils/sort.js';
import { ashdiVod } from '../../vods/index.js';
import { logWarn } from '../../utils/logger.js';

const BASE_URL = 'https://kinoukr.tv';
const COOKIES = 'onlyforkinoukr=1; lampac-off=1';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0',
  'Cookie': COOKIES,
};

let cachedHash: string | null = null;
let hashTimestamp = 0;
const HASH_TTL_MS = 20 * 60 * 1000;

async function getDleHash(signal?: AbortSignal): Promise<string | null> {
  const now = Date.now();
  if (cachedHash && now - hashTimestamp < HASH_TTL_MS) {
    return cachedHash;
  }

  try {
    const res = await httpRequest<string>({
      url: `${BASE_URL}/watch/`,
      method: 'GET',
      headers: HEADERS,
      signal,
      timeout: 10000,
    });

    const html = res.data;
    const match =
      html.match(/dle_login_hash\s*=\s*'([^']+)'/) ||
      html.match(/user_hash\s*=\s*'([^']+)'/);

    if (match && match[1]) {
      cachedHash = match[1];
      hashTimestamp = now;
      return cachedHash;
    }
  } catch (err) {
    logWarn('kinoukr', `failed to retrieve dle_login_hash: ${err}`);
  }

  return null;
}

export async function searchKinoUkrWeb(
  query: string,
  options: ProviderSearchOptions = {}
): Promise<SearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const dleHash = await getDleHash(options.signal);
  if (!dleHash) {
    logWarn('kinoukr', 'cannot search without dle_hash');
    return [];
  }

  const form = `story=${encodeURIComponent(cleanQ)}&dle_hash=${encodeURIComponent(dleHash)}&thisUrl=%2Fwatch%2F`;

  try {
    const res = await httpRequest<any>({
      url: `${BASE_URL}/engine/lazydev/dle_search/ajax.php`,
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE_URL}/watch/`,
      },
      data: form,
      signal: options.signal,
      timeout: 10000,
    });

    const data = res.data;
    let htmlContent = '';
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        htmlContent = parsed.content || data;
      } catch {
        htmlContent = data;
      }
    } else if (data && typeof data === 'object') {
      htmlContent = data.content || '';
    }

    if (!htmlContent) return [];

    const $ = cheerio.load(htmlContent);
    const results: SearchResult[] = [];

    $('.searchheading').each((_, elem) => {
      const a = $(elem);
      let href = a.attr('href') || '';
      if (!href) return;
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;

      const title = a.find('.searchtitle').text().trim() || a.text().trim();
      if (!title) return;

      const descText = a.find('.searchdesc').text().trim();
      let year: number | undefined;
      const yearMatch = descText.match(/\b(19\d\d|20\d\d)\b/) || title.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        year = Number(yearMatch[1]);
      }

      let poster = a.find('img').attr('src') || undefined;
      if (poster && poster.startsWith('/')) {
        poster = `${BASE_URL}${poster}`;
      }

      const isTv =
        href.includes('/seriesss/') ||
        href.includes('/serial/') ||
        href.includes('/anime/') ||
        /(?:сезон|сері)/i.test(title);

      results.push({
        id: href,
        title,
        year,
        type: isTv ? 'tv' : 'movie',
        url: href,
        poster,
        details: { source: 'web' },
      });
    });

    return rankSearchResults(results, cleanQ, options.year);
  } catch (err) {
    logWarn('kinoukr', `search error: ${err}`);
    return [];
  }
}

function extractVodDetails(rawUrl: string): {
  cdn: 'ashdi' | 'tortuga' | 'unknown';
  type: 'vod' | 'serial' | 'embed';
  id: string;
} | null {
  const ashdiVod = rawUrl.match(/(?:ashdi\.vip|ashdi\.me)\/vod\/(\d+)/i);
  if (ashdiVod) return { cdn: 'ashdi', type: 'vod', id: ashdiVod[1] };

  const ashdiSerial = rawUrl.match(/(?:ashdi\.vip|ashdi\.me)\/serial\/(\d+)/i);
  if (ashdiSerial) return { cdn: 'ashdi', type: 'serial', id: ashdiSerial[1] };

  const tortugaVod = rawUrl.match(/(?:tortuga\.(?:tw|wtf)|calypso\.tortuga\.tw)\/vod\/([a-zA-Z0-9_-]+)/i);
  if (tortugaVod) return { cdn: 'tortuga', type: 'vod', id: tortugaVod[1] };

  const tortugaEmbed = rawUrl.match(/(?:tortuga\.(?:tw|wtf))\/embed\/([a-zA-Z0-9_-]+)/i);
  if (tortugaEmbed) return { cdn: 'tortuga', type: 'embed', id: tortugaEmbed[1] };

  return null;
}

export async function getKinoUkrWeb(
  target: SearchResult | string,
  options: ProviderGetOptions = {}
): Promise<ProviderResult | null> {
  let pageUrl = '';

  if (typeof target === 'string') {
    if (target.startsWith('http')) {
      pageUrl = target;
    } else {
      const searchRes = await searchKinoUkrWeb(target, { signal: options.signal });
      if (!searchRes.length) return null;
      pageUrl = searchRes[0].url || '';
    }
  } else {
    pageUrl = target.url || (target.id.startsWith('http') ? target.id : `${BASE_URL}/${target.id}`);
  }

  if (!pageUrl) return null;

  try {
    const res = await httpRequest<string>({
      url: pageUrl,
      method: 'GET',
      headers: {
        ...HEADERS,
        Referer: `${BASE_URL}/`,
      },
      signal: options.signal,
      timeout: 10000,
    });

    const html = res.data;
    const $ = cheerio.load(html);

    const iframeSources: string[] = [];
    $('.fplayer iframe, #player iframe, iframe').each((_, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (!src) return;
      if (src.startsWith('//')) src = 'https:' + src;
      if (src.includes('youtube.com') || src.includes('youtu.be')) return;
      if (src.includes('ashdi') || src.includes('tortuga')) {
        iframeSources.push(src);
      }
    });

    if (!iframeSources.length) return null;

    const isTv =
      pageUrl.includes('/seriesss/') ||
      pageUrl.includes('/serial/') ||
      iframeSources.some((s) => s.includes('/serial/') || s.includes('/embed/'));

    if (isTv) {
      const seasonsMap = new Map<number, Map<number, StreamSource[]>>();

      for (const src of iframeSources) {
        const details = extractVodDetails(src);
        if (!details) continue;

        if (details.cdn === 'ashdi' && details.type === 'serial') {
          try {
            const ashdiRes = await ashdiVod.extract(src, { signal: options.signal });
            if (ashdiRes && ashdiRes.seasons) {
              for (const s of ashdiRes.seasons) {
                if (!seasonsMap.has(s.season)) {
                  seasonsMap.set(s.season, new Map());
                }
                const epMap = seasonsMap.get(s.season)!;
                for (const ep of s.episodes) {
                  if (!epMap.has(ep.episode)) {
                    epMap.set(ep.episode, []);
                  }
                  epMap.get(ep.episode)!.push(...ep.sources);
                }
              }
            }
          } catch (err) {
            logWarn('kinoukr', `ashdi serial extraction error: ${err}`);
          }
        } else if (details.cdn === 'tortuga' && details.type === 'embed') {
          // Tortuga CDN is discontinued, skip
        }
      }

      const seasons: Season[] = [];
      for (const [sNum, epMap] of seasonsMap.entries()) {
        const episodes: Episode[] = [];
        for (const [epNum, sources] of epMap.entries()) {
          episodes.push({
            episode: epNum,
            sources: sortSources(sources),
          });
        }
        episodes.sort((a, b) => a.episode - b.episode);
        seasons.push({
          season: sNum,
          episodes,
        });
      }

      if (seasons.length === 0) return null;

      return {
        provider: 'kinoukr',
        type: 'tv',
        seasons: sortSeasons(seasons),
      };
    }

    // Movie
    const sources: StreamSource[] = [];
    for (const src of iframeSources) {
      const details = extractVodDetails(src);
      if (!details) continue;

      if (details.cdn === 'ashdi') {
        sources.push({
          title: 'Ashdi',
          url: `/master.m3u8?cdn=ashdi&type=vod&id=${details.id}`,
          mime: 'application/x-mpegURL',
          lazy: {
            cdn: 'ashdi',
            type: 'vod',
            id: details.id,
            url: src,
          },
        });
      } else if (details.cdn === 'tortuga') {
        sources.push({
          title: 'Tortuga',
          url: `/master.m3u8?cdn=tortuga&type=vod&id=${details.id}`,
          lazy: {
            cdn: 'tortuga',
            type: 'vod',
            id: details.id,
            url: src,
          },
        });
      }
    }

    if (!sources.length) return null;

    return {
      provider: 'kinoukr',
      type: 'movie',
      sources: sortSources(sources),
    };
  } catch (err) {
    logWarn('kinoukr', `get error: ${err}`);
    return null;
  }
}
