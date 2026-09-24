import type { Subtitle } from '../types/media.js';

/**
 * Парсинг рядка субтитрів Playerjs формату:
 * "[Українська]https://site.com/ua.vtt,[English]https://site.com/en.vtt"
 * або "[UA]https://...vtt,"
 */
export function parsePlayerjsSubtitles(subInput: string | null | undefined): Subtitle[] {
  if (!subInput || typeof subInput !== 'string') return [];

  const cleaned = subInput.replace(/\\\//g, '/').trim();
  if (!cleaned) return [];

  const subs: Subtitle[] = [];
  const regex = /(?:\[(.*?)\])?(https?:\/\/[^,\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const rawLabel = match[1]?.trim() || 'Default';
    const url = match[2]?.trim();
    if (!url) continue;

    const labelLower = rawLabel.toLowerCase();
    let lang = 'ua';
    if (labelLower.includes('en') || labelLower.includes('англ') || labelLower.includes('english')) {
      lang = 'en';
    } else if (labelLower.includes('ua') || labelLower.includes('укр') || labelLower.includes('ukrainian')) {
      lang = 'ua';
    } else if (labelLower.includes('pl') || labelLower.includes('польськ') || labelLower.includes('polish')) {
      lang = 'pl';
    } else if (labelLower.includes('de') || labelLower.includes('німецьк') || labelLower.includes('german')) {
      lang = 'de';
    } else if (labelLower.includes('fr') || labelLower.includes('французьк') || labelLower.includes('french')) {
      lang = 'fr';
    } else if (labelLower.includes('es') || labelLower.includes('іспанськ') || labelLower.includes('spanish')) {
      lang = 'es';
    } else if (labelLower.includes('ja') || labelLower.includes('японськ') || labelLower.includes('japanese')) {
      lang = 'ja';
    }

    subs.push({
      label: rawLabel,
      lang,
      url,
    });
  }

  return subs;
}
