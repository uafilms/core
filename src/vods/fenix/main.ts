import type { StreamSource, Subtitle } from '../../types/media.js';
import type { VodExtractionOptions, VodExtractionResult, VodExtractor } from '../../types/vod.js';
import { httpRequest } from '../../utils/http.js';
import { sortAudioTrackLabels } from '../../utils/sort.js';

const FENIX_EMBED_ORIGIN = 'https://fenixplay.xyz';
const ANIMEON_PLAYER_API = 'https://animeon.club/api/player';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/**
 * Fenix віддає HEVC-мастер (1080p hevc + 480p avc у тому ж плейлисті),
 * а `cast_avc_url` — окремий AVC-мастер (тільки 480p), зручний для пристроїв
 * без підтримки HEVC. FENIX_FORCE_AVC=1 перемикає на нього.
 */
const PREFER_AVC = process.env.FENIX_FORCE_AVC === '1';

interface FenixTrack {
  label?: string;
  language?: string;
  track_type?: string;
  hls_url?: string;
  cast_avc_url?: string;
  thumbnail_url?: string;
  is_default?: boolean;
  voice_studio_id?: number | string;
}

interface FenixSubtitle {
  label?: string;
  language?: string;
  kind?: string;
  url?: string;
  styled_url?: string;
  voice_studio_id?: number | string;
  voice_studio_name?: string;
}

interface FenixEpisode {
  id?: string;
  number?: number;
  edition?: string;
  title?: string;
  hls_master_url?: string;
  cast_avc_url?: string;
  thumbnail_url?: string;
  tracks?: FenixTrack[];
  subtitles?: FenixSubtitle[];
}

interface FenixPlaylist {
  slug?: string;
  title_ua?: string;
  title_orig?: string;
  poster_url?: string;
  embed_url?: string;
  episodes?: FenixEpisode[];
  mini_episodes?: FenixEpisode[];
}

interface FenixMediaAccess {
  origin?: string;
  token?: string;
}

/**
 * Дістає JSON, присвоєний у інлайн-скрипті (`window.X = {...};`) — Fenix
 * віддає і плейлист, і media-токен саме так, одним рядком без обрамлення у JSON-тег.
 */
function extractJsonAssignment(html: string, marker: string): unknown | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = html.indexOf('{', markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function withToken(url: string, token: string): string {
  if (!token || /[?&]token=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
}

function normalizeVoice(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[’'`ʼ]/g, '')
    .replace(/[^a-zа-яіїєґ0-9]+/gi, '');
}

/** Плеєр Fenix зветься 'Fenix', але id епізодів у animeon свої — розкриваємо їх в embed-URL. */
async function resolveAnimeOnEpisodeEmbed(episodeId: string, options: VodExtractionOptions = {}): Promise<string | null> {
  try {
    const res = await httpRequest<{ videoUrl?: string }>(`${ANIMEON_PLAYER_API}/${episodeId}/episode`, {
      headers: { Referer: 'https://animeon.club/', 'User-Agent': UA },
      signal: options.signal,
      timeout: 8000,
    });
    const videoUrl = res.data?.videoUrl;
    return videoUrl?.includes('fenixplay.xyz') ? videoUrl : null;
  } catch {
    return null;
  }
}

function pickTrack(episode: FenixEpisode, voice?: string): FenixTrack | null {
  const tracks = (episode.tracks || []).filter((track) => track.track_type !== 'sub' && track.hls_url);
  if (tracks.length === 0) return null;
  if (!voice) return tracks[0];

  const wanted = normalizeVoice(voice);
  const exact = tracks.find((track) => track.label && normalizeVoice(track.label) === wanted);
  if (exact) return exact;

  const partial = tracks.find((track) => {
    if (!track.label) return false;
    const label = normalizeVoice(track.label);
    return label.includes(wanted) || wanted.includes(label);
  });
  return partial || tracks[0];
}

async function fetchFenixText(url: string, options: VodExtractionOptions = {}): Promise<string | null> {
  try {
    const res = await httpRequest<string>(url, {
      headers: { 'User-Agent': UA, Referer: `${FENIX_EMBED_ORIGIN}/` },
      signal: options.signal,
      timeout: 12000,
      responseType: 'text',
    });
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  } catch {
    return null;
  }
}

/**
 * Шлях аудіоплейлиста треку: у Fenix майстер треку лежить поруч із `audio/` —
 * `…/versions/<hash>/master.m3u8` → `…/versions/<hash>/audio/playlist.m3u8`.
 */
function audioPlaylistUrl(track: FenixTrack, token: string): string | null {
  const source = track.hls_url || track.cast_avc_url;
  if (!source) return null;
  return withToken(source.replace(/[^/]+\.m3u8(\?|$)/, 'audio/playlist.m3u8$1'), token);
}

function pickEpisode(playlist: FenixPlaylist, episodeNumber?: number): FenixEpisode | null {
  const episodes = playlist.episodes || [];
  if (episodes.length === 0) return null;
  if (!episodeNumber) return episodes[0];
  return episodes.find((episode) => episode.number === episodeNumber) || episodes[0];
}

/**
 * «Написи»/«Форсовані» (kind=signs|forced) — це оверлейні переклади написів на екрані.
 * Вони мають бути першими й увімкненими за замовчуванням: їх ставимо на позицію 0,
 * а parseMasterPlaylist віддає першому субтитру DEFAULT=YES,AUTOSELECT=YES, тож
 * video.js сам вмикає доріжку.
 */
const SIGNS_KINDS = new Set(['signs', 'forced']);
const SIGNS_LABEL_RE = /напис|forced|форсов/i;

function isSignsSubtitle(sub: FenixSubtitle): boolean {
  const kind = (sub.kind || '').toLowerCase();
  if (SIGNS_KINDS.has(kind)) return true;
  return SIGNS_LABEL_RE.test(sub.label || '');
}

function pickSubtitles(episode: FenixEpisode, track: FenixTrack | null, token: string): Subtitle[] {
  const subs = episode.subtitles || [];
  const voiceName = track?.label;
  const wantedVoice = voiceName ? normalizeVoice(voiceName) : null;
  const matchesVoice = (sub: FenixSubtitle): boolean =>
    !!wantedVoice && !!sub.voice_studio_name && normalizeVoice(sub.voice_studio_name) === wantedVoice;

  const signsVoice: FenixSubtitle[] = [];
  const signsOther: FenixSubtitle[] = [];
  const fullVoice: FenixSubtitle[] = [];
  const fullOther: FenixSubtitle[] = [];

  for (const sub of subs) {
    if (!sub.url) continue;
    const bucket = isSignsSubtitle(sub)
      ? matchesVoice(sub)
        ? signsVoice
        : signsOther
      : matchesVoice(sub)
        ? fullVoice
        : fullOther;
    bucket.push(sub);
  }

  const ordered = [...signsVoice, ...signsOther, ...fullVoice, ...fullOther];

  const seen = new Set<string>();
  const subtitles: Subtitle[] = [];
  for (const sub of ordered) {
    // Стилізована версія (ASS) йде першою: плеєр рендерить її через libass,
    // а VTT лишається як запасний варіант, якщо стилізовані не заведуться.
    if (sub.styled_url) {
      const styledUrl = withToken(sub.styled_url, token);
      if (!seen.has(styledUrl)) {
        seen.add(styledUrl);
        subtitles.push({
          lang: sub.language || 'uk',
          label: sub.label || 'Субтитри',
          url: styledUrl,
          format: 'ass',
        });
      }
    }

    const url = withToken(sub.url as string, token);
    if (seen.has(url)) continue;
    seen.add(url);
    subtitles.push({
      lang: sub.language || 'uk',
      label: sub.label || 'Субтитри',
      url,
      format: 'vtt',
    });
  }
  return subtitles;
}

interface FenixInput {
  target: string;
  voice?: string;
  episodeNumber?: number;
}

interface FenixContext {
  playlist: FenixPlaylist;
  episode: FenixEpisode;
  token: string;
  voice?: string;
  target: string;
}

function parseFenixUrl(url: string): FenixInput | null {
  if (!url) return null;
  let target = url;
  let voice: string | undefined;
  let episodeNumber: number | undefined;

  try {
    const parsed = new URL(url.startsWith('http') ? url : `http://localhost${url}`);
    const rawVoice = parsed.searchParams.get('voice') || parsed.searchParams.get('translation');
    if (rawVoice) voice = rawVoice;

    const rawEpisode = parsed.searchParams.get('ep') || parsed.searchParams.get('episode');
    if (rawEpisode) episodeNumber = parseInt(rawEpisode, 10) || undefined;

    const type = parsed.searchParams.get('type')?.toLowerCase();
    const animeOnId = parsed.searchParams.get('id') || parsed.searchParams.get('episodeId');
    const innerUrl = parsed.searchParams.get('url');

    if (innerUrl) target = decodeURIComponent(innerUrl);
    else if (type === 'animeon' && animeOnId) return { target: `animeon:${animeOnId}`, voice, episodeNumber };

    // Епізод може бути закодований лише в embed-URL від animeon API (?ep=N)
    if (episodeNumber === undefined) {
      try {
        const targetUrl = new URL(target);
        const rawTargetEp = targetUrl.searchParams.get('ep') || targetUrl.searchParams.get('episode');
        if (rawTargetEp) episodeNumber = parseInt(rawTargetEp, 10) || undefined;
      } catch {
        // ignore
      }
    }
  } catch {
    return null;
  }

  return { target, voice, episodeNumber };
}

async function resolveFenixContext(input: FenixInput, options: VodExtractionOptions = {}): Promise<FenixContext | null> {
  let target = input.target;
  if (target.startsWith('animeon:')) {
    const embed = await resolveAnimeOnEpisodeEmbed(target.slice('animeon:'.length), options);
    if (!embed) return null;
    target = embed;
  }

  if (!target.includes('fenixplay.xyz') || target.includes('media.fenixplay.xyz')) return null;

  let episodeNumber = input.episodeNumber;
  if (episodeNumber === undefined) {
    try {
      const targetUrl = new URL(target);
      const rawTargetEp = targetUrl.searchParams.get('ep') || targetUrl.searchParams.get('episode');
      if (rawTargetEp) episodeNumber = parseInt(rawTargetEp, 10) || undefined;
    } catch {
      // ignore
    }
  }

  const html = await fetchFenixText(target, options);
  if (!html) return null;

  const playlist = extractJsonAssignment(html, 'window.FENIX_PLAYLIST') as FenixPlaylist | null;
  const access = extractJsonAssignment(html, 'window.FENIX_MEDIA_ACCESS') as FenixMediaAccess | null;
  const token = access?.token;
  if (!playlist || !token) return null;

  const episode = pickEpisode(playlist, episodeNumber);
  if (!episode) return null;

  return { playlist, episode, token, voice: input.voice, target };
}

export interface FenixMergedManifest {
  manifest: string;
  baseUrl: string;
  subtitles: Subtitle[];
}

/**
 * Збирає один майстер, у якому відео-варіанти спільні, а всі озвучки —
 * окремі `#EXT-X-MEDIA:TYPE=AUDIO` групи того самого GROUP-ID. Плеєр тоді
 * перемикає доріжки на місці, без перезавантаження джерела.
 */
export async function buildFenixMergedManifest(url: string, options: VodExtractionOptions = {}): Promise<FenixMergedManifest | null> {
  const input = parseFenixUrl(url);
  if (!input) return null;

  const ctx = await resolveFenixContext(input, options);
  if (!ctx) return null;

  const masterUrl = PREFER_AVC
    ? ctx.episode.cast_avc_url || ctx.episode.hls_master_url
    : ctx.episode.hls_master_url || ctx.episode.cast_avc_url;
  if (!masterUrl) return null;

  const baseUrl = withToken(masterUrl, ctx.token);
  const master = await fetchFenixText(baseUrl, options);
  if (!master) return null;

  const tracks = (ctx.episode.tracks || []).filter((track) => track.track_type !== 'sub' && (track.hls_url || track.cast_avc_url));
  if (tracks.length === 0) return null;

  // Стабільний порядок озвучок у плеєрі: дубляжі за вагою студії, «Оригінал» — ближче
  // до кінця. Fenix віддає треки у власному (довільному) порядку.
  const labelOrder = sortAudioTrackLabels(tracks.map((track) => track.label || ''));
  const orderedTracks = [...tracks].sort(
    (a, b) => labelOrder.indexOf(a.label || '') - labelOrder.indexOf(b.label || ''),
  );

  const wanted = ctx.voice ? normalizeVoice(ctx.voice) : '';
  const defaultTrack =
    (wanted && orderedTracks.find((track) => track.label && normalizeVoice(track.label) === wanted)) || orderedTracks[0];

  const mediaLines = orderedTracks.map((track) => {
    const uri = audioPlaylistUrl(track, ctx.token);
    const label = (track.label || 'Audio').replace(/"/g, '\\"');
    const attrs = [
      '#EXT-X-MEDIA:TYPE=AUDIO',
      'GROUP-ID="audio"',
      `NAME="${label}"`,
      `LANGUAGE="${track.language || 'uk'}"`,
      'CHANNELS="2"',
      `DEFAULT=${track === defaultTrack ? 'YES' : 'NO'}`,
      'AUTOSELECT=YES',
    ];
    if (uri) attrs.push(`URI="${uri}"`);
    return attrs.join(',');
  });

  const output: string[] = [];
  let mediaInserted = false;
  for (const line of master.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!mediaInserted && trimmed.startsWith('#EXT-X-STREAM-INF')) {
      output.push(...mediaLines);
      mediaInserted = true;
    }
    if (/^#EXT-X-MEDIA:TYPE=AUDIO/i.test(trimmed)) continue;
    output.push(trimmed.startsWith('#EXT-X-STREAM-INF') ? trimmed.replace(/AUDIO="[^"]*"/, 'AUDIO="audio"') : line);
  }

  if (!mediaInserted) return null;

  return {
    manifest: output.join('\n'),
    baseUrl,
    subtitles: pickSubtitles(ctx.episode, defaultTrack, ctx.token),
  };
}

class FenixVodExtractor implements VodExtractor {
  readonly name = 'fenix';

  async extract(url: string, options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    const input = parseFenixUrl(url);
    if (!input) return null;

    // Прямий медіа-запит із підписом — віддаємо як є, токен у ньому вже є.
    if (input.target.includes('media.fenixplay.xyz')) {
      if (!/[?&]token=/.test(input.target)) return null;
      const source: StreamSource = {
        title: input.voice || 'Fenix',
        audio: input.voice,
        url: input.target,
        mime: 'application/x-mpegURL',
      };
      return { sources: [source] };
    }

    const ctx = await resolveFenixContext(input, options);
    if (!ctx) return null;

    const track = pickTrack(ctx.episode, ctx.voice);
    if (!track) return null;

    const mediaUrl = (PREFER_AVC ? track.cast_avc_url || track.hls_url : track.hls_url || track.cast_avc_url) as string | undefined;
    if (!mediaUrl) return null;

    const source: StreamSource = {
      title: track.label || ctx.voice || 'Fenix',
      audio: track.label || ctx.voice,
      url: withToken(mediaUrl, ctx.token),
      mime: 'application/x-mpegURL',
      poster: ctx.episode.thumbnail_url || ctx.playlist.poster_url,
      subtitles: pickSubtitles(ctx.episode, track, ctx.token),
      // Відео в Fenix спільне для всіх озвучок — плеєр може перемикати їх нативно.
      sharedVideo: true,
    };

    return { sources: [source] };
  }
}

export const fenixVod = new FenixVodExtractor();
