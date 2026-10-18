import { httpRequest } from '../../../utils/http.js';
import {
  DAWN_API_ORIGIN,
  DAWN_CHALLENGE_TIMEOUT,
  DAWN_HEADERS,
  DAWN_REQUEST_TIMEOUT,
  DAWN_SESSION_ERROR_RE,
  DAWN_SESSION_MARGIN_MS,
  DAWN_SESSION_TIMEOUT,
} from './config.js';
import { decryptDawnPayload, deriveDawnSessionKey, solveDawnChallenge } from './decrypt.js';

interface DawnChallengeResponse {
  ok: boolean;
  result: { challenge: string; difficulty: number; expiresAt: number };
}

interface DawnSessionResponse {
  ok: boolean;
  result: { session: string; expiresAt?: string | number; expiresIn?: number };
}

interface DawnSession {
  session: string;
  key: Buffer;
  expiresAt: number;
}

/**
 * API віддає expiresAt рядком ISO 8601, тож без розбору дати порівняння з
 * Date.now() давало NaN і handshake виконувався на кожен запит.
 */
function resolveSessionExpiry(expiresAt: string | number | undefined, expiresIn?: number): number {
  if (typeof expiresAt === 'string') {
    const parsed = Date.parse(expiresAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  }
  return Date.now() + (expiresIn ?? 1800) * 1000;
}

let cached: DawnSession | null = null;
let pendingHandshake: Promise<DawnSession> | null = null;

/**
 * Виконує challenge + proof-of-work. Довільний signal сюди не передається:
 * сесія спільна на процес, тож скасування одного виклику не повинно зривати
 * handshake для всіх інших.
 */
async function performHandshake(): Promise<DawnSession> {
  const challengeRes = await httpRequest<DawnChallengeResponse>(
    `${DAWN_API_ORIGIN}/player/dawn/challenge`,
    { headers: DAWN_HEADERS, timeout: DAWN_CHALLENGE_TIMEOUT }
  );
  const challenge = challengeRes.data?.result;
  if (!challenge?.challenge) throw new Error('dawn challenge unavailable');

  const nonce = solveDawnChallenge(challenge.challenge, challenge.difficulty);

  const sessionRes = await httpRequest<DawnSessionResponse>(
    `${DAWN_API_ORIGIN}/player/dawn/session`,
    {
      method: 'POST',
      headers: { ...DAWN_HEADERS, 'Content-Type': 'application/json' },
      data: { challenge: challenge.challenge, nonce },
      timeout: DAWN_SESSION_TIMEOUT,
    }
  );
  const issued = sessionRes.data?.result;
  if (!issued?.session) throw new Error('dawn session unavailable');

  cached = {
    session: issued.session,
    key: deriveDawnSessionKey(issued.session),
    expiresAt: resolveSessionExpiry(issued.expiresAt, issued.expiresIn),
  };
  return cached;
}

/**
 * Повертає активну сесію dawn. Handshake виконується лише тоді, коли сесія
 * справді знадобилась і вже протермінована; паралельні виклики чекають на
 * спільну спробу, а не роблять власний handshake.
 */
export async function getDawnSession(): Promise<DawnSession> {
  if (cached && cached.expiresAt - DAWN_SESSION_MARGIN_MS > Date.now()) {
    return cached;
  }

  if (!pendingHandshake) {
    pendingHandshake = performHandshake().finally(() => {
      pendingHandshake = null;
    });
  }

  return pendingHandshake;
}

export function invalidateDawnSession(session?: string): void {
  if (!session || cached?.session === session) cached = null;
}

/** Підписані запити dawn: конверт { n, d } і одна повторна спроба з новою сесією. */
export async function dawnRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await getDawnSession();
    try {
      const res = await httpRequest<{ ok: boolean; result: { n: string; d: string } }>(
        `${DAWN_API_ORIGIN}${path}`,
        {
          headers: { ...DAWN_HEADERS, 'X-Dawn-Session': current.session },
          timeout: DAWN_REQUEST_TIMEOUT,
          signal,
        }
      );
      const payload = res.data?.result;
      if (!payload?.n || !payload?.d) throw new Error('dawn payload unavailable');
      return decryptDawnPayload<T>(payload, current.key);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = String(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? (err as Error)?.message ?? ''
      );
      if (attempt === 0 && status === 403 && DAWN_SESSION_ERROR_RE.test(message)) {
        invalidateDawnSession(current.session);
        continue;
      }
      throw err;
    }
  }

  throw new Error('dawn request failed');
}
