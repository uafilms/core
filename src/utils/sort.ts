import type { Episode, Season, StreamSource, SearchResult } from '../types/media.js';

/**
 * Вага якості відео (більше = краще)
 */
export function getQualityWeight(quality?: string): number {
  if (!quality) return 0;
  const q = quality.toLowerCase();
  if (q.includes('2160') || q.includes('4k')) return 2160;
  if (q.includes('1440') || q.includes('2k')) return 1440;
  if (q.includes('1080')) return 1080;
  if (q.includes('720')) return 720;
  if (q.includes('480')) return 480;
  if (q.includes('360')) return 360;
  return 100;
}

/**
 * Вага озвучки (український дубляж найвищий пріоритет)
 */
export function getDubWeight(title?: string): number {
  if (!title) return 0;
  const t = title.toLowerCase();

  // Офіційний дубляж
  if (t.includes('дубльован') || t.includes('дубляж') || t.includes('ledoyen') || t.includes('postmodern')) {
    return 100;
  }
  // Багатоголосий закадровий (професійний / студійний)
  if (t.includes('багатоголос') || t.includes('dniprofilm') || t.includes('цікава ідея') || t.includes('бабайко')) {
    return 80;
  }
  // Двоголосий
  if (t.includes('двоголос')) {
    return 60;
  }
  // Одноголосий
  if (t.includes('одноголос')) {
    return 40;
  }
  // Оригінальний звук
  if (t.includes('оригінал') || t.includes('original') || t.includes('eng') || t.includes('en')) {
    return 20;
  }
  // Субтитри
  if (t.includes('sub') || t.includes('субтитр')) {
    return 10;
  }

  return 50; // За замовчуванням середня вага
}

/**
 * Сортування джерел: спочатку за типом озвучки, потім за якістю
 */
export function sortSources(sources: StreamSource[]): StreamSource[] {
  return [...sources].sort((a, b) => {
    const dubDiff = getDubWeight(b.title) - getDubWeight(a.title);
    if (dubDiff !== 0) return dubDiff;
    return getQualityWeight(b.quality) - getQualityWeight(a.quality);
  });
}

/**
 * Сортування епізодів за номером серії
 */
export function sortEpisodes(episodes: Episode[]): Episode[] {
  return [...episodes]
    .sort((a, b) => a.episode - b.episode)
    .map(ep => ({
      ...ep,
      sources: sortSources(ep.sources)
    }));
}

/**
 * Сортування сезонів за номером сезону
 */
export function sortSeasons(seasons: Season[]): Season[] {
  return [...seasons]
    .sort((a, b) => a.season - b.season)
    .map(s => ({
      ...s,
      episodes: sortEpisodes(s.episodes)
    }));
}

/**
 * Сортування результатів пошуку за точністю назви та року
 */
export function sortSearchResults(results: SearchResult[], query: string, targetYear?: number): SearchResult[] {
  const cleanQ = query.trim().toLowerCase();

  return [...results].sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();

    // 1. Точний збіг назви
    const aExact = aTitle === cleanQ ? 1 : 0;
    const bExact = bTitle === cleanQ ? 1 : 0;
    if (bExact !== aExact) return bExact - aExact;

    // 2. Починається з пошукового запиту
    const aStarts = aTitle.startsWith(cleanQ) ? 1 : 0;
    const bStarts = bTitle.startsWith(cleanQ) ? 1 : 0;
    if (bStarts !== aStarts) return bStarts - aStarts;

    // 3. Збіг року (якщо заданий)
    if (targetYear) {
      const aYearDiff = a.year ? Math.abs(a.year - targetYear) : 99;
      const bYearDiff = b.year ? Math.abs(b.year - targetYear) : 99;
      if (aYearDiff !== bYearDiff) return aYearDiff - bYearDiff;
    }

    return 0;
  });
}

export const rankSearchResults = sortSearchResults;

