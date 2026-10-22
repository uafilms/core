import crypto from 'node:crypto';
import type { Context } from 'hono';

const POW_SECRET = process.env.POW_SECRET || process.env.JWT_SECRET || 'uafilms-pow-secret-default-2026';
const DEFAULT_DIFFICULTY = parseInt(process.env.POW_DIFFICULTY || '4', 10);
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory replay protection for used salts
const usedSalts = new Map<string, number>();

// Periodic cleanup of expired salts every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [salt, expiresAt] of usedSalts.entries()) {
    if (expiresAt < now) {
      usedSalts.delete(salt);
    }
  }
}, 5 * 60 * 1000).unref?.();

function signString(data: string): string {
  return crypto.createHmac('sha256', POW_SECRET).update(data).digest('hex');
}

export interface PowChallenge {
  salt: string;
  difficulty: number;
  timestamp: number;
  signature: string;
}

export interface PowResponsePayload {
  salt: string;
  nonce: number;
  timestamp: number;
  signature: string;
}

export function generatePowChallenge(difficulty = DEFAULT_DIFFICULTY): PowChallenge {
  const salt = crypto.randomBytes(12).toString('hex');
  const timestamp = Date.now();
  const signature = signString(`${salt}:${timestamp}:${difficulty}`);

  return {
    salt,
    difficulty,
    timestamp,
    signature,
  };
}

export function createPowSessionToken(clientIp: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = JSON.stringify({ ip: clientIp, exp: expiresAt });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = signString(b64);
  return {
    token: `${b64}.${sig}`,
    expiresAt,
  };
}

export function verifyPowSessionToken(token: string, clientIp: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [b64, sig] = parts;
  const expectedSig = signString(b64);
  if (sig !== expectedSig) return false;

  try {
    const raw = Buffer.from(b64, 'base64url').toString('utf-8');
    const data = JSON.parse(raw);
    if (!data.exp || data.exp < Date.now()) {
      return false;
    }
    // Allow matching IP or unknown
    if (data.ip && clientIp && clientIp !== 'unknown' && data.ip !== 'unknown') {
      if (data.ip !== clientIp) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function verifyPowSolution(
  solution: PowResponsePayload,
  clientIp: string
): { success: boolean; sessionToken?: string; error?: string } {
  const { salt, nonce, timestamp, signature } = solution;

  if (!salt || typeof nonce !== 'number' || !timestamp || !signature) {
    return { success: false, error: 'INVALID_POW_PAYLOAD' };
  }

  // 1. Check expiration
  const now = Date.now();
  if (Math.abs(now - timestamp) > CHALLENGE_TTL_MS) {
    return { success: false, error: 'POW_CHALLENGE_EXPIRED' };
  }

  // 2. Replay protection
  if (usedSalts.has(salt)) {
    return { success: false, error: 'POW_SALT_ALREADY_USED' };
  }

  // 3. Verify HMAC signature (checks salt, timestamp, and difficulty)
  let matchedDifficulty: number | null = null;
  // Check default difficulty and neighboring values in case env changed
  for (const diff of [DEFAULT_DIFFICULTY, 3, 4, 5]) {
    const expectedSig = signString(`${salt}:${timestamp}:${diff}`);
    if (signature === expectedSig) {
      matchedDifficulty = diff;
      break;
    }
  }

  if (matchedDifficulty === null) {
    return { success: false, error: 'POW_INVALID_SIGNATURE' };
  }

  // 4. Verify hash
  const hash = crypto.createHash('sha256').update(`${salt}:${nonce}`).digest('hex');
  const targetPrefix = '0'.repeat(matchedDifficulty);

  if (!hash.startsWith(targetPrefix)) {
    return { success: false, error: 'POW_INCORRECT_HASH' };
  }

  // Mark salt as consumed
  usedSalts.set(salt, now + CHALLENGE_TTL_MS);

  // Generate reusable session token for client
  const session = createPowSessionToken(clientIp);
  return { success: true, sessionToken: session.token };
}

export function extractPowFromRequest(c: Context): {
  token?: string;
  solution?: PowResponsePayload;
} {
  // 1. Session token
  const headerToken = c.req.header('x-pow-token');
  const queryToken = c.req.query('pow_token');
  const token = (headerToken || queryToken || '').trim();

  // 2. Raw solution payload
  const headerResponse = c.req.header('x-pow-response');
  const queryResponse = c.req.query('pow_response');
  const rawResponse = headerResponse || queryResponse;

  let solution: PowResponsePayload | undefined = undefined;
  if (rawResponse) {
    try {
      const decoded = rawResponse.startsWith('{')
        ? rawResponse
        : Buffer.from(rawResponse, 'base64url').toString('utf-8');
      solution = JSON.parse(decoded);
    } catch {
      // Ignore parse failure
    }
  }

  return { token: token || undefined, solution };
}
