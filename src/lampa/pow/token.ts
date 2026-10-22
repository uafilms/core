import { requestJson } from '../utils/index.js';
import { solveChallenge, type ChallengePayload } from './solver.js';

declare const Lampa: any;

let memoryToken: string | null = null;
let memoryTokenExp = 0;
let solvingPromise: Promise<string | null> | null = null;

/**
 * Returns a valid PoW session token.
 * Only resolves when needed (lazy evaluation), and caches the result for 12 minutes.
 */
export async function getOrSolvePowToken(host: string): Promise<string | null> {
  const now = Date.now();

  // 1. Check in-memory token
  if (memoryToken && memoryTokenExp > now + 30000) {
    return memoryToken;
  }

  // 2. Check Lampa storage token
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const stored = Lampa.Storage.get('uafilms_pow_session', null);
      if (stored && stored.token && stored.exp > now + 30000) {
        memoryToken = stored.token;
        memoryTokenExp = stored.exp;
        return memoryToken;
      }
    }
  } catch {
    // Ignore storage read error
  }

  // 3. Deduplicate concurrent solving attempts
  if (solvingPromise) {
    return solvingPromise;
  }

  solvingPromise = (async () => {
    try {
      // Fetch challenge
      const challengeUrl = `${host}/api/challenge`;
      const challenge = await requestJson<ChallengePayload>(challengeUrl, 10000);

      if (!challenge || !challenge.salt) {
        return null;
      }

      // Solve PoW (typically takes 40-100ms)
      const solution = await solveChallenge(challenge);

      // Verify and obtain session token
      const verifyUrl = `${host}/api/challenge/verify`;
      let sessionToken: string | null = null;

      try {
        if (typeof fetch === 'function') {
          const resp = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(solution),
          });
          if (resp.ok) {
            const data = (await resp.json()) as { success: boolean; token?: string };
            sessionToken = data.token || null;
          }
        }
      } catch {
        // Fallback to sending raw solution in headers
      }

      if (sessionToken) {
        memoryToken = sessionToken;
        memoryTokenExp = Date.now() + 12 * 60 * 1000;
        try {
          if (typeof Lampa !== 'undefined' && Lampa.Storage) {
            Lampa.Storage.set('uafilms_pow_session', {
              token: sessionToken,
              exp: memoryTokenExp,
            });
          }
        } catch {
          // Ignore storage save error
        }
        return sessionToken;
      }

      // If verify endpoint unreachable, fallback to raw solution base64
      const rawSolutionB64 = btoa(JSON.stringify(solution));
      return rawSolutionB64;
    } catch {
      return null;
    } finally {
      solvingPromise = null;
    }
  })();

  return solvingPromise;
}
