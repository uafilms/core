import type { OmssSourceItem, TmdbEpisodeItem } from '../types/index.js';
import {
  extractVoiceName,
  getProviderFromMap,
  normalizeStreamUrl,
  withVoiceQuery,
} from '../utils/index.js';
import { fetchEpisodeProviders } from '../api/index.js';
import type { ComponentContext } from './types.js';
import {
  getEpisodeCardKey,
  getEpisodeHashBehold,
  getEpisodeHashTimeline,
  markViewed,
  saveChoice,
} from './storage.js';
import { extractVoicesFromProvider, updateTvFilter } from './episodes.js';

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

  const provItem = getProviderFromMap(
    ctx.state.currentProvidersMap,
    activeProvider
  );

  // ONLY reuse preloaded sources if the clicked episode matches the probed episode (typically episode 1)
  const isProbed =
    ctx.state.probedSeason === activeSeason &&
    ctx.state.probedEpisode === epNum;

  if (isProbed && provItem && provItem.sources && provItem.sources.length) {
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

  // If not the probed episode or sources not yet available, resolve sources for this specific episode
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

  const isTargetMp4 =
    targetSource?.type === 'mp4' ||
    targetSource?.videoType === 'mp4' ||
    playUrl.includes('/video.mp4') ||
    playUrl.includes('.mp4');

  // Fallback to /play.m3u8 or /play.mp4 if still not resolved
  if (!playUrl) {
    const cleanProv = activeProvider ? activeProvider.replace(/^★\s*/, '').trim() : '';
    const ext = isTargetMp4 ? 'mp4' : 'm3u8';
    playUrl = `${host}/play.${ext}?id=${encodeURIComponent(String(movie.id || movie.imdb_id))}&type=tv&s=${activeSeason}&e=${epNum}&provider=${encodeURIComponent(cleanProv)}&voice=${encodeURIComponent(activeVoice)}`;
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

  const currentStill = ep.still_path || movie.backdrop_path || movie.poster_path;
  const currentThumbnail = currentStill
    ? typeof Lampa !== 'undefined' && Lampa.TMDB && typeof Lampa.TMDB.image === 'function'
      ? Lampa.TMDB.image('t/p/w300' + currentStill)
      : `https://image.tmdb.org/t/p/w300${currentStill}`
    : '';

  // Base playback item for the current episode
  const playObj: any = {
    url: playUrl,
    type: isTargetMp4 ? 'mp4' : 'hls',
    video_type: isTargetMp4 ? 'mp4' : 'hls',
    title: `${movie.title || movie.name} - S${activeSeason}E${epNum} (${activeVoice || 'Озвучення'})`,
    season: activeSeason,
    episode: epNum,
    thumbnail: currentThumbnail,
    icon: currentThumbnail,
    img: currentThumbnail,
    poster: currentThumbnail,
    image: currentThumbnail,
    timeline,
    subtitles: subTracks,
    callback: () => {
      ctx.state.isPlaybackActive = false;
      markViewed(ctx, hashBehold, activeSeason, epNum);
      updateEpisodeViewedHtml(ctx, epNum, true);
    },
  };

  // Provide all audio tracks to Lampa player panel (Option.setTracks / translates)
  const availableTracks: string[] =
    targetSource?.audioTracks && targetSource.audioTracks.length > 1
      ? targetSource.audioTracks
      : provItem?.sources && provItem.sources.length > 1 && targetSource?.sharedVideo
      ? extractVoicesFromProvider(provItem)
      : [];

  if (availableTracks.length > 1) {
    playObj.translate = {
      tracks: availableTracks.map((name: string) => ({
        name,
        label: name,
        language: name,
      })),
    };

    playObj.voiceovers = availableTracks.map((trackName: string, idx: number) => {
      const isSelected =
        trackName.toLowerCase().trim() === (activeVoice || '').toLowerCase().trim();
      const trackPlayUrl = targetSource?.sharedVideo
        ? withVoiceQuery(playUrl, trackName)
        : playUrl;

      return {
        title: trackName,
        name: trackName,
        label: trackName,
        selected: isSelected,
        index: idx,
        url: trackPlayUrl,
        onSelect: () => {
          ctx.state.activeVoice = trackName;
          saveChoice(ctx, { voice: trackName });
          updateTvFilter(ctx);

          // If Hls.js is active and has matching audio track, switch natively
          try {
            if (typeof Lampa !== 'undefined') {
              if (Lampa.PlayerVideo) {
                const videoEl = Lampa.PlayerVideo.video();
                const hls = videoEl && videoEl._hls ? videoEl._hls : (window as any)._hls;
                if (hls && hls.audioTracks && hls.audioTracks.length > 1) {
                  const targetIdx = hls.audioTracks.findIndex(
                    (t: any) =>
                      (t.name || '').toLowerCase().trim() === trackName.toLowerCase().trim()
                  );
                  if (targetIdx !== -1) {
                    hls.audioTrack = targetIdx;
                    return;
                  }
                }
              }
              if (Lampa.Player && typeof Lampa.Player.play === 'function') {
                playTvEpisode(ctx, ep);
              }
            }
          } catch {
            // Ignore
          }
        },
      };
    });
  }

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

    const still = epItem.still_path || movie.backdrop_path || movie.poster_path;
    const itemThumbnail = still
      ? typeof Lampa !== 'undefined' && Lampa.TMDB && typeof Lampa.TMDB.image === 'function'
        ? Lampa.TMDB.image('t/p/w300' + still)
        : `https://image.tmdb.org/t/p/w300${still}`
      : '';

    const nextExt = isTargetMp4 ? 'mp4' : 'm3u8';
    const nextUrl = `${host}/play.${nextExt}?id=${encodeURIComponent(String(movie.id || movie.imdb_id))}&type=tv&s=${activeSeason}&e=${n}&provider=${encodeURIComponent(cleanProvider)}&voice=${encodeURIComponent(activeVoice)}`;

    const epObj: any = {
      url: n === epNum ? playUrl : nextUrl,
      type: isTargetMp4 ? 'mp4' : 'hls',
      video_type: isTargetMp4 ? 'mp4' : 'hls',
      title: `${movie.title || movie.name} - S${activeSeason}E${n} (${activeVoice || 'Озвучення'})`,
      season: activeSeason,
      episode: n,
      thumbnail: itemThumbnail,
      icon: itemThumbnail,
      img: itemThumbnail,
      poster: itemThumbnail,
      image: itemThumbnail,
      timeline: epTimeline,
      callback: () => {
        markViewed(ctx, epHashBehold, activeSeason, n);
        updateEpisodeViewedHtml(ctx, n, true);
      },
    };

    if (playObj.voiceovers) epObj.voiceovers = playObj.voiceovers;
    if (playObj.translate) epObj.translate = playObj.translate;

    return epObj;
  });

  // CRITICAL FIX: Shallow clone playObj to playData so playlist does NOT contain playData itself!
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
