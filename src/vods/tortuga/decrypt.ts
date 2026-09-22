function xorKey(n: number, i: number): number {
  return (n + i * 7 + 13) % 256;
}

/**
 * Розшифрування XOR-зашифрованого рядка Tortuga (алгоритм з tor.core.min.js)
 */
export function decodeTortuga(encoded: string | null | undefined): string | null {
  if (!encoded || typeof encoded !== 'string' || !encoded.trim()) {
    return null;
  }

  try {
    const clean = encoded.replace(/==+$/, '');
    const raw = Buffer.from(clean, 'base64').toString('binary');
    if (raw.length < 2) return null;

    const key = raw.charCodeAt(0);
    let out = '';
    for (let i = 1; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ xorKey(key, i - 1));
    }

    try {
      return decodeURIComponent(escape(out));
    } catch {
      return out;
    }
  } catch {
    return null;
  }
}
