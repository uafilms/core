/** Приватний player API mikai.me, через який віддається CDN Dawn. */
export const DAWN_API_ORIGIN = 'https://api.mikai.me/v1';

export const DAWN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const DAWN_HEADERS: Record<string, string> = {
  'User-Agent': DAWN_UA,
  Accept: 'application/json',
  Origin: 'https://mikai.me',
  Referer: 'https://mikai.me/',
};

/** Ключ HMAC, з якого виводиться AES-256-GCM ключ сесії. */
export const DAWN_SESSION_KEY = 'dawn:aurora:v1';

/** Запас до expiresAt, щоб не починати запит сесією, яка от-от протухне. */
export const DAWN_SESSION_MARGIN_MS = 60_000;

export const DAWN_CHALLENGE_TIMEOUT = 10_000;
export const DAWN_SESSION_TIMEOUT = 10_000;
export const DAWN_REQUEST_TIMEOUT = 10_000;

/** Dawn віддає ту саму бібліотеку moonanime, тому в UI показується як MoonAnime. */
export const DAWN_SOURCE_TITLE = 'MoonAnime';
export const DAWN_MIME = 'application/x-mpegURL';

/** 403, після яких mikai очікує нову сесію. */
export const DAWN_SESSION_ERROR_RE = /^dawn (session|challenge)/i;
