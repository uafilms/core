import { base64ToBytes, xorDecodeText } from '../shared/codec.js';

function xorKey(key: number, i: number): number {
  return (key + i * 7 + 13) % 256;
}

/**
 * Розшифрування XOR-зашифрованого рядка Tortuga (алгоритм з tor.core.min.js).
 * Перший байт payload — ключ, решта — XOR із похідним ключовим потоком.
 */
export function decodeTortuga(encoded: string | null | undefined): string | null {
  if (!encoded || typeof encoded !== 'string' || !encoded.trim()) {
    return null;
  }

  try {
    const raw = base64ToBytes(encoded, true);
    if (raw.length < 2) return null;

    const key = raw[0];
    return xorDecodeText(raw.subarray(1), (i) => xorKey(key, i));
  } catch {
    return null;
  }
}
