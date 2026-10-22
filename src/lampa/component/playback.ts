import type { OmssSourceItem, PlayItem } from '../types/index.js';
import { hashString, normalizeStreamUrl } from '../utils/index.js';
import type { ComponentContext } from './types.js';
import { markViewed } from './storage.js';

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

export function startTvPlayback(
  ctx: ComponentContext,
  source: OmssSourceItem,
  epNum: number,
  timeline: any,
  hashBehold: string,
  voiceName: string,
  providerName: string,
  playUrlOverride?: string
): void {
  ctx.state.isPlaybackActive = true;
  if (ctx.state.currentStreamCancel) {
    ctx.state.currentStreamCancel();
    ctx.state.currentStreamCancel = null;
  }

  const host = ctx.host;
  const movie = ctx.movie;
  const activeSeason = ctx.state.activeSeason;
  const seasonEpisodes = ctx.state.seasonEpisodes;
  const isTv = ctx.isTv;

  const playUrl = normalizeStreamUrl(playUrlOverride || source.url, host);
  const subTracks = (source.subtitles || []).map((sub) => ({
    ...sub,
    url: normalizeStreamUrl(sub.url, host),
  }));

  const cleanProvider = providerName ? providerName.replace(/^★\s*/, '').trim() : '';

  const playObj: PlayItem = {
    url: playUrl,
    title: `${movie.title || movie.name} - S${activeSeason}E${epNum} (${voiceName})`,
    season: activeSeason,
    episode: epNum,
    timeline,
    subtitles: subTracks,
    callback: () => {
      ctx.state.isPlaybackActive = false;
      markViewed(ctx, hashBehold, activeSeason, epNum);
    },
  };

  const playlist: PlayItem[] = [];
  seasonEpisodes.forEach((epItem) => {
    const n = epItem.episode_number;
    if (n === epNum) {
      playlist.push(playObj);
    } else {
      const nextTimeline = hashString(
        `${activeSeason}_${n}_${movie.original_title || movie.title || ''}`
      );
      const nextHashBehold = hashString(
        `${activeSeason}_${n}_${movie.original_title || movie.title || ''}_${cleanProvider}_${voiceName}`
      );

      const nextUrl = `${host}/play.m3u8?id=${encodeURIComponent(String(movie.id || movie.imdb_id))}&type=tv&s=${activeSeason}&e=${n}&provider=${encodeURIComponent(cleanProvider)}&voice=${encodeURIComponent(voiceName)}`;

      playlist.push({
        url: nextUrl,
        title: `${movie.title || movie.name} - S${activeSeason}E${n} (${voiceName})`,
        season: activeSeason,
        episode: n,
        timeline: Lampa.Timeline.view
          ? Lampa.Timeline.view(
              nextTimeline,
              Lampa.Timeline.link && isTv ? Lampa.Timeline.link(movie, activeSeason, n) : undefined
            )
          : { percent: 0, time: 0, duration: 0 },
        callback: () => markViewed(ctx, nextHashBehold, activeSeason, n),
      });
    }
  });

  if (playlist.length > 1) {
    playObj.playlist = playlist;
  }

  Lampa.Player.play(playObj);
  if (playlist.length > 1 && Lampa.Player.playlist) {
    Lampa.Player.playlist(playlist);
  }
}
