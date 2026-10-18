/**
 * Дешифрування обфускованого плеєра MoonAnime (moonanime.art).
 */

import { base64ToBytes, xorDecodeText } from '../shared/codec.js';

const MOON_OUTER_MARKERS = ['Playerjs', 'file:', '_0xd'];
const MOON_INNER_FALLBACK_KEY = 'mAnK';

export function moonOuterDecode(html: string): string | null {
  const match = html.match(/var\s+_\w+\s*=\s*atob\("([^"]+)"\)/);
  if (!match) return null;

  try {
    const b = base64ToBytes(match[1]);
    if (b.length <= 33) return null;

    // 1. Try modern rolling XOR cipher
    let rolling = b[0];
    const key = b.subarray(1, 33);
    const x = Buffer.alloc(b.length - 33);
    for (let i = 0; i < x.length; i++) {
      const byte = b[i + 33];
      const keyByte = key[i % 32];
      x[i] = byte ^ keyByte ^ rolling;
      rolling = (byte + keyByte) & 255;
    }

    const text = x.toString('utf-8');
    if (MOON_OUTER_MARKERS.some((marker) => text.includes(marker))) {
      return text;
    }

    // 2. Fallback to legacy static XOR
    const legacyKey = b.subarray(0, 32);
    const legacyX = Buffer.alloc(b.length - 32);
    for (let i = 0; i < legacyX.length; i++) {
      legacyX[i] = b[i + 32] ^ legacyKey[i % 32];
    }
    const legacyText = legacyX.toString('utf-8');
    if (MOON_OUTER_MARKERS.some((marker) => legacyText.includes(marker))) {
      return legacyText;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractDynamicKey(jsText: string): string | null {
  const funcMatch = jsText.match(/function\s+_0xd\([^)]*\)\s*\{\s*var\s+k\s*=\s*"([^"]+)"/);
  if (funcMatch) return funcMatch[1];

  const varMatch = jsText.match(/var\s+k\s*=\s*"([A-Za-z0-9_-]{4,32})"/);
  if (varMatch) return varMatch[1];

  return null;
}

export function moonInnerDecode(encoded: string, key?: string | null): string | null {
  const keysToTry = key ? [key, MOON_INNER_FALLBACK_KEY] : [MOON_INNER_FALLBACK_KEY];

  for (const k of keysToTry) {
    try {
      const decoded = xorDecodeText(base64ToBytes(encoded), (i) => k.charCodeAt(i % k.length));

      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.includes('[') || decoded.includes('.m3u8')) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  return null;
}
