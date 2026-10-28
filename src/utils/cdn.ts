export interface CdnInfo {
  id: string;
  name: string;
}

const CDN_DISPLAY_NAMES: Record<string, string> = {
  ashdi: 'Ashdi',
  tortuga: 'Tortuga',
  hdvb: 'HDVBua',
  hdvbua: 'HDVBua',
  moonanime: 'MoonAnime',
  moon: 'MoonAnime',
  // Dawn — приватний CDN mikai.me з тією ж бібліотекою, тому показується як MoonAnime
  dawn: 'MoonAnime',
  franko: 'Franko',
  bamboo: 'BambooUA',
  bambooua: 'BambooUA',
  bunny: 'BunnyCDN',
  bunnycdn: 'BunnyCDN',
  aniworld: 'AniWorld',
  zetvideo: 'ZetVideo',
  fenix: 'Fenix',
  'uakino-ax': 'UaKinoAX',
  ufdub: 'UFDUB',
  unimay: 'Unimay',
  sniplyo: 'Sniplyo',
};

export function normalizeCdnName(cdnId: string): string {
  const cleanId = cdnId.toLowerCase().trim();
  if (CDN_DISPLAY_NAMES[cleanId]) {
    return CDN_DISPLAY_NAMES[cleanId];
  }

  // Дубляжі uakino.ax ідуть з id вигляду uakino-ax-<voice>
  if (cleanId.startsWith('uakino-ax')) {
    return 'UaKinoAX';
  }

  return cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
}

export function detectCdn(raw: { lazy?: { cdn?: string; type?: string; url?: string }; url?: string }, fallbackProvider = 'unknown'): CdnInfo {
  // 1. Check known CDN keywords in raw.lazy.type first
  const lazyType = raw.lazy?.type?.toLowerCase().trim();
  const knownTypes = ['moon', 'moonanime', 'dawn', 'ashdi', 'tortuga', 'hdvb', 'hdvbua', 'franko', 'bamboo', 'bambooua', 'bunny', 'aniworld', 'zetvideo', 'ufdub', 'unimay', 'sniplyo'];
  if (lazyType && knownTypes.includes(lazyType)) {
    return {
      id: lazyType === 'moon' || lazyType === 'dawn' ? 'moonanime' : lazyType === 'bambooua' ? 'bamboo' : lazyType === 'hdvbua' ? 'hdvb' : lazyType,
      name: normalizeCdnName(lazyType),
    };
  }

  // 2. Check raw.lazy.cdn
  const lazyCdn = raw.lazy?.cdn?.toLowerCase().trim();
  if (lazyCdn && lazyCdn !== 'unknown' && lazyCdn !== 'animeon') {
    return {
      id: lazyCdn === 'bambooua' ? 'bamboo' : lazyCdn === 'moon' || lazyCdn === 'dawn' ? 'moonanime' : lazyCdn === 'hdvbua' ? 'hdvb' : lazyCdn,
      name: normalizeCdnName(lazyCdn),
    };
  }

  // 3. Check query param cdn= in URLs
  const candidateUrls = [raw.lazy?.url, raw.url].filter(Boolean) as string[];
  for (const u of candidateUrls) {
    try {
      const cdnParamMatch = u.match(/[?&]cdn=([^&#]+)/i);
      if (cdnParamMatch) {
        const cdnVal = decodeURIComponent(cdnParamMatch[1]).toLowerCase().trim();
        if (cdnVal && cdnVal !== 'unknown' && cdnVal !== 'animeon') {
          const mappedId = cdnVal === 'bambooua' ? 'bamboo' : cdnVal === 'moon' || cdnVal === 'dawn' ? 'moonanime' : cdnVal === 'hdvbua' ? 'hdvb' : cdnVal;
          return {
            id: mappedId,
            name: normalizeCdnName(cdnVal),
          };
        }
      }

      const typeParamMatch = u.match(/[?&]type=([^&#]+)/i);
      if (typeParamMatch) {
        const typeVal = decodeURIComponent(typeParamMatch[1]).toLowerCase().trim();
        if (typeVal && knownTypes.includes(typeVal)) {
          const mappedId = typeVal === 'bambooua' ? 'bamboo' : typeVal === 'moon' ? 'moonanime' : typeVal === 'hdvbua' ? 'hdvb' : typeVal;
          return {
            id: mappedId,
            name: normalizeCdnName(typeVal),
          };
        }
      }
    } catch {
      // ignore URL parsing error
    }
  }

  // 3. Check domain / pattern signatures
  const fullText = `${raw.lazy?.url || ''} ${raw.url || ''}`.toLowerCase();

  if (fullText.includes('hdvb') || fullText.includes('vidcache')) {
    return { id: 'hdvb', name: 'HDVBua' };
  }
  if (fullText.includes('ashdi') || fullText.includes('0yql3tj') || fullText.includes('oyql3tj')) {
    return { id: 'ashdi', name: 'Ashdi' };
  }
  if (fullText.includes('tortuga')) {
    return { id: 'tortuga', name: 'Tortuga' };
  }
  if (fullText.includes('moonanime') || fullText.includes('mooncdn') || fullText.includes('s.moonanime')) {
    return { id: 'moonanime', name: 'MoonAnime' };
  }
  if (fullText.includes('franko') || fullText.includes('factorios.live') || fullText.includes('uacdn.online')) {
    return { id: 'franko', name: 'Franko' };
  }
  if (fullText.includes('bamboo') || fullText.includes('bambooua')) {
    return { id: 'bamboo', name: 'BambooUA' };
  }
  if (fullText.includes('bunny') || fullText.includes('b-cdn.net') || fullText.includes('mediadelivery.net')) {
    return { id: 'bunny', name: 'BunnyCDN' };
  }
  if (fullText.includes('aniworld') || fullText.includes('/catalog/episode/')) {
    return { id: 'aniworld', name: 'AniWorld' };
  }
  if (fullText.includes('zetvideo')) {
    return { id: 'zetvideo', name: 'ZetVideo' };
  }
  if (fullText.includes('ufdub')) {
    return { id: 'ufdub', name: 'UFDUB' };
  }
  if (fullText.includes('unimay')) {
    return { id: 'unimay', name: 'Unimay' };
  }
  if (fullText.includes('sniplyo') || fullText.includes('creavio')) {
    return { id: 'sniplyo', name: 'Sniplyo' };
  }
  // Fenix — власний плеєр animeon.club і mikai.me (embed fenixplay.xyz, медіа media.fenixplay.xyz).
  // Детектуємо його за URL, щоб однаковий контент різних провайдерів дедуплікувався в один cdn.
  if (fullText.includes('fenixplay.xyz')) {
    return { id: 'fenix', name: 'Fenix' };
  }

  // Fallback to provider name if CDN cannot be determined
  const fallback = fallbackProvider.toLowerCase().trim();
  return {
    id: fallback,
    name: normalizeCdnName(fallback),
  };
}
