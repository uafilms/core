import { parsePlayerjsJson } from './json.js';

/** Прибирає екрановані слеші: `https:\/\/host\/x` -> `https://host/x` */
export function unescapePlayerjsSlashes(value: string): string {
  return value.replace(/\\\//g, '/');
}

/**
 * Витягує сире значення `file:` з лапками: `file:"..."` / `file:'...'`.
 * Якщо лапкового варіанту немає, з опцією `playerjsConfig` пробує конфіг `new Playerjs({...})`.
 */
export function extractQuotedFileValue(html: string, opts: { playerjsConfig?: boolean } = {}): string | null {
  const fileMatch = html.match(/file\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
  if (fileMatch && fileMatch[2]) {
    return fileMatch[2];
  }

  if (opts.playerjsConfig) {
    const pjsMatch = html.match(/new\s+Playerjs\s*\(\s*(\{[\s\S]*?\})\s*\)/);
    if (pjsMatch) {
      const config = parsePlayerjsJson(pjsMatch[1]);
      if (config && config.file) {
        return typeof config.file === 'string' ? config.file : JSON.stringify(config.file);
      }
    }
  }

  return null;
}

/**
 * Сканер значення `file:` без залежності від лапок: сам знаходить межу рядка,
 * масиву або об'єкта (потрібен для сторінок, де JSON вставлено як голий літерал).
 */
export function extractFileValueDeep(html: string): string | null {
  if (!html || typeof html !== 'string') return null;

  const header = html.match(/file\s*:\s*/);
  if (!header) return null;

  const afterFile = html.substring(html.search(/file\s*:\s*/) + header[0].length).trim();
  let fileValue = '';

  if (afterFile.startsWith('[') || afterFile.startsWith('{')) {
    const openChar = afterFile[0];
    const closeChar = openChar === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < afterFile.length; i++) {
      const ch = afterFile[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"' && !escaped) {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === openChar) depth++;
        if (ch === closeChar) {
          depth--;
          if (depth === 0) {
            fileValue = afterFile.substring(0, i + 1);
            break;
          }
        }
      }
    }
  } else if (afterFile.startsWith("'") || afterFile.startsWith('"')) {
    const quote = afterFile[0];
    let escaped = false;
    for (let i = 1; i < afterFile.length; i++) {
      const ch = afterFile[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        fileValue = afterFile.substring(1, i);
        break;
      }
    }
  }

  return fileValue || null;
}
