import axios from 'axios';
import { proxyManager } from '../../utils/proxyManager.js';
import { logWarn } from '../../utils/logger.js';
import { extractVod } from './index.js';
import { resolveSniplyoUrlForIp } from './sniplyo/main.js';

export interface ResolveDirectVideoParams {
  target?: string;
  cdn?: string;
  id?: string;
  clientIp?: string;
}

function fixRedirectLocation(location: string): string {
  try {
    const utf8 = Buffer.from(location, 'latin1').toString('utf8');
    return encodeURI(utf8);
  } catch {
    return encodeURI(location);
  }
}

export async function resolveDirectVideoUrl(
  params: ResolveDirectVideoParams
): Promise<string | null> {
  let { target, cdn, id, clientIp } = params;

  if (!target && cdn === 'ufdub' && id) {
    target = `https://video.ufdub.com/V2/VP.php?ID=${encodeURIComponent(id)}`;
  } else if (!target && cdn === 'sniplyo' && id) {
    target = id.startsWith('http')
      ? id
      : `https://sniplyo.online/stream.php?${id.includes('pl=') || id.includes('name=') ? id : `name=${encodeURIComponent(id)}`}`;
  }

  if (!target) return null;

  // Розпакування сторінок плеєрів
  if (
    target.includes('video.ufdub.com') ||
    target.includes('sniplyo.online') ||
    target.includes('creavio.online')
  ) {
    try {
      const extracted = await extractVod(target);
      if (extracted?.sources?.[0]?.url) {
        target = extracted.sources[0].url;
      }
    } catch {
      // залишаємо target без змін
    }
  }

  let finalUrl = target;

  // Визначення кінцевого URL при редиректах (наприклад VIDEOS.php або подібні)
  if (target.includes('VIDEOS.php') || target.includes('/video/') || !target.includes('.mp4')) {
    try {
      let currentUrl = target;
      let redirectsCount = 0;

      while (redirectsCount < 5) {
        const isUfdub = currentUrl.includes('ufdub.com');
        const isSniplyo =
          currentUrl.includes('sniplyo.online') || currentUrl.includes('creavio.online');

        const reqHeaders: Record<string, string> = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          ...(isUfdub ? { 'Referer': 'https://video.ufdub.com/' } : {}),
          ...(isSniplyo ? { 'Referer': 'https://moviestape.lat/' } : {}),
        };

        const proxyOpts = proxyManager.getConfig(cdn || undefined, currentUrl);

        const res = await axios.head(currentUrl, {
          headers: reqHeaders,
          timeout: 10000,
          maxRedirects: 0,
          validateStatus: () => true,
          ...proxyOpts,
        });

        if (res.status >= 300 && res.status < 400 && res.headers.location) {
          redirectsCount++;
          const nextLoc = res.headers.location as string;
          currentUrl = new URL(fixRedirectLocation(nextLoc), currentUrl).toString();
          continue;
        }

        break;
      }

      finalUrl = currentUrl;
    } catch (err: any) {
      logWarn('stream', `video.mp4 redirect resolution error: ${err.message}`);
    }
  }

  // Прив'язка токена Sniplyo/Creavio до IP користувача
  if (finalUrl.includes('sniplyo.online') || finalUrl.includes('creavio.online')) {
    finalUrl = await resolveSniplyoUrlForIp(finalUrl, clientIp);
  }

  return finalUrl;
}
