/**
 * Парсинг субтитрів Ashdi форматів: "[Ukr]https://...vtt,[Eng]https://..."
 */
export function parseAshdiSubtitles(subInput: string | null | undefined): Array<{ lang: string; label: string; url: string }> {
  if (!subInput || typeof subInput !== 'string') return [];

  const subs: Array<{ lang: string; label: string; url: string }> = [];
  const regex = /(?:\[(.*?)\])?(https?:\/\/[^,]+)/g;
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
 * Розшифрування чи нормалізація обфускованих рядків Ashdi (0yql3tj -> oyql3tj тощо)
 */
export function normalizeAshdiUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/0yql3tj/g, 'oyql3tj');
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  return url;
}
