import type { OmssProviderItem, TmdbEpisodeItem } from '../types/index.js';
import { fetchSeasonDetails, streamEpisodeSources } from '../api/index.js';
import {
  extractVoiceName,
  formatFullDate,
  getProviderFromMap,
  secondsToTime,
} from '../utils/index.js';
import type { ComponentContext } from './types.js';
import {
  getEpisodeHashBehold,
  getEpisodeHashTimeline,
  getSavedChoice,
  isViewed,
  saveChoice,
  unmarkViewed,
} from './storage.js';
import { resetList, showEmpty } from './empty.js';
import { showContextMenu } from './context-menu.js';
import { favoriteCdnRank, updateBalancersTab } from './favorites.js';
import { playTvEpisode, updateEpisodeViewedHtml } from './playback.js';

declare const Lampa: any;
declare const $: any;

export function extractVoicesFromProvider(providerItem?: OmssProviderItem): string[] {
  if (!providerItem || !providerItem.sources || !providerItem.sources.length) return [];
  const voices: string[] = [];
  const seen = new Set<string>();

  for (const source of providerItem.sources) {
    if (source.audioTracks && source.audioTracks.length > 1 && providerItem.sources.length === 1) {
      for (const track of source.audioTracks) {
        const clean = track.trim();
        if (clean && !seen.has(clean)) {
          seen.add(clean);
          voices.push(clean);
        }
      }
    } else {
      const v = extractVoiceName(source);
      if (v && !seen.has(v)) {
        seen.add(v);
        voices.push(v);
      }
    }
  }
  return voices;
}

export function updateTvFilter(ctx: ComponentContext): void {
  const filterTranslate = ctx.filterTranslate;
  const activeSeason = ctx.state.activeSeason;
  const activeVoice = ctx.state.activeVoice;
  const totalSeasons = Math.max(
    ctx.movie.number_of_seasons || (ctx.movie.seasons ? ctx.movie.seasons.length : 1),
    1
  );

  const selectItems: any[] = [
    {
      title: Lampa.Lang.translate('torrent_parser_reset'),
      reset: true,
    },
  ];

  const chosenTitles: string[] = [];

  // 1. Voice acting / Studio dropdown
  const provItem = getProviderFromMap(
    ctx.state.currentProvidersMap,
    ctx.state.activeProvider
  );
  const voices = extractVoicesFromProvider(provItem);

  if (voices.length > 0) {
    const voiceSubitems = voices.map((v, i) => ({
      title: v,
      selected: v === activeVoice,
      index: i,
    }));
    selectItems.push({
      title: filterTranslate.voice,
      subtitle: activeVoice || voices[0],
      items: voiceSubitems,
      stype: 'voice',
    });
    chosenTitles.push(`${filterTranslate.voice}: ${activeVoice || voices[0]}`);
  } else {
    selectItems.push({
      title: filterTranslate.voice,
      subtitle:
        (typeof Lampa !== 'undefined' && Lampa.Lang && Lampa.Lang.translate('loading')) ||
        'Завантаження...',
      items: [],
      stype: 'voice_loading',
    });
    chosenTitles.push(`${filterTranslate.voice}: ...`);
  }

  // 2. Season dropdown (if multiple seasons)
  if (totalSeasons > 1) {
    const seasonList: string[] = [];
    for (let i = 1; i <= totalSeasons; i++) {
      seasonList.push(`${filterTranslate.season} ${i}`);
    }
    const seasonSubitems = seasonList.map((name, i) => ({
      title: name,
      selected: i + 1 === activeSeason,
      index: i + 1,
    }));
    selectItems.push({
      title: filterTranslate.season,
      subtitle: seasonList[activeSeason - 1] || seasonList[0],
      items: seasonSubitems,
      stype: 'season',
    });
    chosenTitles.push(`${filterTranslate.season}: ${activeSeason}`);
  }

  ctx.filter.set('filter', selectItems);
  ctx.filter.chosen('filter', chosenTitles);
}

export function updateTvVoicesAndFilter(ctx: ComponentContext): void {
  const provItem = getProviderFromMap(
    ctx.state.currentProvidersMap,
    ctx.state.activeProvider
  );
  const voices = extractVoicesFromProvider(provItem);
  const saved = getSavedChoice(ctx);

  if (voices.length > 0) {
    if (!ctx.state.activeVoice || !voices.includes(ctx.state.activeVoice)) {
      if (saved.voice && voices.includes(saved.voice)) {
        ctx.state.activeVoice = saved.voice;
      } else {
        ctx.state.activeVoice = voices[0];
      }
    }
  }

  updateTvFilter(ctx);
}

export async function probeSeasonVoices(ctx: ComponentContext, seasonNum: number): Promise<void> {
  if (ctx.state.currentStreamCancel) {
    ctx.state.currentStreamCancel();
    ctx.state.currentStreamCancel = null;
  }

  const probeEpNum = 1;
  ctx.state.probedSeason = seasonNum;
  ctx.state.probedEpisode = probeEpNum;

  ctx.state.currentStreamCancel = await streamEpisodeSources(
    ctx.host,
    ctx.movie.id || ctx.movie.imdb_id || '',
    seasonNum,
    probeEpNum,
    (chunk) => {
      ctx.state.currentProvidersMap.set(chunk.name, chunk);
      const providers = Array.from(ctx.state.currentProvidersMap.values());
      updateBalancersTab(ctx, providers);

      // Auto-upgrade to higher-ranked favorite CDN if user has not explicitly locked provider
      if (!ctx.state.userManuallySelectedProvider) {
        const currentRank = favoriteCdnRank(ctx.state.activeProvider);
        const newRank = favoriteCdnRank(chunk.provider || chunk.name);
        if (newRank < currentRank) {
          ctx.state.activeProvider = chunk.name;
          updateBalancersTab(ctx, providers);
        }
      }

      updateTvVoicesAndFilter(ctx);
    },
    () => {
      updateTvVoicesAndFilter(ctx);
    },
    () => {
      // Keep rendered episodes even if source discovery encounters network error
      updateTvVoicesAndFilter(ctx);
    }
  );
}

export async function loadTvSeason(ctx: ComponentContext, seasonNum: number): Promise<void> {
  if (ctx.self.activity?.loader) ctx.self.activity.loader(true);

  ctx.state.viewMode = 'episodes';
  ctx.state.selectedEpisode = null;
  ctx.state.activeSeason = seasonNum;
  saveChoice(ctx, { season: seasonNum });

  updateBalancersTab(ctx, Array.from(ctx.state.currentProvidersMap.values()));
  updateTvFilter(ctx);

  try {
    const seasonData = await fetchSeasonDetails(
      ctx.host,
      ctx.movie.id || ctx.movie.imdb_id || '',
      seasonNum
    );
    ctx.state.seasonEpisodes = seasonData.episodes || [];

    if (!ctx.state.seasonEpisodes.length) {
      resetList(ctx);
      showEmpty(ctx, Lampa.Lang.translate('uafilms_not_found'));
      if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
      return;
    }

    renderTvEpisodes(ctx, ctx.state.seasonEpisodes);
    probeSeasonVoices(ctx, seasonNum);
  } catch {
    resetList(ctx);
    showEmpty(ctx, Lampa.Lang.translate('uafilms_error'));
  } finally {
    if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
    if (ctx.self.activity?.toggle) ctx.self.activity.toggle();
  }
}

export function renderTvEpisodes(ctx: ComponentContext, episodes: TmdbEpisodeItem[]): void {
  ctx.state.viewMode = 'episodes';
  ctx.state.selectedEpisode = null;
  resetList(ctx);

  const movie = ctx.movie;
  const activeSeason = ctx.state.activeSeason;

  updateTvFilter(ctx);

  let autoScrollTarget: any = null;

  episodes.forEach((ep, index) => {
    const epNum = ep.episode_number || index + 1;
    const epTitle = ep.name || `${Lampa.Lang.translate('uafilms_episode')} ${epNum}`;
    const epTime = ep.runtime
      ? secondsToTime(ep.runtime * 60)
      : movie.runtime
      ? secondsToTime(movie.runtime * 60)
      : '';

    const hashTimeline = getEpisodeHashTimeline(movie, activeSeason, epNum);
    const hashBehold = getEpisodeHashBehold(movie, activeSeason, epNum);

    const timeline =
      typeof Lampa !== 'undefined' && Lampa.Timeline && Lampa.Timeline.view
        ? Lampa.Timeline.view(
            hashTimeline,
            Lampa.Timeline.link ? Lampa.Timeline.link(movie, activeSeason, epNum) : undefined
          )
        : { percent: 0, time: 0, duration: 0, hash: hashTimeline };

    const infoParts: string[] = [];
    if (ep.vote_average) {
      infoParts.push(`★ ${parseFloat(String(ep.vote_average)).toFixed(1)}`);
    }
    if (ep.air_date) {
      infoParts.push(formatFullDate(ep.air_date));
    }

    const itemHtml = $(
      Lampa.Template.get('uafilms_item', {
        title: `${epNum}. ${epTitle}`,
        time: epTime,
        info: infoParts.join(' • '),
        quality: '',
      })
    );

    itemHtml.attr('data-episode', String(epNum));

    const imgContainer = itemHtml.find('.online-prestige__img');
    const loader = itemHtml.find('.online-prestige__loader');
    const img = itemHtml.find('img')[0];

    if (img) {
      const stillPath = ep.still_path || movie.backdrop_path || movie.poster_path;
      if (stillPath) {
        img.onload = () => {
          imgContainer.addClass('online-prestige__img--loaded');
          loader.remove();
          imgContainer.append(
            `<div class="online-prestige__episode-number">${('0' + epNum).slice(-2)}</div>`
          );
        };
        img.onerror = () => {
          loader.remove();
          imgContainer.append(
            `<div class="online-prestige__episode-number">${('0' + epNum).slice(-2)}</div>`
          );
        };
        img.src =
          Lampa.TMDB && Lampa.TMDB.image
            ? Lampa.TMDB.image('t/p/w300' + stillPath)
            : `https://image.tmdb.org/t/p/w300${stillPath}`;
        ctx.state.currentImages.push(img);
      } else {
        loader.remove();
        imgContainer.append(
          `<div class="online-prestige__episode-number">${('0' + epNum).slice(-2)}</div>`
        );
      }
    }

    if (timeline && Lampa.Timeline && Lampa.Timeline.render) {
      itemHtml.find('.online-prestige__timeline').append(Lampa.Timeline.render(timeline));
    }

    if (isViewed(hashBehold)) {
      imgContainer.append(
        '<div class="online-prestige__viewed">' +
          ((typeof Lampa !== 'undefined' && Lampa.Template && Lampa.Template.get)
            ? Lampa.Template.get('icon_viewed', {}, true)
            : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>') +
          '</div>'
      );
    }

    if (ctx.state.selectedEpisodeNumber && epNum === ctx.state.selectedEpisodeNumber) {
      autoScrollTarget = itemHtml;
    } else if (!autoScrollTarget && !isViewed(hashBehold)) {
      autoScrollTarget = itemHtml;
    }

    itemHtml.on('hover:focus', (e: any) => {
      ctx.state.lastFocusElement = e.target;
      ctx.scroll.update($(e.target), true);
    });

    itemHtml.on('hover:enter', () => {
      playTvEpisode(ctx, ep);
    });

    showContextMenu(ctx, {
      html: itemHtml,
      hashBehold,
      timeline,
      onPlay: () => {
        playTvEpisode(ctx, ep);
      },
      onClearWatched: () => {
        unmarkViewed(hashBehold);
        updateEpisodeViewedHtml(ctx, epNum, false);
      },
    });

    ctx.scroll.append(itemHtml);
  });

  if (autoScrollTarget && autoScrollTarget.length) {
    ctx.state.lastFocusElement = autoScrollTarget[0];
  } else {
    const first = ctx.scroll.render().find('.selector').first();
    ctx.state.lastFocusElement = first.length ? first[0] : null;
  }
}
