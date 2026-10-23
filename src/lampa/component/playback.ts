import type { OmssSourceItem, TmdbEpisodeItem } from '../types/index.js';
import { extractVoiceName, normalizeStreamUrl, withVoiceQuery } from '../utils/index.js';
import { fetchEpisodeProviders } from '../api/index.js';
import type { ComponentContext } from './types.js';
import {
  getEpisodeCardKey,
  getEpisodeHashBehold,
  getEpisodeHashTimeline,
  markViewed,
} from './storage.js';

declare const Lampa: any;

export function isPlayerActive(ctx?: ComponentContext): boolean {
  if (ctx?.state?.isPlaybackActive) {
    return true;
  }
  try {
    if (typeof Lampa !== 'undefined') {
      if (Lampa.Player) {
        if (typeof Lampa.Player.opened === 'function' && Lampa.Player.opened()) {
          return true;
        }
        if (Lampa.Player.opened === true) {
          return true;
        }
      }
      if (Lampa.Controller && typeof Lampa.Controller.enabled === 'function') {
        const cur = Lampa.Controller.enabled();
        if (cur && cur.name && String(cur.name).toLowerCase().includes('player')) {
          return true;
        }
      }
      if (Lampa.Activity && typeof Lampa.Activity.active === 'function') {
        const act = Lampa.Activity.active();
        if (act && act.component === 'player') {
          return true;
        }
      }
    }
  } catch {
    // Ignore
  }
  return false;
}

export function updateEpisodeViewedHtml(
  ctx: ComponentContext,
  episodeNumber: number,
  viewed: boolean
): void {
  try {
    const el = ctx.scroll.render().find(`[data-episode="${episodeNumber}"]`);
    if (el.length) {
      el.find('.online-prestige__viewed, .torrent-item__viewed').remove();
      if (viewed) {
        el.find('.online-prestige__img').append(
          '<div class="online-prestige__viewed">' +
            ((typeof Lampa !== 'undefined' && Lampa.Template && Lampa.Template.get)
              ? Lampa.Template.get('icon_viewed', {}, true)
              : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>') +
            '</div>'
        );
      }
    }
  } catch {
    // Ignore DOM update error
  }
}

export function findMatchingVoiceSource(
  sources: OmssSourceItem[],
  voiceName: string
): OmssSourceItem | null {
  if (!sources || !sources.length) return null;
  if (!voiceName) return sources[0];
  const target = voiceName.toLowerCase().trim();

  // 1. Exact match on audio or studio name or audioTracks
  for (const s of sources) {
    const v = extractVoiceName(s).toLowerCase().trim();
    if (v === target) return s;
    if (s.audioTracks && s.audioTracks.some((t: string) => t.toLowerCase().trim() === target)) {
      return s;
    }
  }
  // 2. Substring match
  for (const s of sources) {
    const v = extractVoiceName(s).toLowerCase().trim();
    if (v.includes(target) || target.includes(v)) return s;
  }
  return sources[0];
}

export async function playTvEpisode(
  ctx: ComponentContext,
  ep: TmdbEpisodeItem
): Promise<void> {
  const epNum = ep.episode_number;
  const activeSeason = ctx.state.activeSeason;
  const host = ctx.host;
  const movie = ctx.movie;
  const activeProvider = ctx.state.activeProvider;
  const activeVoice = ctx.state.activeVoice;

  ctx.state.selectedEpisodeNumber = epNum;

  let targetSource: OmssSourceItem | null = null;
  let subTracks: any[] = [];
  let playUrl = '';

  const provItem =
    ctx.state.currentProvidersMap.get(activeProvider) ||
    Array.from(ctx.state.currentProvidersMap.values())[0];

  if (provItem && provItem.sources && provItem.sources.length) {
    // If epNum is the probed episode, provItem.sources are already resolved for it
    const probedEpNum = ctx.state.selectedEpisodeNumber || 1;
    if (epNum === probedEpNum) {
      targetSource = findMatchingVoiceSource(provItem.sources, activeVoice) || provItem.sources[0];
      if (targetSource) {
        playUrl = normalizeStreamUrl(targetSource.url, host);
        if (activeVoice && targetSource.sharedVideo && !playUrl.includes('voice=')) {
          playUrl = withVoiceQuery(playUrl, activeVoice);
        }
        subTracks = (targetSource.subtitles || provItem.subtitles || []).map((sub: any) => ({
          ...sub,
          url: normalizeStreamUrl(sub.url, host),
        }));
      }
    }
  }

  // If not resolved from preloaded probe, resolve via fetchEpisodeProviders
  if (!playUrl) {
    let cancelled = false;
    if (typeof Lampa !== 'undefined' && Lampa.Loading && Lampa.Loading.start) {
      Lampa.Loading.start(() => {
        cancelled = true;
        if (Lampa.Loading.stop) Lampa.Loading.stop();
      });
    }

    try {
      const providers = await fetchEpisodeProviders(
        host,
        movie.id || movie.imdb_id || '',
        activeSeason,
        epNum
      );
      if (cancelled) return;
      if (typeof Lampa !== 'undefined' && Lampa.Loading && Lampa.Loading.stop) {
        Lampa.Loading.stop();
      }

      const foundProv =
        providers.find((p) => p.name.toLowerCase() === activeProvider.toLowerCase()) ||
        providers[0];
      if (foundProv && foundProv.sources && foundProv.sources.length) {
        targetSource = findMatchingVoiceSource(foundProv.sources, activeVoice) || foundProv.sources[0];
        playUrl = normalizeStreamUrl(targetSource.url, host);
        if (activeVoice && targetSource.sharedVideo && !playUrl.includes('voice=')) {
          playUrl = withVoiceQuery(playUrl, activeVoice);
        }
        subTracks = (targetSource.subtitles || foundProv.subtitles || []).map((sub: any) => ({
          ...sub,
          url: normalizeStreamUrl(sub.url, host),
        }));
      }
    } catch {
      if (typeof Lampa !== 'undefined' && Lampa.Loading && Lampa.Loading.stop) {
        Lampa.Loading.stop();
      }
      if (cancelled) return;
    }
  }

  // Fallback to /play.m3u8 if still not resolved
  if (!playUrl) {
    const cleanProv = activeProvider ? activeProvider.replace(/^★\s*/, '').trim() : '';
    playUrl = `${host}/play.m3u8?id=${encodeURIComponent(String(movie.id || movie.imdb_id))}&type=tv&s=${activeSeason}&e=${epNum}&provider=${encodeURIComponent(cleanProv)}&voice=${encodeURIComponent(activeVoice)}`;
  }

  const hashTimeline = getEpisodeHashTimeline(movie, activeSeason, epNum);
  const hashBehold = getEpisodeHashBehold(movie, activeSeason, epNum);

  const timeline =
    typeof Lampa !== 'undefined' && Lampa.Timeline && Lampa.Timeline.view
      ? Lampa.Timeline.view(
          hashTimeline,
          Lampa.Timeline.link ? Lampa.Timeline.link(movie, activeSeason, epNum) : undefined
        )
      : { percent: 0, time: 0, duration: 0, hash: hashTimeline };

  if (movie.id && typeof Lampa !== 'undefined' && Lampa.Favorite && Lampa.Favorite.add) {
    Lampa.Favorite.add('history', movie, 100);
  }

  const cleanProvider = activeProvider ? activeProvider.replace(/^★\s*/, '').trim() : '';

  // Base playback item for the current episode
  const playObj: any = {
    url: playUrl,
    title: `${movie.title || movie.name} - S${activeSeason}E${epNum} (${activeVoice || 'Озвучення'})`,
    season: activeSeason,
    episode: epNum,
    timeline,
    subtitles: subTracks,
    callback: () => {
      ctx.state.isPlaybackActive = false;
      markViewed(ctx, hashBehold, activeSeason, epNum);
      updateEpisodeViewedHtml(ctx, epNum, true);
    },
  };

  // Build playlist for the season without circular references
  const playlist: any[] = ctx.state.seasonEpisodes.map((epItem) => {
    const n = epItem.episode_number;
    const epHashTimeline = getEpisodeHashTimeline(movie, activeSeason, n);
    const epHashBehold = getEpisodeHashBehold(movie, activeSeason, n);

    const epTimeline =
      typeof Lampa !== 'undefined' && Lampa.Timeline && Lampa.Timeline.view
        ? Lampa.Timeline.view(
            epHashTimeline,
            Lampa.Timeline.link ? Lampa.Timeline.link(movie, activeSeason, n) : undefined
          )
        : { percent: 0, time: 0, duration: 0, hash: epHashTimeline };

    const nextUrl = `${host}/play.m3u8?id=${encodeURIComponent(String(movie.id || movie.imdb_id))}&type=tv&s=${activeSeason}&e=${n}&provider=${encodeURIComponent(cleanProvider)}&voice=${encodeURIComponent(activeVoice)}`;

    return {
      url: n === epNum ? playUrl : nextUrl,
      title: `${movie.title || movie.name} - S${activeSeason}E${n} (${activeVoice || 'Озвучення'})`,
      season: activeSeason,
      episode: n,
      timeline: epTimeline,
      callback: () => {
        markViewed(ctx, epHashBehold, activeSeason, n);
        updateEpisodeViewedHtml(ctx, n, true);
      },
    };
  });

  // CRITICAL FIX: Shallow clone playObj to playData so playlist does NOT contain playData itself!
  // Android / Siaivo player executes JSON.stringify(data) which throws on circular structures.
  const playData: any = {};
  for (const k of Object.keys(playObj)) {
    playData[k] = playObj[k];
  }
  if (playlist.length > 1) {
    playData.playlist = playlist;
  }

  ctx.state.isPlaybackActive = true;

  try {
    Lampa.Player.play(playData);
    if (playlist.length > 1 && Lampa.Player.playlist) {
      Lampa.Player.playlist(playlist);
    }
  } catch (err: any) {
    ctx.state.isPlaybackActive = false;
    if (typeof Lampa !== 'undefined' && Lampa.Noty && Lampa.Noty.show) {
      Lampa.Noty.show(`UAFilms: ${(err && err.message) || 'Помилка запуску плеєра'}`);
    }
  }
}
