import type { Subtitle } from '../../types/media.js';

export function normalizeHdvbUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim();
  if (clean.startsWith('//')) {
    clean = 'https:' + clean;
  }
  return clean;
}

export function parseHdvbSubtitles(subInput?: string): Subtitle[] {
  if (!subInput || typeof subInput !== 'string') return [];
  const subs: Subtitle[] = [];
  const regex = /(?:\[(.*?)\])?(https?:\/\/[^,\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(subInput)) !== null) {
    const label = match[1] || 'Default';
    const labelLower = label.toLowerCase();
    let lang = 'ua';
    if (labelLower.includes('en') || labelLower.includes('англ') || labelLower.includes('english')) {
      lang = 'en';
    } else if (labelLower.includes('ua') || labelLower.includes('укр') || labelLower.includes('ukrainian')) {
      lang = 'ua';
    }
    subs.push({
      label,
      lang,
      url: match[2],
    });
  }

  return subs;
}

/**
 * Витягує та декодує значення `file:` з HTML коду Playerjs
 */
export function extractFileFromHtml(html: string): any {
  if (!html || typeof html !== 'string') return null;

  // 1. Шукаємо позицію "file:"
  const filePos = html.search(/file\s*:\s*/);
  if (filePos === -1) return null;

  const matchHeader = html.match(/file\s*:\s*/);
  if (!matchHeader) return null;

  const afterFile = html.substring(filePos + matchHeader[0].length).trim();
  let fileValue = '';

  if (afterFile.startsWith('[') || afterFile.startsWith('{')) {
    // Вкладена структура JSON без лапок
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
    // Рядок у лапках
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

  if (!fileValue) return null;

  // Якщо рядок починається з [ або { - пробуємо спарсити як JSON
  if (fileValue.startsWith('[') || fileValue.startsWith('{')) {
    try {
      return JSON.parse(fileValue);
    } catch {
      // Можливо всередині є escaped лапки
      try {
        const unescaped = fileValue.replace(/\\'/g, "'").replace(/\\"/g, '"');
        return JSON.parse(unescaped);
      } catch {
        return null;
      }
    }
  }

  // Пряме посилання на відео
  if (fileValue.startsWith('http') || fileValue.startsWith('//')) {
    return normalizeHdvbUrl(fileValue);
  }

  return fileValue;
}
