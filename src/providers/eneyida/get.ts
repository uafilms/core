import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import { hdvbVod } from '../../vods/hdvb/main.js';
import type { ProviderResult, SearchResult, StreamSource } from '../../types/media.js';
import type { ProviderGetOptions } from '../../types/provider.js';
import { searchEneyida } from './search.js';

const BASE_URL = 'https://eneyida.tv';

export async function getEneyida(
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
      const searchRes = await searchEneyida(targetStr, { signal: options?.signal, year: options?.meta?.year });
      if (!searchRes.length) return null;
      pageUrl = searchRes[0].url;
    }
  }

  const { data: html } = await httpRequest<string>({
    url: pageUrl,
    signal: options?.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${BASE_URL}/`,
    },
  });

  if (!html || typeof html !== 'string') return null;

  const $ = cheerio.load(html);
  let iframeUrl: string | null = null;

  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (!src) return;
    if (/trailer|\?tr=1/i.test(src)) return;

    if (src.includes('hdvb') || src.includes('vidcache') || src.includes('vid/') || src.includes('embd/') || src.includes('embed/')) {
      iframeUrl = src;
      return false;
    }
  });

  if (!iframeUrl) {
    // Regex пошук у тексті
    const match = html.match(/src=["'](https?:\/\/[^"']*(?:hdvb|vidcache)[^"']*)["']/i);
    if (match && !/trailer|\?tr=1/i.test(match[1])) {
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
  const cdnType = iframeUrl.includes('/embd/') || iframeUrl.includes('/embed/') ? 'embed' : 'vod';

  if (isTv && extracted.seasons) {
    // Додаємо інформацію про лінивий стрім для серій
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
      provider: 'eneyida',
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
      provider: 'eneyida',
      type: 'movie',
      sources,
    };
  }

  return null;
}
