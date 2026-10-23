import type { LampaActivityObject, LampaMovie } from '../types/index.js';
import { getHost } from '../utils/index.js';
import { fetchTvDetails } from '../api/index.js';
import type { ComponentContext, ComponentState } from './types.js';
import { getSavedChoice, saveChoice } from './storage.js';
import { clearImages } from './empty.js';
import {
  extractVoicesFromProvider,
  loadTvSeason,
  renderTvEpisodes,
  updateTvFilter,
  updateTvVoicesAndFilter,
} from './episodes.js';
import { loadMovie, renderActiveProviderSources } from './sources.js';
import { setupController } from './controller.js';

export * from './types.js';
export * from './storage.js';
export * from './favorites.js';
export * from './empty.js';
export * from './context-menu.js';
export * from './playback.js';
export * from './episodes.js';
export * from './sources.js';
export * from './controller.js';

declare const Lampa: any;

export function UAFilmsComponent(this: any, object: LampaActivityObject) {
  const self = this;
  const host = getHost();
  const movie: LampaMovie = object.movie || object.card || {};
  const isTv = Boolean(
    movie.number_of_seasons ||
      movie.name ||
      (movie.seasons && movie.seasons.length > 0) ||
      object.search_two
  );

  const scroll = new Lampa.Scroll({ mask: true, over: true });
  const filter = new Lampa.Filter(object);
  const files = Lampa.Explorer ? new Lampa.Explorer(object) : new Lampa.Files(object);

  const state: ComponentState = {
    lastFocusElement: null,
    selectedEpisodeNumber: 0,
    initialized: false,
    viewMode: 'episodes',
    activeSeason: 1,
    activeProvider: '',
    activeVoice: '',
    userManuallySelectedProvider: false,
    userManuallySelectedVoice: false,
    selectedEpisode: null,
    seasonEpisodes: [],
    currentProvidersMap: new Map(),
    currentImages: [],
    currentStreamCancel: null,
    isPlaybackActive: false,
  };

  const filterTranslate = {
    season: Lampa.Lang.translate('uafilms_season'),
    voice: Lampa.Lang.translate('uafilms_voice'),
    source: Lampa.Lang.translate('uafilms_source'),
  };

  const ctx: ComponentContext = {
    self,
    object,
    movie,
    isTv,
    host,
    scroll,
    filter,
    files,
    state,
    filterTranslate,
  };

  this.initialize = function () {
    const saved = getSavedChoice(ctx);
    state.activeSeason = saved.season || 1;
    state.activeProvider = saved.provider || '';
    state.activeVoice = saved.voice || '';

    // Set balancer tab label to "Джерело"
    filter.render().find('.filter--sort span').text(filterTranslate.source);
    filter.set('sort', [
      {
        title:
          (typeof Lampa !== 'undefined' && Lampa.Lang && Lampa.Lang.translate('loading')) ||
          'Завантаження...',
        source: '',
        selected: true,
      },
    ]);
    filter.chosen('sort', [filterTranslate.source]);

    filter.onSearch = (value: string) => {
      Lampa.Activity.replace({
        search: value,
        clarification: true,
      });
    };

    filter.onBack = () => {
      self.start();
    };

    filter.onSelect = (type: string, a: any, b: any) => {
      if (type === 'sort') {
        // Balancer / Source tab clicked! (NO "All" option)
        Lampa.Select.close();
        if (a.source) {
          state.userManuallySelectedProvider = true;
          state.activeProvider = a.source;
          saveChoice(ctx, { provider: state.activeProvider });
          filter.chosen('sort', [state.activeProvider]);

          if (isTv) {
            updateTvVoicesAndFilter(ctx);
          } else {
            renderActiveProviderSources(ctx);
          }
        }
      } else if (type === 'filter') {
        if (a.reset) {
          if (isTv) {
            state.userManuallySelectedProvider = false;
            state.activeVoice = '';
            loadTvSeason(ctx, state.activeSeason);
          } else {
            loadMovie(ctx);
          }
        } else if (a.stype === 'season') {
          loadTvSeason(ctx, b.index);
        } else if (a.stype === 'voice') {
          state.userManuallySelectedVoice = true;
          const provItem =
            state.currentProvidersMap.get(state.activeProvider) ||
            Array.from(state.currentProvidersMap.values())[0];
          const voices = extractVoicesFromProvider(provItem);
          if (voices[b.index]) {
            state.activeVoice = voices[b.index];
            saveChoice(ctx, { voice: state.activeVoice });
            updateTvFilter(ctx);
          }
          Lampa.Select.close();
        }
      }
    };

    if (filter.addButtonBack) filter.addButtonBack();

    if (files.appendFiles) {
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.minus(files.render().find('.explorer__files-head'));
    } else {
      files.append(scroll.render());
      scroll.append(filter.render());
    }

    scroll.body().addClass('torrent-list');

    try {
      if (typeof Lampa !== 'undefined' && Lampa.Player && Lampa.Player.listener) {
        Lampa.Player.listener.follow('destroy', () => {
          state.isPlaybackActive = false;
        });
      }
    } catch {
      // Ignore
    }

    if (isTv) {
      if (!movie.number_of_seasons && !movie.seasons) {
        fetchTvDetails(host, movie.id || movie.imdb_id || '')
          .then((details) => {
            if (details) {
              if (details.number_of_seasons) movie.number_of_seasons = details.number_of_seasons;
              if (details.seasons) movie.seasons = details.seasons;
            }
            loadTvSeason(ctx, state.activeSeason);
          })
          .catch(() => {
            loadTvSeason(ctx, state.activeSeason);
          });
      } else {
        loadTvSeason(ctx, state.activeSeason);
      }
    } else {
      loadMovie(ctx);
    }
  };

  this.create = function () {
    return files.render();
  };

  this.start = function () {
    if (!state.initialized) {
      state.initialized = true;
      this.initialize();
    }

    if (Lampa.Background && Lampa.Background.immediately && Lampa.Utils.cardImgBackgroundBlur) {
      Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(movie));
    }

    setupController(ctx);
  };

  this.pause = function () {};
  this.stop = function () {};

  this.render = function () {
    return files.render();
  };

  this.destroy = function () {
    if (state.currentStreamCancel) {
      state.currentStreamCancel();
      state.currentStreamCancel = null;
    }
    clearImages(ctx);
    if (files.destroy) files.destroy();
    if (scroll.destroy) scroll.destroy();
  };
}
