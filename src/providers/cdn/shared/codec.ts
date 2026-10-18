/**
 * Спільні примітиви для CDN, які віддають base64 + XOR-обфускацію.
 */

/** Розшифрування base64 у байти; `stripPadding` прибирає хвостові `=` (деякі CDN додають їх довільно). */
export function base64ToBytes(encoded: string, stripPadding = false): Buffer {
  const clean = stripPadding ? encoded.replace(/==+$/, '') : encoded;
  return Buffer.from(clean, 'base64');
}

/**
 * XOR байтів із довільним ключовим потоком і відновленням URI-escape послідовностей:
 * `decodeURIComponent(escape(text))` з відкатом на сирий текст.
 */
export function xorDecodeText(bytes: Buffer, keyAt: (index: number) => number): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ^ keyAt(i));
  }

  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}
