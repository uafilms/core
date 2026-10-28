export function getProviderFromMap<T = any>(
  map: Map<string, T>,
  targetIdOrName?: string
): T | undefined {
  if (!map || map.size === 0) return undefined;
  if (!targetIdOrName) return Array.from(map.values())[0];

  const clean = String(targetIdOrName).replace(/^★\s*/, '').toLowerCase().trim();

  // 1. Direct get
  if (map.has(targetIdOrName)) {
    return map.get(targetIdOrName);
  }

  // 2. Direct get with cleaned string
  if (map.has(clean)) {
    return map.get(clean);
  }

  // 3. Match by name or provider id case-insensitively
  for (const [key, item] of map.entries()) {
    const k = String(key).replace(/^★\s*/, '').toLowerCase().trim();
    const name = String((item as any)?.name || '').replace(/^★\s*/, '').toLowerCase().trim();
    const prov = String((item as any)?.provider || '').replace(/^★\s*/, '').toLowerCase().trim();

    if (k === clean || name === clean || prov === clean) {
      return item;
    }
  }

  return Array.from(map.values())[0];
}

export function extractVoiceName(source: any): string {
  if (source.studio && source.studio.name && String(source.studio.name).trim()) {
    return String(source.studio.name).trim();
  }
  if (source.audioTracks && Array.isArray(source.audioTracks) && source.audioTracks.length && source.audioTracks[0]) {
    return String(source.audioTracks[0]).trim();
  }
  if (source.audio && String(source.audio).trim()) {
    return String(source.audio).trim();
  }
  if (source.title && String(source.title).trim()) {
    return String(source.title).trim();
  }
  return 'Озвучення';
}

export function extractProviderName(source: any): string {
  if (source.provider && source.provider.name && String(source.provider.name).trim()) {
    return String(source.provider.name).trim();
  }
  return '';
}

export function normalizeStreamUrl(rawUrl: string, host: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('//')) {
    return 'http:' + rawUrl;
  }
  if (rawUrl.startsWith('/')) {
    return `${host}${rawUrl}`;
  }
  return rawUrl;
}

export function withVoiceQuery(url: string, voice: string): string {
  if (!url) return '';
  const clean = url
    .replace(/([?&])voice=[^&]*/gi, '')
    .replace(/([?&])mergeAudio=[^&]*/gi, '')
    .replace(/&{2,}/g, '&')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
  const sep = clean.includes('?') ? '&' : '?';
  return `${clean}${sep}voice=${encodeURIComponent(voice)}&mergeAudio=1`;
}
