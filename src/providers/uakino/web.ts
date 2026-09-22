import * as cheerio from 'cheerio';
import { http2Request } from '../../utils/http2.js';
import type {
  ProviderResult,
  SearchResult,
  StreamSource,
  Season,
  Episode,
} from '../../types/media.js';
import type { ProviderGetOptions, ProviderSearchOptions } from '../../types/provider.js';
import { rankSearchResults, sortSeasons, sortSources } from '../../utils/sort.js';

const BASE_URL = 'https://uakino.best';
const SEARCH_URL = `${BASE_URL}/engine/lazydev/dle_search/ajax.php`;
const PLAYLIST_URL = `${BASE_URL}/engine/ajax/playlists.php`;

export function extractNewsId(url: string): string | null {
  const m = url.match(/\/(\d+)-[^/]*\.html/);
  return m ? m[1] : null;
}

export function detectSeasonNumber(title: string): number | null {
  const m = title.match(/(\d+)\s*(?:сезон|season)/i) || title.match(/(?:сезон|season)\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseVodUrl(rawUrl: string): { url: string; lazy?: StreamSource['lazy'] } {
  let file = rawUrl.trim();
  if (file.startsWith('//')) {
    file = `https:${file}`;
  }

  const ashdiMatch = file.match(/(?:ashdi\.vip|ashdi\.me)\/vod\/(\d+)/i);
  if (ashdiMatch) {
    const id = ashdiMatch[1];
    const streamUrl = `/master.m3u8?cdn=ashdi&type=vod&id=${id}`;
    return {
      url: streamUrl,
      lazy: {
        cdn: 'ashdi',
        type: 'vod',
        id,
        url: streamUrl,
      },
    };
  }

  const tortugaVodMatch = file.match(/(?:tortuga\.(?:tw|wtf)|calypso\.tortuga\.tw)\/vod\/([a-zA-Z0-9_-]+)/i);
  if (tortugaVodMatch) {
    const id = tortugaVodMatch[1];
    const streamUrl = `/master.m3u8?cdn=tortuga&type=vod&id=${id}`;
    return {
      url: streamUrl,
      lazy: {
        cdn: 'tortuga',
        type: 'vod',
        id,
        url: streamUrl,
      },
    };
  }

  const tortugaEmbedMatch = file.match(/(?:tortuga\.(?:tw|wtf))\/embed\/([a-zA-Z0-9_-]+)/i);
  if (tortugaEmbedMatch) {
    const id = tortugaEmbedMatch[1];
    const streamUrl = `/master.m3u8?cdn=tortuga&type=embed&id=${id}`;
    return {
      url: streamUrl,
      lazy: {
        cdn: 'tortuga',
        type: 'embed',
        id,
        url: streamUrl,
      },
    };
  }

  return { url: file };
}

export async function searchUakinoWeb(
  query: string,
  options?: ProviderSearchOptions
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const body = `story=${encodeURIComponent(cleanQuery)}&thisUrl=%2Fua%2F`;

  const response = await http2Request<string | { content?: string }>(SEARCH_URL, {
    method: 'POST',
    data: body,
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'referer': `${BASE_URL}/ua/`,
    },
    signal: options?.signal,
  });

  const rawData = response.data;
  let htmlContent = '';
  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      htmlContent = parsed.content || '';
    } catch {
      htmlContent = rawData;
    }
  } else if (rawData && typeof rawData === 'object') {
    htmlContent = rawData.content || '';
  }

  if (!htmlContent) return [];

  const $ = cheerio.load(htmlContent);
  const results: SearchResult[] = [];

  $('.search-result-link').each((_, el) => {
    const link = $(el);
    let href = link.attr('href') || '';
    if (!href) return;

    if (href.startsWith('//')) {
      href = 'https:' + href;
    } else if (href.startsWith('/')) {
      href = `${BASE_URL}${href}`;
    }
    href = href.replace(/:\d+\//, '/');

    const newsId = extractNewsId(href);
    if (!newsId) return;

    const title = link.find('.search-result-title').text().trim();
    if (!title) return;

    const originalTitle = link.find('.search-result-orig').text().trim() || undefined;
    const yearText = link.find('.search-result-year').text().trim();
    let year: number | undefined;
    if (yearText) {
      const y = parseInt(yearText, 10);
      if (!isNaN(y)) year = y;
    }

    let poster = link.find('.search-result-poster img').attr('src') || undefined;
    if (poster && poster.startsWith('/')) {
      poster = `${BASE_URL}${poster}`;
    }

    const seasonNum = detectSeasonNumber(title);
    const isTv = seasonNum !== null || href.includes('/seriesss/') || href.includes('/anime-series/');

    results.push({
      id: newsId,
      title,
      originalTitle,
      year,
      type: isTv ? 'tv' : 'movie',
      url: href,
      poster,
      details: { source: 'web', season: seasonNum },
    });
  });

  return rankSearchResults(results, cleanQuery, options?.year);
}

async function fetchPlaylistHtml(newsId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await http2Request<any>(
      `${PLAYLIST_URL}?news_id=${encodeURIComponent(newsId)}&xfield=playlist`,
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'referer': `${BASE_URL}/`,
        },
        signal,
      }
    );

    const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (json && json.success && json.response) {
      return json.response;
    }
  } catch {}
  return null;
}

export async function getUakinoWeb(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let matchedResults: SearchResult[] = [];
  let explicitSeason: number | null = null;

  if (typeof target === 'object') {
    matchedResults = [target];
    explicitSeason = detectSeasonNumber(target.title);
  } else {
    const targetStr = target.trim();
    const urlNewsId = extractNewsId(targetStr);

    if (urlNewsId) {
      matchedResults = [{
        id: urlNewsId,
        title: '',
        url: targetStr.startsWith('http') ? targetStr : `${BASE_URL}${targetStr}`,
      }];
    } else if (/^\d+$/.test(targetStr)) {
      matchedResults = [{
        id: targetStr,
        title: '',
        url: `${BASE_URL}/${targetStr}-item.html`,
      }];
    } else {
      const searchRes = await searchUakinoWeb(targetStr, { signal: options?.signal });
      if (!searchRes.length) return null;

      const first = searchRes[0];
      const baseOrig = (first.originalTitle || '').toLowerCase().trim();
      const baseTitle = first.title.replace(/\s*\d+\s*сезон.*$/i, '').toLowerCase().trim();

      matchedResults = searchRes.filter(r => {
        if (baseOrig && r.originalTitle && r.originalTitle.toLowerCase().trim() === baseOrig) {
          return true;
        }
        const curTitle = r.title.replace(/\s*\d+\s*сезон.*$/i, '').toLowerCase().trim();
        return curTitle === baseTitle;
      });
    }
  }

  if (!matchedResults.length) return null;

  const isTv = matchedResults.some(r => r.type === 'tv' || detectSeasonNumber(r.title) !== null);

  if (!isTv) {
    const primary = matchedResults[0];
    const html = await fetchPlaylistHtml(primary.id, options?.signal);
    if (!html) return null;

    const $ = cheerio.load(html);
    const sources: StreamSource[] = [];

    $('.playlists-videos li[data-file]').each((_, el) => {
      const file = $(el).attr('data-file');
      if (!file) return;

      const voice = $(el).attr('data-voice') || $(el).text().trim() || 'Default';
      const { url, lazy } = parseVodUrl(file);

      sources.push({
        title: voice,
        audio: voice,
        url,
        lazy,
      });
    });

    if (!sources.length) return null;

    return {
      provider: 'uakino',
      type: 'movie',
      sources: sortSources(sources),
    };
  }

  // TV Series
  const seasonMap = new Map<number, Map<number, StreamSource[]>>();

  for (const item of matchedResults) {
    const sNum = detectSeasonNumber(item.title) || explicitSeason || 1;
    const html = await fetchPlaylistHtml(item.id, options?.signal);
    if (!html) continue;

    const $ = cheerio.load(html);

    if (!seasonMap.has(sNum)) {
      seasonMap.set(sNum, new Map<number, StreamSource[]>());
    }
    const episodeMap = seasonMap.get(sNum)!;

    $('.playlists-videos li[data-file]').each((idx, el) => {
      const file = $(el).attr('data-file');
      if (!file) return;

      const voice = $(el).attr('data-voice') || 'Original';
      const text = $(el).text().trim();

      const epMatch =
        text.match(/(?:серія|сер|епізод|ep|e)\s*(\d+)/i) ||
        text.match(/(\d+)\s*(?:серія|сер|епізод|ep|e)/i) ||
        text.match(/^(\d+)$/);

      const epNum = epMatch ? parseInt(epMatch[1], 10) : idx + 1;
      const { url, lazy } = parseVodUrl(file);

      if (!episodeMap.has(epNum)) {
        episodeMap.set(epNum, []);
      }

      episodeMap.get(epNum)!.push({
        title: voice,
        audio: voice,
        url,
        lazy,
      });
    });
  }

  const seasons: Season[] = [];
  for (const [sNum, epMap] of seasonMap.entries()) {
    const episodes: Episode[] = [];
    for (const [epNum, sources] of epMap.entries()) {
      episodes.push({
        episode: epNum,
        sources: sortSources(sources),
      });
    }
    if (episodes.length > 0) {
      episodes.sort((a, b) => a.episode - b.episode);
      seasons.push({
        season: sNum,
        episodes,
      });
    }
  }

  if (!seasons.length) return null;

  return {
    provider: 'uakino',
    type: 'tv',
    seasons: sortSeasons(seasons),
  };
}
