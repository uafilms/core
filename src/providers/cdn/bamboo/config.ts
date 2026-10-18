/** Базова адреса сторінок BambooUA. */
export const BAMBOO_URL = 'https://bambooua.com';

/** Заголовки, які CDN вимагає для віддачі потоків. */
export const BAMBOO_REFERER = 'https://bambooua.com/';
export const BAMBOO_ORIGIN = 'https://bambooua.com';

/** Якість, яку BambooUA віддає для всіх потоків. */
export const BAMBOO_QUALITY = '1080p';

/** Маркери платних або службових файлів у плейлисті. */
export const BAMBOO_SPONSOR_PLACEHOLDER = 'be_sponsors.mp4';
export const BAMBOO_SPONSOR_UPLOAD_MARKER = '/uploads/be_sponsors';

/** Приставки платного доступу, які зрізаються з назв озвучок. */
export const BAMBOO_PAYWALL_SUBSCRIBERS_RE = /\s*\(для підписників\)/gi;
export const BAMBOO_PAYWALL_SPONSORS_RE = /\s*\(для спонсорів\)/gi;

/** Вбудований плейлист сторінки: `const playlist = [...];` */
export const BAMBOO_PLAYLIST_RE = /const\s+playlist\s*=\s*(\[[\s\S]*?\])\s*;/;

/** Сезон/епізод у шляху до файлу: /s(\d+)\/(\d+)/ */
export const BAMBOO_URL_SEASON_EPISODE_RE = /\/s(\d+)\/(\d+)\//i;
