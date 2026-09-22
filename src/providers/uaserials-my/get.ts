import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import { hdvbVod } from '../../vods/hdvb/main.js';
import type { ProviderResult, SearchResult, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { searchUaSerialsMy } from './search.js';

const BASE_URL = 'https://uaserials.my';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';

export async function getUaSerialsMy(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let pageUrl = '';

  if (typeof target === 'object' && target.url) {
    pageUrl = target.url;
  } else {
    const targetStr = (typeof target === 'string' ? target : '').trim();
    if (targetStr.startsWith('http')) {
      pageUrl = targetStr;
    } else {
      const searchRes = await searchUaSerialsMy(targetStr, { signal: options?.signal, year: options?.meta?.year });
      if (!searchRes.length) return null;
      pageUrl = searchRes[0].url;
    }
  }

  const { data: html } = await httpRequest<string>({
    url: pageUrl,
    signal: options?.signal,
    headers: {
      'User-Agent': UA,
      'Referer': `${BASE_URL}/`,
    },
  });

  if (!html || typeof html !== 'string') return null;

  const $ = cheerio.load(html);
  let iframeUrl: string | null = null;

  // Шукаємо iframe у блоках video_box або tabs_b
  $('iframe').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src');
    const title = $(el).attr('title') || '';
    if (!src) return;
    if (/трейлер|trailer/i.test(title) || /\/trailer\//i.test(src)) return;

    if (src.includes('hdvb') || src.includes('embed') || src.includes('embd') || src.includes('vid/')) {
      iframeUrl = src;
      return false;
    }
  });

  if (!iframeUrl) {
    // Regex пошук у тексті
    const match = html.match(/(?:data-src|src)=["'](https?:\/\/[^"']*(?:hdvb|hdvbua)[^"']*)["']/i);
    if (match && !/\/trailer\//i.test(match[1])) {
      iframeUrl = match[1];
    }
  }

  if (!iframeUrl) return null;

  if (iframeUrl.startsWith('//')) {
    iframeUrl = 'https:' + iframeUrl;
  }

  const extracted = await hdvbVod.extract(iframeUrl, {
    referer: `${BASE_URL}/`,
    signal: options?.signal,
  });

  if (!extracted) return null;

  const isTv = !!(extracted.seasons && extracted.seasons.length > 0);
  const cdnType = iframeUrl.includes('/embed/') || iframeUrl.includes('/embd/') ? 'embed' : 'vod';

  if (isTv && extracted.seasons) {
    const seasons = extracted.seasons.map(season => ({
      ...season,
      episodes: season.episodes.map(ep => ({
        ...ep,
        sources: ep.sources.map(src => ({
          ...src,
          lazy: src.lazy || {
            cdn: 'hdvb',
            type: cdnType,
            url: iframeUrl!,
            directUrl: src.url,
          },
        })),
      })),
    }));

    return {
      provider: 'uaserials-my',
      type: 'tv',
      seasons,
    };
  }

  if (extracted.sources && extracted.sources.length > 0) {
    const sources: StreamSource[] = extracted.sources.map(src => ({
      ...src,
      lazy: src.lazy || {
        cdn: 'hdvb',
        type: cdnType,
        url: iframeUrl!,
        directUrl: src.url,
      },
    }));

    return {
      provider: 'uaserials-my',
      type: 'movie',
      sources,
    };
  }

  return null;
}
