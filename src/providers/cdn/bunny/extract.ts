import type { StreamSource } from '../../../types/media.js';

/** Пряме HLS посилання на Bunny CDN (*.b-cdn.net/*.m3u8). */
export function buildBunnyDirectSource(url: string): StreamSource {
  return {
    title: 'BunnyCDN HLS',
    url,
    mime: 'application/x-mpegURL',
    lazy: {
      cdn: 'bunny',
      type: 'direct',
      id: url,
      url,
    },
  };
}

/** Скрейп content-src (m3u8) і постера з embed-сторінки Bunny Stream. */
export function parseBunnyEmbedHtml(html: string): { playlistUrl: string | null; posterUrl: string | null } {
  const m3u8Match =
    html.match(/content-src="([^"]+\.m3u8)"/) ||
    html.match(/(https?:\/\/[^\s"'<>]+\.b-cdn\.net\/[^\s"'<>]+\.m3u8)/);
  const posterMatch = html.match(/src="(https?:\/\/[^\s"'<>]+\.b-cdn\.net\/[^\s"'<>]+\.jpg)"/);

  return {
    playlistUrl: m3u8Match ? m3u8Match[1] : null,
    posterUrl: posterMatch ? posterMatch[1] : null,
  };
}

/** Джерело embed-плеєра Bunny Stream. */
export function buildBunnyEmbedSource(params: {
  streamUrl: string;
  embedUrl: string;
  id: string;
  posterUrl: string | null;
}): StreamSource {
  return {
    title: 'BunnyCDN',
    url: params.streamUrl,
    mime: 'application/x-mpegURL',
    poster: params.posterUrl || undefined,
    lazy: {
      cdn: 'bunny',
      type: 'embed',
      id: params.id,
      url: params.embedUrl,
    },
  };
}
