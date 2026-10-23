import type { Subtitle } from '../types/media.js';

const CORS_PROXY = 'https://cors.bwa.workers.dev/';

/**
 * Cloudflare віддає сегменти moonanime лише з домену .xyz: .online відповідає
 * bot challenge (403 "Just a moment..."), .net більше не резолвиться.
 */
export function normalizeMoonCdnHost(url: string): string {
  return url.replace(/mooncdn\.online/i, 'mooncdn.xyz');
}

/**
 * Fenix віддає сегменти безпосередньо з BunnyCDN (media.fanixplay.xyz), де дозволений
 * повний CORS (access-control-allow-origin: *), тоді як cf-media.fenixplay.xyz блокує
 * сторонні реферери з 403 Forbidden.
 */
export function normalizeFenixCdnHost(url: string): string {
  return url.replace(/(?:cf-media\.fenixplay\.xyz|media\.fenixplay\.xyz)/gi, 'media.fanixplay.xyz');
}

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
  /**
   * Переписує посилання на сегменти у `${segmentProxyBase}${encodeURIComponent(url)}`.
   * Потрібно для CDN, які прив'язують підписані посилання до IP запитувача
   * (uakino.ax): тягнути сегменти має наш проксі, а не браузер.
   */
  segmentProxyBase?: string;
  subtitles?: Subtitle[];
  voice?: string;
}

/**
 * Нормалізує код мови субтитрів до ISO-639-1
 */
export function normalizeSubLang(lang?: string): string {
  if (!lang) return 'uk';
  const l = lang.toLowerCase();
  if (l === 'ua' || l === 'uk' || l.includes('укр')) return 'uk';
  if (l === 'en' || l.includes('англ') || l.includes('eng')) return 'en';
  if (l === 'pl' || l.includes('пол')) return 'pl';
  if (l === 'de' || l.includes('нім')) return 'de';
  if (l === 'fr' || l.includes('франц')) return 'fr';
  if (l === 'es' || l.includes('ісп')) return 'es';
  if (l === 'ja' || l.includes('япон')) return 'ja';
  return l.slice(0, 3);
}

/**
 * Формує чистий маршрут /subs.m3u8 для підключення у HLS Master Playlist
 */
export function formatSubtitleUri(subUrl: string, proxyHost: string, lang = 'uk'): string {
  try {
    const urlObj = new URL(subUrl);
    const host = urlObj.hostname.toLowerCase();

    // Ashdi: https://ashdi.vip/player/subtitle/277732_ua.vtt
    if (host.includes('ashdi.vip')) {
      const match = subUrl.match(/\/subtitle\/([^_/]+)(?:_([a-zA-Z0-9]+))?\.vtt/i);
      if (match) {
        const id = match[1];
        const subLang = match[2] || lang || 'ua';
        return `${proxyHost}/subs.m3u8?cdn=ashdi&id=${id}&lang=${subLang}`;
      }
    }

    // Zetvideo: https://zetvideo.net/player/subtitle/65126_ua.vtt
    if (host.includes('zetvideo.net')) {
      const match = subUrl.match(/\/subtitle\/([^_/]+)(?:_([a-zA-Z0-9]+))?\.vtt/i);
      if (match) {
        const id = match[1];
        const subLang = match[2] || lang || 'ua';
        return `${proxyHost}/subs.m3u8?cdn=zetvideo&id=${id}&lang=${subLang}`;
      }
    }

    // HDVB: https://s11.hdvbua.pro/media/content/stream/2025/1011844/11111697/subtitle.vtt
    if (host.includes('hdvbua.pro') || host.includes('vidcache')) {
      const match = subUrl.match(/(?:stream\/\d+\/)?(\d+)\/(\d+)\/subtitle\.vtt/i);
      if (match) {
        const id = `${match[1]}/${match[2]}`;
        return `${proxyHost}/subs.m3u8?cdn=hdvb&id=${encodeURIComponent(id)}&lang=${lang}`;
      }
    }
  } catch {
    // fallback to generic url parameter
  }

  return `${proxyHost}/subs.m3u8?url=${encodeURIComponent(subUrl)}`;
}

export function parseMasterPlaylist(
  content: string,
  baseUrl: string,
  proxyHost: string,
  options: ParsePlaylistOptions = {}
): string {
  const { corsProxySegments = false, segmentProxyBase, subtitles = [] } = options;
  const lines = content.split('\n');
  const newLines: string[] = [];

  const cleanBaseUrl = normalizeFenixCdnHost(stripCorsProxy(baseUrl));

  const isMaster = content.includes('#EXT-X-STREAM-INF');
  const subtitleGroupId = 'subs';

  let hasInsertedSubtitles = false;

  let nextIsStreamUrl = false;
  let nextIsSegmentUrl = false;
  let currentStreamHeight: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      // Якщо це мастер-плейлист і ми маємо субтитри — вставляємо #EXT-X-MEDIA перед стрімами
      if (isMaster && subtitles.length > 0 && !hasInsertedSubtitles && trimmed.startsWith('#EXT-X-STREAM-INF')) {
        subtitles.forEach((sub, idx) => {
          const subLang = normalizeSubLang(sub.lang);
          const subLabel = sub.label || `Субтитри ${idx + 1}`;
          const isDefault = idx === 0 ? 'YES' : 'NO';
          const subUri = formatSubtitleUri(sub.url, proxyHost, sub.lang || subLang);
          newLines.push(
            `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="${subtitleGroupId}",NAME="${subLabel}",DEFAULT=${isDefault},AUTOSELECT=YES,LANGUAGE="${subLang}",URI="${subUri}"`
          );
        });
        hasInsertedSubtitles = true;
      }

      if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
        // Додаємо SUBTITLES="subs" до атрибутів потоку, якщо ще не вказано
        let streamInf = trimmed;
        if (subtitles.length > 0 && !streamInf.includes('SUBTITLES=')) {
          streamInf = `${streamInf},SUBTITLES="${subtitleGroupId}"`;
        }
        newLines.push(streamInf);
        nextIsStreamUrl = true;
        nextIsSegmentUrl = false;

        // Витягуємо роздільну здатність (враховуючи кінематографічний аспект 21:9 / 2.39:1, де висота 1080p становить ~800px)
        const resMatch = trimmed.match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resMatch) {
          const w = parseInt(resMatch[1], 10);
          const h = parseInt(resMatch[2], 10);
          const maxDim = Math.max(w, h);
          if (maxDim >= 3000 || h >= 2000) currentStreamHeight = '2160';
          else if (maxDim >= 1800 || h >= 800) currentStreamHeight = '1080';
          else if (maxDim >= 1200 || h >= 500) currentStreamHeight = '720';
          else if (maxDim >= 700 || h >= 350) currentStreamHeight = '480';
          else currentStreamHeight = undefined;
        } else {
          currentStreamHeight = undefined;
        }
      } else if (trimmed.startsWith('#EXTINF') || trimmed.startsWith('#EXT-X-BYTERANGE')) {
        newLines.push(trimmed);
        nextIsSegmentUrl = true;
        nextIsStreamUrl = false;
      } else if (trimmed.startsWith('#EXT-X-MEDIA')) {
        let mediaLine = trimmed;
        if (options.voice && mediaLine.includes('TYPE=AUDIO')) {
          const nameMatch = mediaLine.match(/NAME="([^"]+)"/i);
          if (nameMatch && /^(uk|ukr|ua|ukrainian|default|audio|sound|track)$/i.test(nameMatch[1])) {
            const safeVoice = options.voice.replace(/"/g, '\\"');
            mediaLine = mediaLine.replace(/NAME="[^"]+"/i, `NAME="${safeVoice}"`);
            mediaLine = mediaLine.replace(/LANGUAGE="[^"]+"/i, `LANGUAGE="${safeVoice}"`);
          }
        }
        // URI атрибут резолвиться відносно URL плейлиста, а наш плейлист віддається
        // з власного хоста — тому відносні URI (як-от аудіо-дорожки Fenix) треба
        // переписати на проксі, інакше плеєр стукає в наш /anime/...
        const mediaUriMatch = mediaLine.match(/URI="([^"]+)"/i);
        if (mediaUriMatch && !mediaUriMatch[1].startsWith(`${proxyHost}/`)) {
          try {
            const mediaUrl = normalizeFenixCdnHost(new URL(mediaUriMatch[1], cleanBaseUrl).href);
            const rewritten = /\.(vtt|srt)(\?|$)/i.test(mediaUrl)
              ? `${proxyHost}/subs.m3u8?url=${encodeURIComponent(mediaUrl)}`
              : `${proxyHost}/master.m3u8?url=${encodeURIComponent(mediaUrl)}`;
            newLines.push(mediaLine.replace(mediaUriMatch[1], rewritten));
          } catch {
            newLines.push(mediaLine);
          }
        } else {
          newLines.push(mediaLine);
        }
      } else if (trimmed.startsWith('#EXT-X-MAP')) {
        // fmp4 init-сегмент (наприклад Fenix): URI теж мусить іти через наш проксі або fanixplay,
        // інакше браузер тягне його прямо з чужого origin без CORS.
        const mapUriMatch = trimmed.match(/URI="([^"]+)"/i);
        if (mapUriMatch) {
          try {
            const mapUrl = normalizeFenixCdnHost(new URL(mapUriMatch[1], cleanBaseUrl).href);
            const rewritten = segmentProxyBase
              ? `${segmentProxyBase}${encodeURIComponent(mapUrl)}`
              : corsProxySegments
                ? `${CORS_PROXY}${mapUrl}`
                : mapUrl;
            newLines.push(trimmed.replace(mapUriMatch[1], rewritten));
          } catch {
            newLines.push(trimmed);
          }
        } else {
          newLines.push(trimmed);
        }
      } else {
        newLines.push(trimmed);
      }
      continue;
    }

    try {
      const absoluteUrl = normalizeFenixCdnHost(normalizeMoonCdnHost(new URL(trimmed, cleanBaseUrl).href));

      if (nextIsStreamUrl) {
        let streamTargetUrl = absoluteUrl;
        if (
          currentStreamHeight &&
          (streamTargetUrl.includes('ashdi.vip') ||
            streamTargetUrl.includes('ashdi.me') ||
            streamTargetUrl.includes('0yql3tj') ||
            streamTargetUrl.includes('oyql3tj')) &&
          /\/hls\/\d+\//.test(streamTargetUrl)
        ) {
          streamTargetUrl = streamTargetUrl.replace(/\/hls\/\d+\//, `/hls/${currentStreamHeight}/`);
        }
        newLines.push(`${proxyHost}/master.m3u8?url=${encodeURIComponent(streamTargetUrl)}`);
        nextIsStreamUrl = false;
        currentStreamHeight = undefined;
      } else if (nextIsSegmentUrl) {
        const isMooncdn = /mooncdn\.(online|xyz)|moonanime\.art/i.test(absoluteUrl);
        if (segmentProxyBase) {
          newLines.push(`${segmentProxyBase}${encodeURIComponent(absoluteUrl)}`);
        } else if (corsProxySegments && !isMooncdn && !absoluteUrl.startsWith(CORS_PROXY)) {
          newLines.push(`${CORS_PROXY}${absoluteUrl}`);
        } else {
          newLines.push(absoluteUrl);
        }
        nextIsSegmentUrl = false;
      } else {
        const isSegmentFile = /\.(ts|m4s|mp4|m4a|aac|key)(\?|$)/i.test(absoluteUrl);
        const looksLikePlaylist =
          !isSegmentFile &&
          (absoluteUrl.includes('.m3u8') ||
            /\/(index|master|playlist)(\/|\?|$)/i.test(absoluteUrl));

        if (looksLikePlaylist) {
          newLines.push(`${proxyHost}/master.m3u8?url=${encodeURIComponent(absoluteUrl)}`);
        } else {
          const isMooncdn = /mooncdn\.(online|xyz)|moonanime\.art/i.test(absoluteUrl);
          if (segmentProxyBase) {
            newLines.push(`${segmentProxyBase}${encodeURIComponent(absoluteUrl)}`);
          } else if (corsProxySegments && !isMooncdn && !absoluteUrl.startsWith(CORS_PROXY)) {
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
