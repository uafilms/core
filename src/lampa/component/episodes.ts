import type { TmdbEpisodeItem } from '../types/index.js';
import { fetchSeasonDetails } from '../api/index.js';
import { formatFullDate, hashString, secondsToTime } from '../utils/index.js';
import type { ComponentContext } from './types.js';
import { isViewed, saveChoice, unmarkViewed } from './storage.js';
import { resetList, showEmpty } from './empty.js';
import { showContextMenu } from './context-menu.js';
import { openTvEpisodeSources } from './sources.js';

declare const Lampa: any;
declare const $: any;

export async function loadTvSeason(ctx: ComponentContext, seasonNum: number): Promise<void> {
  if (ctx.self.activity?.loader) ctx.self.activity.loader(true);
  resetList(ctx);

  ctx.state.viewMode = 'episodes';
  ctx.state.selectedEpisode = null;
  ctx.state.activeSeason = seasonNum;
  saveChoice(ctx, { season: seasonNum });

  try {
    const seasonData = await fetchSeasonDetails(ctx.host, ctx.movie.id || ctx.movie.imdb_id || '', seasonNum);
    ctx.state.seasonEpisodes = seasonData.episodes || [];

    if (!ctx.state.seasonEpisodes.length) {
      showEmpty(ctx, Lampa.Lang.translate('uafilms_not_found'));
      if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
      return;
    }

    renderTvEpisodes(ctx, ctx.state.seasonEpisodes);
  } catch {
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
  const filterTranslate = ctx.filterTranslate;
  const activeSeason = ctx.state.activeSeason;

  const totalSeasons = Math.max(
    movie.number_of_seasons || (movie.seasons ? movie.seasons.length : 1),
    1
  );
  const seasonList: string[] = [];
  for (let i = 1; i <= totalSeasons; i++) {
    seasonList.push(`${filterTranslate.season} ${i}`);
  }

  const selectItems: any[] = [
    {
      title: Lampa.Lang.translate('torrent_parser_reset'),
      reset: true,
    },
  ];

  if (seasonList.length > 1) {
    const subitems = seasonList.map((name, i) => ({
      title: name,
      selected: i + 1 === activeSeason,
      index: i + 1,
    }));
    selectItems.push({
      title: filterTranslate.season,
      subtitle: seasonList[activeSeason - 1] || seasonList[0],
      items: subitems,
      stype: 'season',
    });
  }

  ctx.filter.set('filter', selectItems);
  ctx.filter.chosen('filter', [`${filterTranslate.season}: ${activeSeason}`]);

  let autoScrollTarget: any = null;

  episodes.forEach((ep, index) => {
    const epNum = ep.episode_number || index + 1;
    const epTitle = ep.name || `${Lampa.Lang.translate('uafilms_episode')} ${epNum}`;
    const epTime = ep.runtime
      ? secondsToTime(ep.runtime * 60)
      : movie.runtime
      ? secondsToTime(movie.runtime * 60)
      : '';

    const hashTimeline = hashString(
      `${activeSeason}_${epNum}_${movie.original_title || movie.title || ''}`
    );
    const hashBehold = hashString(
      `${activeSeason}_${epNum}_${movie.original_title || movie.title || ''}_uafilms`
    );

    const timeline = Lampa.Timeline.view
      ? Lampa.Timeline.view(hashTimeline, Lampa.Timeline.link ? Lampa.Timeline.link(movie, activeSeason, epNum) : undefined)
      : { percent: 0, time: 0, duration: 0 };

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
        img.src = Lampa.TMDB && Lampa.TMDB.image
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

    if (timeline && Lampa.Timeline.render) {
      itemHtml.find('.online-prestige__timeline').append(Lampa.Timeline.render(timeline));
    }

    if (isViewed(hashBehold)) {
      imgContainer.append(
        '<div class="online-prestige__viewed">' +
          Lampa.Template.get('icon_viewed', {}, true) +
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
      ctx.state.selectedEpisodeNumber = epNum;
      openTvEpisodeSources(ctx, ep);
    });

    showContextMenu(ctx, {
      html: itemHtml,
      hashBehold,
      timeline,
      onPlay: () => {
        ctx.state.selectedEpisodeNumber = epNum;
        openTvEpisodeSources(ctx, ep);
      },
      onClearWatched: () => unmarkViewed(hashBehold),
    });

    ctx.scroll.append(itemHtml);
  });

  if (autoScrollTarget && autoScrollTarget.length) {
    ctx.state.lastFocusElement = autoScrollTarget[0];
  } else {
    const first = ctx.scroll.render().find('.selector').first();
    ctx.state.lastFocusElement = first.length ? first[0] : null;
  }

  Lampa.Controller.toggle('content');
  if (ctx.state.lastFocusElement && typeof ctx.scroll.update === 'function') {
    ctx.scroll.update($(ctx.state.lastFocusElement), true);
  }
}
