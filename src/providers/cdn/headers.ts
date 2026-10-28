import { detectCdn } from '../../utils/cdn.js';

export function getCdnStreamHeaders(streamUrl: string, cdnHint?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };

  const detected = detectCdn({ url: streamUrl }, cdnHint).id;

  switch (detected) {
    case 'ashdi':
      headers['Origin'] = 'https://ashdi.vip';
      headers['Referer'] = 'https://ashdi.vip/';
      break;
    case 'moonanime':
      headers['Origin'] = 'https://moonanime.art';
      headers['Referer'] = 'https://moonanime.art/';
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
      headers['Accept'] = '*/*';
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['sec-fetch-dest'] = 'empty';
      headers['sec-fetch-mode'] = 'cors';
      headers['sec-fetch-site'] = 'same-site';
      break;
    case 'bamboo':
      headers['Origin'] = 'https://bambooua.com';
      headers['Referer'] = 'https://bambooua.com/';
      break;
    case 'hdvb':
      headers['Referer'] = 'https://eneyida.tv/';
      break;
    case 'franko':
      headers['Origin'] = 'https://franko.uacdn.online';
      headers['Referer'] = 'https://franko.uacdn.online/';
      break;
    case 'tortuga':
      headers['Referer'] = 'https://uaserials.com/';
      headers['Origin'] = 'https://uaserials.com';
      break;
    case 'zetvideo':
      headers['Origin'] = 'https://zetvideo.net';
      headers['Referer'] = 'https://uafix.net/';
      break;
    case 'fenix':
      headers['Referer'] = 'https://fenixplay.xyz/';
      headers['Origin'] = 'https://fenixplay.xyz';
      break;
    case 'ufdub':
      headers['Referer'] = 'https://video.ufdub.com/';
      break;
    case 'sniplyo':
      headers['Referer'] = 'https://moviestape.lat/';
      break;
    case 'unimay':
      headers['Referer'] = 'https://unimay.media/';
      headers['Origin'] = 'https://unimay.media';
      break;
  }

  return headers;
}

export function getCdnSubtitleHeaders(subUrl: string, cdnHint?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };

  const detected = detectCdn({ url: subUrl }, cdnHint).id;

  switch (detected) {
    case 'ashdi':
      headers['Origin'] = 'https://ashdi.vip';
      headers['Referer'] = 'https://ashdi.vip/';
      break;
    case 'zetvideo':
      headers['Origin'] = 'https://zetvideo.net';
      headers['Referer'] = 'https://uafix.net/';
      break;
    case 'hdvb':
      headers['Referer'] = 'https://eneyida.tv/';
      break;
    case 'tortuga':
      headers['Referer'] = 'https://tortuga.tw/';
      headers['Origin'] = 'https://tortuga.tw';
      break;
    case 'fenix':
      headers['Referer'] = 'https://fenixplay.xyz/';
      headers['Origin'] = 'https://fenixplay.xyz';
      break;
  }

  return headers;
}

export function getCdnSegmentHeaders(targetUrl: string, cdnHint?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };

  const detected = detectCdn({ url: targetUrl }, cdnHint).id;

  switch (detected) {
    case 'fenix':
      headers['Origin'] = 'https://fenixplay.xyz';
      headers['Referer'] = 'https://fenixplay.xyz/';
      break;
    case 'ashdi':
      headers['Origin'] = 'https://ashdi.vip';
      headers['Referer'] = 'https://ashdi.vip/';
      break;
    case 'tortuga':
      headers['Origin'] = 'https://tortuga.tw';
      headers['Referer'] = 'https://tortuga.tw/';
      break;
  }

  return headers;
}
