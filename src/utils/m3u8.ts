const CORS_PROXY = 'https://cors.bwa.workers.dev/';

export function stripCorsProxy(url: string): string {
  const prefix = CORS_PROXY.replace(/\/+$/, '/');
  let current = url;
  while (current.startsWith(prefix)) {
    current = current.slice(prefix.length);
  }
  return current;
}

export interface ParsePlaylistOptions {
  corsProxySegments?: boolean;
}

export function parseMasterPlaylist(
  content: string,
  baseUrl: string,
  proxyHost: string,
  options: ParsePlaylistOptions = {}
): string {
  const { corsProxySegments = false } = options;
  const lines = content.split('\n');
  const newLines: string[] = [];

  const cleanBaseUrl = stripCorsProxy(baseUrl);

  let nextIsStreamUrl = false;
  let nextIsSegmentUrl = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      newLines.push(trimmed);
      if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
        nextIsStreamUrl = true;
        nextIsSegmentUrl = false;
      } else if (trimmed.startsWith('#EXTINF') || trimmed.startsWith('#EXT-X-BYTERANGE')) {
        nextIsSegmentUrl = true;
        nextIsStreamUrl = false;
      }
      continue;
    }

    try {
      const absoluteUrl = new URL(trimmed, cleanBaseUrl).href;

      if (nextIsStreamUrl) {
        newLines.push(`${proxyHost}/master.m3u8?url=${encodeURIComponent(absoluteUrl)}`);
        nextIsStreamUrl = false;
      } else if (nextIsSegmentUrl) {
        if (corsProxySegments && !absoluteUrl.startsWith(CORS_PROXY)) {
          newLines.push(`${CORS_PROXY}${absoluteUrl}`);
        } else {
          newLines.push(absoluteUrl);
        }
        nextIsSegmentUrl = false;
      } else {
        const looksLikePlaylist =
          absoluteUrl.includes('.m3u8') ||
          /\/(index|master|playlist|stream|hls)(\/|\?|$)/i.test(absoluteUrl);

        if (looksLikePlaylist) {
          newLines.push(`${proxyHost}/master.m3u8?url=${encodeURIComponent(absoluteUrl)}`);
        } else {
          if (corsProxySegments && !absoluteUrl.startsWith(CORS_PROXY)) {
            newLines.push(`${CORS_PROXY}${absoluteUrl}`);
          } else {
            newLines.push(absoluteUrl);
          }
        }
      }
    } catch {
      newLines.push(trimmed);
    }
  }

  return newLines.join('\n');
}
