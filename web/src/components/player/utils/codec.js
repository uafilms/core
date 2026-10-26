export const CODEC_FAMILIES = [
  { id: 'av01', label: 'AV1', pattern: /^av01/i },
  { id: 'vp09', label: 'VP9', pattern: /^vp09/i },
  { id: 'hevc', label: 'HEVC', pattern: /^(hvc1|hev1)/i },
  { id: 'avc', label: 'H.264', pattern: /^(avc1|avc3)/i },
];

export const codecPriorityOf = (id) => {
  const index = CODEC_FAMILIES.findIndex((family) => family.id === id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

export const codecFamilyOf = (codecs) => {
  if (!codecs || typeof codecs !== 'string') return null;
  const parts = codecs.split(',').map((part) => part.trim()).filter(Boolean);
  return CODEC_FAMILIES.find((family) => parts.some((part) => family.pattern.test(part))) || null;
};

export const isCodecSupported = (codecs) => {
  if (!codecs || typeof MediaSource === 'undefined' || typeof MediaSource.isTypeSupported !== 'function') {
    return true;
  }
  const cleanCodecs = codecs.split(',')[0].trim();
  try {
    if (MediaSource.isTypeSupported(`video/mp4; codecs="${codecs}"`)) return true;
    if (MediaSource.isTypeSupported(`video/mp4; codecs="${cleanCodecs}"`)) return true;
    if (/^(hvc1|hev1)/i.test(cleanCodecs)) {
      if (MediaSource.isTypeSupported('video/mp4; codecs="hvc1"')) return true;
      if (MediaSource.isTypeSupported('video/mp4; codecs="hev1"')) return true;
      if (MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"')) return true;
    }
  } catch {
    return true;
  }
  // На десктопі/SmartTV HEVC зазвичай декодується системою (ffmpeg/vaapi/d3d11va),
  // навіть якщо браузер консервативно повертає false на isTypeSupported.
  if (/^(hvc1|hev1)/i.test(cleanCodecs)) {
    return true;
  }
  return false;
};

// Деякі джерела (зокрема HLS-групи Fenix через VHS) віддають технічний label
// на кшталт 'default' замість назви озвучки — такі значення не показуємо.
export const GENERIC_AUDIO_LABEL_RE = /^(default|undefined|null|audio|unknown|невідомо|доріжка\s*\d+)$/i;
export const isGenericAudioLabel = (label) => !label || GENERIC_AUDIO_LABEL_RE.test(String(label).trim());

// HLS-лейбли Fenix і назви студій з бекенду пишуться по-різному ('НЛО TV' / 'НЛО-ТВ'),
// тому ключ для пошуку логотипа зводимо до одного вигляду: латиниця → кирилиця,
// нижній регістр, без розділових знаків.
export const STUDIO_LABEL_HOMOGLYPHS = {
  a: 'а', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м',
  o: 'о', p: 'р', s: 'с', t: 'т', v: 'в', x: 'х', y: 'у',
};

export const normalizeStudioLabel = (label) =>
  String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[acehikmopstvxy]/g, (char) => STUDIO_LABEL_HOMOGLYPHS[char] || char)
    .replace(/[\s\-_.,:]+/g, '');

export const snapHeight = (height, width = 0) => {
  // Scope-відео (2.39:1) має висоту 1606/802 замість 2160/1080, тому
  // орієнтуємось на ширину кадру, а не на висоту.
  if (width > 0) {
    if (width >= 3800) return 2160;
    if (width >= 2500) return 1440;
    if (width >= 1900) return 1080;
    if (width >= 1200) return 720;
    if (width >= 700) return 480;
    if (width >= 600) return 360;
    if (width >= 400) return 240;
  }
  if (height >= 2000) return 2160;
  if (height >= 1440) return 1440;
  if (height >= 900) return 1080;
  if (height >= 630) return 720;
  if (height >= 450) return 480;
  if (height >= 270) return 360;
  if (height >= 180) return 240;
  return height;
};

export const buildStudioLogoMap = (sources) => {
  const map = new Map();
  const remember = (label, logo) => {
    const key = normalizeStudioLabel(label);
    if (key && logo && !map.has(key)) map.set(key, logo);
  };
  for (const source of sources) {
    remember(source?.studio?.name, source?.studio?.logoUrl);
    const trackStudios = source?.audioTrackStudios || [];
    (source?.audioTracks || []).forEach((label, index) => {
      remember(label, trackStudios[index]?.logoUrl);
    });
  }
  return map;
};
