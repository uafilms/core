/**
 * Константи Fenix (fenixplay.xyz).
 */

export const FENIX_HOST = 'fenixplay.xyz';
export const FENIX_EMBED_ORIGIN = 'https://fenixplay.xyz';
export const FENIX_MEDIA_HOST = 'media.fenixplay.xyz';
export const FENIX_REFERER = 'https://fenixplay.xyz/';
export const FENIX_ANIMEON_PLAYER_API = 'https://animeon.club/api/player';
export const FENIX_ANIMEON_REFERER = 'https://animeon.club/';
export const FENIX_FETCH_TIMEOUT = 12000;
export const FENIX_PLAYLIST_MARKER = 'window.FENIX_PLAYLIST';
export const FENIX_MEDIA_ACCESS_MARKER = 'window.FENIX_MEDIA_ACCESS';
export const FENIX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/**
 * Fenix віддає HEVC-мастер (1080p hevc + 480p avc у тому ж плейлисті),
 * а `cast_avc_url` — окремий AVC-мастер (тільки 480p), зручний для пристроїв
 * без підтримки HEVC. FENIX_FORCE_AVC=1 перемикає на нього.
 */
export const FENIX_PREFER_AVC = process.env.FENIX_FORCE_AVC === '1';
