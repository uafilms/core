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
 * Сортування назв аудіодоріжок (озвучок) для HLS-груп і API:
 * спершу українські дубляжі за вагою студії, «Оригінал» та англійська — нижче,
 * субтитри — в самому кінці; однакові ваги — за абеткою.
 */
export function sortAudioTrackLabels(labels: string[]): string[] {
  // «Оригінал» — завжди в самий низ: це не дубляж, а мовна доріжка без озвучки.
  const isOriginal = (label: string) => /оригінал|original/i.test(label);
  return [...labels].sort((a, b) => {
    const originalDiff = Number(isOriginal(a)) - Number(isOriginal(b));
    if (originalDiff !== 0) return originalDiff;
    const diff = getDubWeight(b) - getDubWeight(a);
    if (diff !== 0) return diff;
    return a.localeCompare(b, 'uk');
  });
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
  return [...episodes].sort((a, b) => a.episode - b.episode);
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
 * Технічні слова релізів (сезони, серії, формати), які не є частиною унікальної назви
 */
const MEDIA_NOISE_WORDS = new Set([
  'сезон', 'season', 'серія', 'серії', 'серій', 'серіал', 'серіалу',
  'фільм', 'фільму', 'мультфільм', 'мультсеріал', 'частина', 'part', 'cour'
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

export interface TitleSeasonInfo {
  season: number | null;
  part: number | null;
}

/**
 * Визначає номер сиквелу/частини фільму або франшизи (наприклад: "2", "3", "II", "III", "IV")
 */
export function extractSequelNumber(title?: string): number | null {
  if (!title) return null;
  const t = title.trim();
  const tokens = t.split(/[\s:,\.\-_/\\()]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const prev = i > 0 ? tokens[i - 1].toLowerCase() : '';
    // Якщо число йде після "сезон", "season", "s", "серія", "епізод" — це номер сезону/серії, а не сиквелу
    if (['сезон', 'season', 's', 'серія', 'серії', 'епізод', 'episode'].includes(prev)) {
      continue;
    }

    if (/^\d{1,2}$/.test(tok)) {
      const n = parseInt(tok, 10);
      // Сиквели починаються з 2 (2, 3, 4 тощо); 1 — це перший сезон / оригінальний реліз
      if (n >= 2 && n < 100) return n;
    }
    const up = tok.toUpperCase();
    if (['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].includes(up)) {
      if (up === 'II') return 2;
      if (up === 'III') return 3;
      if (up === 'IV') return 4;
      if (up === 'V') return 5;
      if (up === 'VI') return 6;
      if (up === 'VII') return 7;
      if (up === 'VIII') return 8;
      if (up === 'IX') return 9;
      if (up === 'X') return 10;
    }
  }
  return null;
}

/**
 * Визначає номер сезону та частини з назви серіалу або аніме
 * (наприклад: "1 сезон, 2 частина", "Season 3", "Частина 2", "II", "Кей-Он!!")
 */
export function extractSeasonAndPartFromTitle(title?: string): TitleSeasonInfo {
  if (!title) return { season: null, part: null };
  const t = title.trim();

  let part: number | null = null;
  const partMatch =
    t.match(/(?:^|[^\p{L}\p{N}])(?:частина|part|cour)\s*(\d{1,2})/iu) ||
    t.match(/(?:^|[^\p{L}\p{N}])(\d{1,2})\s*(?:-?(?:я|а)?\s*)?(?:частина|part|cour)/iu);
  if (partMatch && partMatch[1]) {
    const p = parseInt(partMatch[1], 10);
    if (!isNaN(p) && p > 0 && p < 100) part = p;
  }

  let season: number | null = null;
  const seasonMatch =
    t.match(/(?:^|[^\p{L}\p{N}])(\d{1,2})\s*(?:-?(?:й|ий|ій)?\s*)?сезон/iu) ||
    t.match(/сезон\s*(\d{1,2})/iu) ||
    t.match(/(?:^|[^\p{L}\p{N}])season\s*(\d{1,2})/iu) ||
    t.match(/(?:^|[^\p{L}\p{N}])s(\d{1,2})(?:[^\p{L}\p{N}]|$)/iu);
  if (seasonMatch && seasonMatch[1]) {
    const s = parseInt(seasonMatch[1], 10);
    if (!isNaN(s) && s > 0 && s < 100) season = s;
  }

  if (season === null && part !== null && !seasonMatch) {
    season = 1;
  }

  // Римські цифри: "II" (2), "III" (3), "IV" (4)
  if (season === null) {
    const romanMatch = t.match(/(?:^|[^\p{L}\p{N}])(IV|III|II)(?:[^\p{L}\p{N}]|$)/iu);
    if (romanMatch && romanMatch[1]) {
      const r = romanMatch[1].toUpperCase();
      if (r === 'II') season = 2;
      else if (r === 'III') season = 3;
      else if (r === 'IV') season = 4;
    }
  }

  // Кількість знаків оклику в кінці назви аніме (Working!! -> 2 сезон)
  if (season === null) {
    const exclMatch = t.match(/(!{1,4})(?:\s*\(|$)/);
    if (exclMatch && exclMatch[1]) {
      season = exclMatch[1].length;
    }
  }

  return { season, part };
}

export function extractSeasonFromTitle(title?: string): number | null {
  return extractSeasonAndPartFromTitle(title).season;
}

/**
 * Оцінює релевантність результату пошуку відносно запиту (0..100+)
 */
export function scoreSearchResult(
  result: SearchResult,
  query: string,
  targetYear?: number,
  targetType?: MediaType,
  targetSeason?: number,
  targetEpisode?: number
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

    // 2. Префіксний збіг по словах
    const isWordPrefix =
      normCand.startsWith(normQ + ' ') ||
      normQ.startsWith(normCand + ' ');

    if (isWordPrefix) {
      const ratio = Math.min(normQ.length, normCand.length) / Math.max(normQ.length, normCand.length);
      // Якщо довжини суттєво відрізняються, це інший твір (спіноф, підзаголовок, антологія тощо)
      if (ratio >= 0.75) {
        bestScore = Math.max(bestScore, Math.round(70 + ratio * 20));
      } else if (ratio >= 0.5) {
        bestScore = Math.max(bestScore, Math.round(ratio * 40));
      } else {
        bestScore = Math.max(bestScore, Math.round(ratio * 30));
      }
    }

    // 3. Підрядок по словах (якщо рядок достатньо довгий)
    const isWordSubstring =
      normQ.length >= 4 &&
      (normCand.includes(' ' + normQ + ' ') ||
        normCand.endsWith(' ' + normQ) ||
        normCand.startsWith(normQ + ' '));

    if (isWordSubstring) {
      const ratio = Math.min(normQ.length, normCand.length) / Math.max(normQ.length, normCand.length);
      if (ratio >= 0.8) {
        bestScore = Math.max(bestScore, Math.round(60 + ratio * 20));
      } else {
        bestScore = Math.max(bestScore, Math.round(ratio * 35));
      }
    }

    // 4. Збіг токенів
    const candTokens = tokenizeTitle(candTitle);
    if (qTokens.length > 0 && candTokens.length > 0) {
      // Текстові токени (без чистих цифр та технічних слів релізів, якщо є змістовний текст)
      const textQTokens = qTokens.filter(t => !/^\d+$/.test(t) && !MEDIA_NOISE_WORDS.has(t));
      const tokensToCheck = textQTokens.length > 0 ? textQTokens : qTokens;

      const textCandTokens = candTokens.filter(t => !/^\d+$/.test(t) && !MEDIA_NOISE_WORDS.has(t));
      const candTokensToCheck = textCandTokens.length > 0 ? textCandTokens : candTokens;

      const matchedTokens = tokensToCheck.filter(qt =>
        candTokensToCheck.some(ct => {
          if (ct === qt) return true;
          // Дозволяємо підрядок або спільну основу для відмінків (наприклад "дюна" і "дюни")
          if (ct.length >= 4 && qt.length >= 4) {
            const lenDiff = Math.abs(ct.length - qt.length);
            if (lenDiff <= 2 && (ct.includes(qt) || qt.includes(ct))) {
              return true;
            }
            const minLen = Math.min(ct.length, qt.length);
            if (lenDiff <= 1 && ct.slice(0, minLen - 1) === qt.slice(0, minLen - 1)) {
              return true;
            }
          }
          return false;
        })
      );

      const matchRatio = matchedTokens.length / tokensToCheck.length;
      const candCoverage = matchedTokens.length / candTokensToCheck.length;

      if (tokensToCheck.length === 1) {
        if (matchRatio === 1) {
          if (candTokensToCheck.length === 1) {
            bestScore = Math.max(bestScore, 85);
          } else if (candCoverage >= 0.65) {
            bestScore = Math.max(bestScore, 65);
          } else {
            // Одне слово збіглося у багатослівному заголовку (наприклад "покоївка" у "президент студради покоївка")
            bestScore = Math.max(bestScore, Math.round(candCoverage * 40));
          }
        }
      } else if (tokensToCheck.length === 2) {
        if (matchRatio === 1) {
          if (candCoverage >= 0.65) {
            bestScore = Math.max(bestScore, 85);
          } else {
            bestScore = Math.max(bestScore, Math.round(candCoverage * 60));
          }
        } else {
          // Якщо для 2-слівного запиту збіглося лише одне слово — це недостатній збіг
          bestScore = Math.max(bestScore, 20);
        }
      } else {
        if (matchRatio === 1) {
          if (candCoverage >= 0.65) {
            bestScore = Math.max(bestScore, 85);
          } else {
            bestScore = Math.max(bestScore, Math.round(candCoverage * 60));
          }
        } else if (matchRatio >= 0.75 && candCoverage >= 0.5) {
          bestScore = Math.max(bestScore, 65);
        } else if (matchRatio >= 0.6 && candCoverage >= 0.4) {
          bestScore = Math.max(bestScore, 35);
        } else {
          bestScore = Math.max(bestScore, Math.round(matchRatio * candCoverage * 30));
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
      bestScore = Math.max(0, bestScore - 55);
    } else if (targetType === 'tv' && itemType === 'movie') {
      bestScore = Math.max(0, bestScore - 55);
    }
  }

  // 5.5. Перевірка номера сиквелу (2, 3, 4, II, III тощо)
  const qSequel = extractSequelNumber(query);
  const candSequel =
    extractSequelNumber(result.title) ?? extractSequelNumber(result.originalTitle);

  if (qSequel !== null || candSequel !== null) {
    if (qSequel === candSequel) {
      bestScore += 25;
    } else {
      // Якщо в запиті чітко вказана частина 2/3 (наприклад "Зоотрополіс 2"),
      // а в результаті частини немає ("Зоотрополіс") або вона інша — штрафуємо
      bestScore = Math.max(0, bestScore - 60);
    }
  }

  // 6. Вплив сезону та частини (для серіалів/аніме)
  if (targetType === 'tv' && targetSeason !== undefined && targetSeason > 0) {
    const titleInfo =
      extractSeasonAndPartFromTitle(result.title) ||
      extractSeasonAndPartFromTitle(result.originalTitle);

    const detectedSeasonInCandidate = titleInfo.season;
    const detectedPartInCandidate = titleInfo.part;

    if (detectedSeasonInCandidate !== null) {
      if (detectedSeasonInCandidate === targetSeason) {
        bestScore += 35; // Великий бонус за точний сезон
      } else {
        bestScore = Math.max(0, bestScore - 55); // Жорсткий штраф за чужий сезон!
      }
    } else if (targetSeason === 1 && detectedPartInCandidate === null) {
      // Якщо шукаємо 1-й сезон і в релізі немає суфікса іншого сезону чи частини (чиста назва франшизи)
      // — це оригінальний перший сезон! Застосовується лише якщо назва вже є валідним збігом.
      if (bestScore >= 50) {
        bestScore += 30;
      }
    }

    // Обробка розділених сезонів (частина 2 / Part 2 / Cour 2):
    // Якщо запитується перша половина сезону (targetEpisode <= 12 або 1):
    // реліз частини 2 (епізоди 13+) штрафується, щоб не перекривати епізоди 1-12 частини 1!
    if (detectedPartInCandidate !== null && detectedPartInCandidate >= 2) {
      if (targetEpisode === undefined || targetEpisode <= 12) {
        bestScore = Math.max(0, bestScore - 60);
      } else {
        bestScore += 25;
      }
    } else if (detectedPartInCandidate === 1) {
      if (targetEpisode === undefined || targetEpisode <= 12) {
        bestScore += 15;
      }
    }
  }

  // 7. Вплив року випуску (якщо відомий)
  if (targetYear && result.year) {
    const yearDiff = Math.abs(result.year - targetYear);
    if (yearDiff === 0) {
      bestScore += 20;
    } else if (yearDiff === 1) {
      bestScore += 8;
    } else if (yearDiff >= 2) {
      // Якщо рік відрізняється на 2+ роки — штрафуємо
      bestScore = Math.max(0, bestScore - Math.min(50, yearDiff * 15));
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
  minScore: number = 50,
  targetSeason?: number,
  targetEpisode?: number
): boolean {
  if (!result || !query) return false;
  return scoreSearchResult(result, query, targetYear, targetType, targetSeason, targetEpisode) >= minScore;
}

/**
 * Фільтрація та ранжування результатів пошуку:
 * Відкидає випадкові/нерелевантні збіги (DLE стоп-слова, помилкові збіги) і сортує за релевантністю
 */
export function rankSearchResults(
  results: SearchResult[],
  query: string,
  targetYear?: number,
  targetType?: MediaType,
  targetSeason?: number,
  targetEpisode?: number
): SearchResult[] {
  if (!results || results.length === 0 || !query) return [];

  // Якщо запит — IMDb ID (tt...) і лише 1 результат
  if (/^tt\d+$/.test(query.trim()) && results.length <= 1) {
    return results;
  }

  const scored = results
    .map(result => ({
      result,
      score: scoreSearchResult(result, query, targetYear, targetType, targetSeason, targetEpisode),
    }))
    .filter(item => item.score >= 50);

  scored.sort((a, b) => b.score - a.score);

  return scored.map(item => item.result);
}

export const sortSearchResults = rankSearchResults;
