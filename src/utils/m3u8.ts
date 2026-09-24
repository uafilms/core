import type { Subtitle } from '../types/media.js';

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
  subtitles?: Subtitle[];
}

/**
 * Нормалізує код мови субтитрів до ISO-639-1
 */
function normalizeSubLang(lang?: string): string {
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
  const { corsProxySegments = false, subtitles = [] } = options;
  const lines = content.split('\n');
  const newLines: string[] = [];

  const cleanBaseUrl = stripCorsProxy(baseUrl);

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

        // Витягуємо висоту роздільної здатності для обходу заниження якості (тільки якщо вказано стандартні 1080/720/480/2160)
        const resMatch = trimmed.match(/RESOLUTION=\d+x(\d+)/i);
        if (resMatch) {
          const h = parseInt(resMatch[1], 10);
          if (h >= 1000) currentStreamHeight = '1080';
          else if (h >= 700) currentStreamHeight = '720';
          else if (h >= 450) currentStreamHeight = '480';
          else currentStreamHeight = undefined;
        } else {
          currentStreamHeight = undefined;
        }
      } else if (trimmed.startsWith('#EXTINF') || trimmed.startsWith('#EXT-X-BYTERANGE')) {
        newLines.push(trimmed);
        nextIsSegmentUrl = true;
        nextIsStreamUrl = false;
      } else {
        newLines.push(trimmed);
      }
      continue;
    }

    try {
      const absoluteUrl = new URL(trimmed, cleanBaseUrl).href;

      if (nextIsStreamUrl) {
        let streamTargetUrl = absoluteUrl;
        if (currentStreamHeight && streamTargetUrl.includes('ashdi.vip') && /\/hls\/480\//.test(streamTargetUrl)) {
          streamTargetUrl = streamTargetUrl.replace(/\/hls\/480\//, `/hls/${currentStreamHeight}/`);
        }
        newLines.push(`${proxyHost}/master.m3u8?url=${encodeURIComponent(streamTargetUrl)}`);
        nextIsStreamUrl = false;
        currentStreamHeight = undefined;
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
