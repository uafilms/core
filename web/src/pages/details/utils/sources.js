export const FAVORITE_CDNS = ['fenix', 'ashdi'];

export const favoriteCdnRank = (source) => {
  const id = source?.provider?.id || '';
  const index = FAVORITE_CDNS.indexOf(id);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
};

export const sortWithFavoriteCdns = (list) => {
  return [...list].sort((a, b) => favoriteCdnRank(a) - favoriteCdnRank(b));
};

export const formatSourceName = (source) => {
  const provider = source.provider?.name || source.provider?.id || 'Джерело';
  const quality = source.quality || '';

  const parts = [provider];
  if (quality && quality !== 'Auto') parts.push(quality);

  return parts.join(' • ');
};

// Чи це те саме відео, лише інша озвучка (Fenix: cdn/type/id ті самі, voice різний)
export const sharedVideoKey = (source) => {
  if (!source?.url) return null;
  try {
    const parsed = new URL(source.url, window.location.origin);
    const cdn = parsed.searchParams.get('cdn');
    const type = parsed.searchParams.get('type');
    const id = parsed.searchParams.get('id') || parsed.searchParams.get('url');
    const ep = parsed.searchParams.get('ep') || parsed.searchParams.get('episode');
    return [cdn, type, id, ep].filter(Boolean).join('|');
  } catch {
    return null;
  }
};

export const getSourceVoice = (src) => {
  return (
    src?.studio?.name ||
    src?.audioTracks?.[0] ||
    src?.title ||
    ''
  ).trim();
};
