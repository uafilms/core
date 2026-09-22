import * as cheerio from 'cheerio';
import { httpRequest } from '../../utils/http.js';
import { decryptDataTag } from './decrypt.js';
import type { StreamSource, MediaItem, LazyStream } from '../../types/index.js';

export interface UaSerialsPlayerItem {
  tabName: string;
  url: string;
  season?: number;
  episode?: number;
}

export interface UaSerialsGetResult {
  media: Partial<MediaItem>;
  streams: StreamSource[];
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';

/**
 * Parses a UASerials media page, decrypts player tags, and extracts media/stream data.
 */
export async function get(pageUrl: string): Promise<UaSerialsGetResult | null> {
  try {
    const { data: html } = await httpRequest<string>({
      url: pageUrl,
      headers: {
        'User-Agent': UA,
        'Referer': 'https://uaserials.com/',
      },
    });

    if (!html || typeof html !== 'string') {
      return null;
    }

    const $ = cheerio.load(html);

    // 1. Extract metadata from page
    const title = $('.oname_ua, .fmain h1, .th-title').first().text().trim();
    const originalTitle = $('.oname, .th-title-oname').first().text().trim() || undefined;
    const yearText = $('.finfo-item:contains("Рік"), .uas-card__year').text();
    const yearMatch = yearText.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    const posterSrc = $('.fimg img, .uas-card__poster img').first().attr('src');
    const poster = posterSrc
      ? (posterSrc.startsWith('http') ? posterSrc : `https://uaserials.com${posterSrc}`)
      : undefined;

    // 2. Extract encrypted player tags
    const tagMatches: string[] = [];
    const tagRe = /data-tag\d+='(\{[^']+\})'/g;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(html)) !== null) {
      tagMatches.push(match[1]);
    }

    const rawPlayers: UaSerialsPlayerItem[] = [];

    for (const tagJson of tagMatches) {
      const parsed = await decryptDataTag(tagJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.url) {
            item.url = item.url.replace('/usp/', '/vod/');
          }
          // Filter out trailers
          if (!/трейлер/i.test(item.tabName || '')) {
            rawPlayers.push(item);
          }
        }
      }
    }

    // 3. Transform players into StreamSource format
    const streams: StreamSource[] = [];

    for (const p of rawPlayers) {
      const url = p.url;
      if (!url) continue;

      let cdn = 'unknown';
      let endpointType: 'vod' | 'embed' | 'direct' = 'direct';
      let id = '';

      if (url.includes('tortuga.tw')) {
        cdn = 'tortuga';
        const vodMatch = url.match(/\/vod\/(\d+)/);
        const embedMatch = url.match(/\/embed\/(\d+)/);
        if (vodMatch) {
          endpointType = 'vod';
          id = vodMatch[1];
        } else if (embedMatch) {
          endpointType = 'embed';
          id = embedMatch[1];
        }
      }

      const lazyStream: LazyStream = {
        cdn,
        type: endpointType,
        id,
        url: `/master.m3u8?cdn=${encodeURIComponent(cdn)}&type=${encodeURIComponent(endpointType)}&id=${encodeURIComponent(id)}`,
        directUrl: url,
      };

      streams.push({
        title: p.tabName || 'Плеєр',
        url: lazyStream.url,
        lazy: lazyStream,
        headers: {
          'Referer': pageUrl,
        },
      });
    }

    return {
      media: {
        title,
        originalTitle,
        year,
        poster,
      },
      streams,
    };
  } catch (err) {
    return null;
  }
}
