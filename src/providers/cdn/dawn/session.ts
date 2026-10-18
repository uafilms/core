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
  result: { session: string; expiresAt: number; expiresIn?: number };
}

interface DawnSession {
  session: string;
  key: Buffer;
  expiresAt: number;
}

let cached: DawnSession | null = null;

/** Повертає активну сесію dawn, за потреби проходячи challenge + proof-of-work. */
export async function getDawnSession(signal?: AbortSignal): Promise<DawnSession> {
  if (cached && cached.expiresAt - DAWN_SESSION_MARGIN_MS > Date.now()) {
    return cached;
  }

  const challengeRes = await httpRequest<DawnChallengeResponse>(
    `${DAWN_API_ORIGIN}/player/dawn/challenge`,
    { headers: DAWN_HEADERS, timeout: DAWN_CHALLENGE_TIMEOUT, signal }
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
      signal,
    }
  );
  const issued = sessionRes.data?.result;
  if (!issued?.session) throw new Error('dawn session unavailable');

  cached = {
    session: issued.session,
    key: deriveDawnSessionKey(issued.session),
    expiresAt: issued.expiresAt || Date.now() + (issued.expiresIn ?? 1800) * 1000,
  };
  return cached;
}

export function invalidateDawnSession(session?: string): void {
  if (!session || cached?.session === session) cached = null;
}

/** Підписані запити dawn: конверт { n, d } і одна повторна спроба з новою сесією. */
export async function dawnRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await getDawnSession(signal);
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
