import crypto from 'node:crypto';
import { DAWN_SESSION_KEY } from './config.js';

export interface DawnEncryptedPayload {
  /** base64 IV (12 байт). */
  n: string;
  /** base64: ciphertext + 16-байтний GCM-тег. */
  d: string;
}

/**
 * Proof-of-work: найменший nonce, за якого SHA-256(challenge + nonce)
 * має щонайменше `difficulty` нульових бітів.
 */
export function solveDawnChallenge(challenge: string, difficulty: number): string {
  for (let nonce = 0; ; nonce += 1) {
    const hash = crypto.createHash('sha256').update(challenge + nonce, 'latin1').digest();
    if (countLeadingZeroBits(hash) >= difficulty) return String(nonce);
  }
}

function countLeadingZeroBits(buffer: Buffer): number {
  let bits = 0;
  for (const byte of buffer) {
    if (byte !== 0) return bits + Math.clz32(byte) - 24;
    bits += 8;
  }
  return bits;
}

/** Сесійний ключ = HMAC-SHA256("dawn:aurora:v1", session). */
export function deriveDawnSessionKey(session: string): Buffer {
  return crypto.createHmac('sha256', DAWN_SESSION_KEY).update(session).digest();
}

/** Розшифровка конверта { n, d } у JSON. */
export function decryptDawnPayload<T>(payload: DawnEncryptedPayload, key: Buffer): T {
  const iv = Buffer.from(payload.n, 'base64');
  const data = Buffer.from(payload.d, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([
    decipher.update(data.subarray(0, data.length - 16)),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8')) as T;
}
