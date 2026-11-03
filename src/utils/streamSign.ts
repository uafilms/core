import crypto from 'node:crypto';

/**
 * Підписує URL, які наш проксі сам згенерував у плейлистах.
 * Це не авторизація користувача: підпис лише доводить, що цільовий URL
 * видав сервер, а не довільний клієнт. Без нього /segment і proxy-URL
 * з `url=` перетворюються на відкритий проксі.
 */

const DEFAULT_JWT_SECRET = 'your_jwt_secret_key_here';
const configuredSecret = process.env.STREAM_SIGNING_SECRET || process.env.JWT_SECRET || '';
const hasConfiguredSecret =
  Boolean(configuredSecret) &&
  configuredSecret !== DEFAULT_JWT_SECRET &&
  configuredSecret.length >= 16;

const SIGNING_SECRET = hasConfiguredSecret
  ? configuredSecret
  : crypto.randomBytes(32).toString('hex');

if (!hasConfiguredSecret) {
  console.warn(
    '[streamSign] STREAM_SIGNING_SECRET/JWT_SECRET is missing or too short; ' +
      'using a per-process random secret. Signed proxy URLs will stop working after restart.'
  );
}

const PROXY_PATHS = new Set([
  '/master.m3u8',
  '/subs.m3u8',
  '/subs.vtt',
  '/subs.ass',
  '/segment',
  '/video.mp4',
]);

export function signStreamTarget(target: string): string {
  return crypto.createHmac('sha256', SIGNING_SECRET).update(target).digest('base64url');
}

export function verifyStreamTarget(target: string, signature?: string | null): boolean {
  if (!target || !signature) return false;

  const expected = signStreamTarget(target);
  const provided = signature.trim();
  if (expected.length !== provided.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function getProxyTarget(parsed: URL): string | null {
  const urlParam = parsed.searchParams.get('url');
  if (urlParam) return urlParam;

  const idParam = parsed.searchParams.get('id');
  if (idParam && /^https?:\/\//i.test(idParam)) return idParam;

  return null;
}

/**
 * Додає `sig` до proxy-URL, якщо в ньому є `url=` або `id=` з http(s)-адресою.
 * Звичайні CDN-URL повертає без змін.
 */
export function signProxyUrl(url: string): string {
  if (!url) return url;

  try {
    const parsed = new URL(url, 'http://localhost');
    if (!PROXY_PATHS.has(parsed.pathname)) return url;

    const target = getProxyTarget(parsed);
    if (!target) return url;

    parsed.searchParams.set('sig', signStreamTarget(target));

    // Відносний URL не повинен перетворюватися на http://localhost/...
    return parsed.origin === 'http://localhost'
      ? `${parsed.pathname}${parsed.search}`
      : parsed.toString();
  } catch {
    return url;
  }
}

export function hasValidProxySignature(parsed: URL): boolean {
  const target = getProxyTarget(parsed);
  if (!target) return false;

  return verifyStreamTarget(target, parsed.searchParams.get('sig'));
}
