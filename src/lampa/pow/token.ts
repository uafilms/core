import { postJson, requestJson } from '../utils/index.js';
import { solveChallenge, type ChallengePayload } from './solver.js';

declare const Lampa: any;

let memoryToken: string | null = null;
let memoryTokenExp = 0;
let solvingPromise: Promise<string | null> | null = null;

export function isPowRequired(): boolean {
  if (
    typeof window !== 'undefined' &&
    typeof (window as any).__UAFILMS_POW_REQUIRED__ === 'boolean'
  ) {
    return (window as any).__UAFILMS_POW_REQUIRED__;
  }
  return false;
}

export function setPowRequired(required: boolean): void {
  if (typeof window !== 'undefined') {
    (window as any).__UAFILMS_POW_REQUIRED__ = required;
  }
}

export function getCachedPowToken(): string | null {
  const now = Date.now();

  // 1. Check in-memory token
  if (memoryToken && memoryTokenExp > now + 30000) {
    return memoryToken;
  }

  // 2. Check Lampa storage token
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      let stored = Lampa.Storage.get('uafilms_pow_session', null);
      if (typeof stored === 'string') {
        try {
          stored = JSON.parse(stored);
        } catch {
          stored = null;
        }
      }
      if (stored && stored.token && typeof stored.exp === 'number' && stored.exp > now + 30000) {
        memoryToken = stored.token;
        memoryTokenExp = stored.exp;
        return memoryToken;
      }
    }
  } catch {
    // Ignore storage read error
  }

  return null;
}

export function invalidatePowToken(): void {
  memoryToken = null;
  memoryTokenExp = 0;
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      Lampa.Storage.set('uafilms_pow_session', null);
    }
  } catch {
    // Ignore
  }
}

/**
 * Returns a valid PoW session token.
 * Reuses cached token until expired. Only contacts /api/challenge when PoW is required by backend.
 */
export async function getOrSolvePowToken(host: string, force = false): Promise<string | null> {
  // If PoW is disabled on backend and not forced by a 403 response, return null immediately (0ms)
  if (!force && !isPowRequired()) {
    return null;
  }

  if (!force) {
    const cached = getCachedPowToken();
    if (cached) {
      return cached;
    }
  }

  // Deduplicate concurrent solving attempts
  if (solvingPromise) {
    return solvingPromise;
  }

  solvingPromise = (async () => {
    try {
      // 1. Fetch challenge
      const challengeUrl = `${host}/api/challenge`;
      const challenge = await requestJson<ChallengePayload>(challengeUrl, 10000);

      if (!challenge || !challenge.salt) {
        return null;
      }

      // 2. Solve PoW in JS (~30-80ms)
      const solution = await solveChallenge(challenge);

      // 3. Verify and obtain session token
      const verifyUrl = `${host}/api/challenge/verify`;
      let sessionToken: string | null = null;

      try {
        const verifyRes = await postJson<{ success: boolean; token?: string }>(
          verifyUrl,
          solution,
          10000
        );
        if (verifyRes && verifyRes.success && verifyRes.token) {
          sessionToken = verifyRes.token;
        }
      } catch {
        // Ignore verify failure
      }

      const tokenToCache = sessionToken || btoa(JSON.stringify(solution));
      const exp = Date.now() + 14 * 60 * 1000;

      memoryToken = tokenToCache;
      memoryTokenExp = exp;

      try {
        if (typeof Lampa !== 'undefined' && Lampa.Storage) {
          Lampa.Storage.set('uafilms_pow_session', {
            token: tokenToCache,
            exp,
          });
        }
      } catch {
        // Ignore storage save error
      }

      return tokenToCache;
    } catch {
      return null;
    } finally {
      solvingPromise = null;
    }
  })();

  return solvingPromise;
}
