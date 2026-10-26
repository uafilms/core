import { base64ToBytes, xorDecodeText } from '../shared/codec.js';

function xorKey(key: number, i: number): number {
  return (key + i * 7 + 13) % 256;
}

/**
 * Розшифрування XOR-зашифрованого рядка Tortuga (алгоритм з tor.core.v3.min.js).
 * Перший байт payload — ключ, решта — XOR із похідним ключовим потоком.
 * Підтримує tor.core.v3 (хвостовий `==` / суфікс).
 */
export function decodeTortuga(encoded: string | null | undefined): string | null {
  if (!encoded || typeof encoded !== 'string' || !encoded.trim()) {
    return null;
  }

  const payload = encoded.trim();
  if (payload.startsWith('http://') || payload.startsWith('https://')) {
    return payload;
  }

  try {
    const raw = base64ToBytes(payload, false);
    if (raw.length >= 2) {
      const decoded = xorDecodeText(raw.subarray(1), (i) => xorKey(raw[0], i));
      if (decoded && (decoded.startsWith('http') || decoded.startsWith('[') || decoded.startsWith('{') || decoded.startsWith('{') || decoded.length > 0)) {
        return decoded;
      }
    }

    // Якщо присутній штучний суфікс '==' від tor.core.v3
    if (payload.endsWith('==')) {
      const rawSliced = base64ToBytes(payload.slice(0, -2), false);
      if (rawSliced.length >= 2) {
        const decoded = xorDecodeText(rawSliced.subarray(1), (i) => xorKey(rawSliced[0], i));
        if (decoded) return decoded;
      }
    }

    return null;
  } catch {
    return null;
  }
}
