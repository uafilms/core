/**
 * Decryption utilities for MoonAnime player (moonanime.art)
 */

export function moonOuterDecode(html: string): string | null {
  const match = html.match(/var\s+_\w+\s*=\s*atob\("([^"]+)"\)/);
  if (!match) return null;

  try {
    const b = Buffer.from(match[1], 'base64');
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
    if (text.includes('Playerjs') || text.includes('file:') || text.includes('_0xd')) {
      return text;
    }

    // 2. Fallback to legacy static XOR
    const legacyKey = b.subarray(0, 32);
    const legacyX = Buffer.alloc(b.length - 32);
    for (let i = 0; i < legacyX.length; i++) {
      legacyX[i] = b[i + 32] ^ legacyKey[i % 32];
    }
    const legacyText = legacyX.toString('utf-8');
    if (legacyText.includes('Playerjs') || legacyText.includes('file:') || legacyText.includes('_0xd')) {
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
  const keysToTry = key ? [key, 'mAnK'] : ['mAnK'];

  for (const k of keysToTry) {
    try {
      const b = Buffer.from(encoded, 'base64');
      let r = '';
      for (let i = 0; i < b.length; i++) {
        r += String.fromCharCode(b[i] ^ k.charCodeAt(i % k.length));
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(escape(r));
      } catch {
        decoded = r;
      }

      if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.includes('[') || decoded.includes('.m3u8')) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function decryptMoonAnimeIframe(html: string): { file: string; poster?: string } | null {
  const decodedJs = moonOuterDecode(html);
  if (!decodedJs) return null;

  const dynKey = extractDynamicKey(decodedJs);

  let fileValue: string | null = null;

  // Pattern 1: Modern MoonAnime format: var rawVideo = _0xd("...");
  const rawVideoEncodedMatch = decodedJs.match(/var\s+rawVideo\s*=\s*_0xd\("([^"]+)"\)/);
  if (rawVideoEncodedMatch) {
    fileValue = moonInnerDecode(rawVideoEncodedMatch[1], dynKey);
  }

  // Pattern 2: Legacy file: _0xd("...")
  if (!fileValue) {
    const fileEncodedMatch = decodedJs.match(/file:\s*_0xd\("([^"]+)"\)/);
    if (fileEncodedMatch) {
      fileValue = moonInnerDecode(fileEncodedMatch[1], dynKey);
    }
  }

  // Pattern 3: Literal var rawVideo = "..." or file: "..."
  if (!fileValue) {
    const rawMatch = decodedJs.match(/(?:var\s+rawVideo\s*=\s*|file:\s*)"([^"]+)"/);
    if (rawMatch) fileValue = rawMatch[1];
  }

  if (!fileValue) return null;

  let poster: string | undefined;

  // Check modern rawPoster = _0xd("...")
  const rawPosterEncodedMatch = decodedJs.match(/var\s+rawPoster\s*=\s*_0xd\("([^"]+)"\)/);
  if (rawPosterEncodedMatch) {
    const decodedPoster = moonInnerDecode(rawPosterEncodedMatch[1], dynKey);
    if (decodedPoster && decodedPoster.startsWith('http')) {
      poster = decodedPoster;
    }
  }

  // Fallback poster check
  if (!poster) {
    const posterMatch = decodedJs.match(/(?:var\s+rawPoster\s*=\s*|poster:\s*)"([^"]+)"/);
    if (posterMatch && posterMatch[1].startsWith('http')) {
      poster = posterMatch[1];
    }
  }

  return { file: fileValue, poster };
}
