import type { Episode, Season, StreamSource, SearchResult, MediaType } from '../types/media.js';

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
 * Очищує рядок від розділових знаків та апострофів для зіставлення назв
 */
export function normalizeTitle(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/['’`ʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Службові слова та сполучники, які ігноруються при порядовому порівнянні токенів
 */
const STOP_WORDS = new Set([
  'і', 'й', 'та', 'в', 'у', 'на', 'з', 'зі', 'із', 'по', 'за', 'до', 'про', 'від', 'для',
  'a', 'an', 'the', 'and', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'
]);

/**
 * Розбиває назву на значущі токени
 */
export function tokenizeTitle(text?: string): string[] {
  const norm = normalizeTitle(text);
  if (!norm) return [];
  const words = norm.split(' ');
  const filtered = words.filter(w => !STOP_WORDS.has(w) && w.length > 1);
  return filtered.length > 0 ? filtered : words;
}

/**
 * Оцінює релевантність результату пошуку відносно запиту (0..100+)
 */
export function scoreSearchResult(
  result: SearchResult,
  query: string,
  targetYear?: number,
  targetType?: MediaType
): number {
  const normQ = normalizeTitle(query);
  if (!normQ) return 0;

  const qTokens = tokenizeTitle(query);
  // Якщо запит — лише число або IMDb ID (tt1234567)
  if (/^tt\d+$/.test(query.trim())) {
    if (result.id && result.id.includes(query.trim())) return 1000;
  }

  const candidateTitles = [result.title, result.originalTitle].filter(Boolean) as string[];
  let bestScore = 0;

  for (const candTitle of candidateTitles) {
    const normCand = normalizeTitle(candTitle);
    if (!normCand) continue;

    // 1. Точний збіг
    if (normCand === normQ) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }

    // 2. Префіксний збіг (наприклад, "Посіпаки" і "Посіпаки: Становлення лиходія")
    if (normCand.startsWith(normQ) || normQ.startsWith(normCand)) {
      const ratio = Math.min(normQ.length, normCand.length) / Math.max(normQ.length, normCand.length);
      bestScore = Math.max(bestScore, 80 + Math.round(ratio * 15));
      continue;
    }

    // 3. Підрядок (якщо рядок достатньо довгий)
    if (
      (normCand.includes(normQ) && normQ.length >= 4) ||
      (normQ.includes(normCand) && normCand.length >= 4)
    ) {
      const ratio = Math.min(normQ.length, normCand.length) / Math.max(normQ.length, normCand.length);
      bestScore = Math.max(bestScore, 65 + Math.round(ratio * 15));
      continue;
    }

    // 4. Збіг токенів
    const candTokens = tokenizeTitle(candTitle);
    if (qTokens.length > 0 && candTokens.length > 0) {
      // Текстові токени (без чистих цифр, якщо є текст)
      const textQTokens = qTokens.filter(t => !/^\d+$/.test(t));
      const tokensToCheck = textQTokens.length > 0 ? textQTokens : qTokens;

      const matchedTokens = tokensToCheck.filter(qt =>
        candTokens.some(ct => ct === qt || (ct.length >= 4 && qt.length >= 4 && (ct.includes(qt) || qt.includes(ct))))
      );

      const matchRatio = matchedTokens.length / tokensToCheck.length;

      if (tokensToCheck.length === 1) {
        if (matchRatio === 1) {
          bestScore = Math.max(bestScore, 70);
        }
      } else if (tokensToCheck.length === 2) {
        if (matchRatio === 1) {
          bestScore = Math.max(bestScore, 85);
        } else {
          // Якщо для 2-слівного запиту збіглося лише одне слово — це недостатній збіг
          bestScore = Math.max(bestScore, 20);
        }
      } else {
        if (matchRatio === 1) {
          bestScore = Math.max(bestScore, 85);
        } else if (matchRatio >= 0.75) {
          bestScore = Math.max(bestScore, 65);
        } else if (matchRatio >= 0.6) {
          bestScore = Math.max(bestScore, 35);
        } else {
          bestScore = Math.max(bestScore, Math.round(matchRatio * 25));
        }
      }
    }
  }

  // Якщо немає релевантного збігу взагалі, повертаємо 0
  if (bestScore === 0) return 0;

  // 5. Невідповідність типу медіа (movie vs tv)
  const itemType = result.type || (result as any).mediaType;
  if (targetType && itemType) {
    if (targetType === 'movie' && itemType === 'tv') {
      bestScore = Math.max(0, bestScore - 40);
    } else if (targetType === 'tv' && itemType === 'movie') {
      bestScore = Math.max(0, bestScore - 40);
    }
  }

  // 6. Вплив року випуску (якщо відомий)
  if (targetYear && result.year) {
    const yearDiff = Math.abs(result.year - targetYear);
    if (yearDiff === 0) {
      bestScore += 10;
    } else if (yearDiff === 1) {
      bestScore += 5;
    } else if (yearDiff >= 2) {
      // Якщо рік відрізняється на 2+ роки і назва не була точним збігом — штрафуємо
      if (bestScore < 95) {
        bestScore = Math.max(0, bestScore - Math.min(40, yearDiff * 10));
      }
    }
  }

  return bestScore;
}

/**
 * Перевіряє, чи результат пошуку є валідним збігом для заданого запиту
 */
export function isSearchResultMatch(
  result: SearchResult,
  query: string,
  targetYear?: number,
  targetType?: MediaType,
  minScore: number = 50
): boolean {
  if (!result || !query) return false;
  return scoreSearchResult(result, query, targetYear, targetType) >= minScore;
}

/**
 * Фільтрація та ранжування результатів пошуку:
 * Відкидає випадкові/нерелевантні збіги (DLE стоп-слова, помилкові збіги) і сортує за релевантністю
 */
export function rankSearchResults(
  results: SearchResult[],
  query: string,
  targetYear?: number,
  targetType?: MediaType
): SearchResult[] {
  if (!results || results.length === 0 || !query) return [];

  // Якщо запит — IMDb ID (tt...)
  if (/^tt\d+$/.test(query.trim())) {
    return results;
  }

  const scored = results
    .map(result => ({
      result,
      score: scoreSearchResult(result, query, targetYear, targetType),
    }))
    .filter(item => item.score >= 50);

  scored.sort((a, b) => b.score - a.score);

  return scored.map(item => item.result);
}

export const sortSearchResults = rankSearchResults;
