import type { OmssSourceItem, TmdbEpisodeItem } from '../types/index.js';
import { streamEpisodeSources, streamMovieSources } from '../api/index.js';
import {
  extractVoiceName,
  hashString,
  normalizeStreamUrl,
  withVoiceQuery,
} from '../utils/index.js';
import type { ComponentContext } from './types.js';
import { isViewed, markViewed, unmarkViewed } from './storage.js';
import { favoriteCdnRank, updateBalancersTab } from './favorites.js';
import { resetList, showEmpty } from './empty.js';
import { showContextMenu } from './context-menu.js';
import { isPlayerActive, startTvPlayback } from './playback.js';
import { renderTvEpisodes } from './episodes.js';

declare const Lampa: any;
declare const $: any;

export async function openTvEpisodeSources(ctx: ComponentContext, ep: TmdbEpisodeItem): Promise<void> {
  if (ctx.state.currentStreamCancel) {
    ctx.state.currentStreamCancel();
    ctx.state.currentStreamCancel = null;
  }

  if (ctx.self.activity?.loader) ctx.self.activity.loader(true);
  resetList(ctx);

  ctx.state.viewMode = 'sources';
  ctx.state.selectedEpisode = ep;
  ctx.state.currentProvidersMap.clear();

  const epNum = ep.episode_number;
  const epTitle = ep.name || `${Lampa.Lang.translate('uafilms_episode')} ${epNum}`;

  // Filter bar shows back button
  ctx.filter.set('filter', [
    {
      title: Lampa.Lang.translate('uafilms_back_to_episodes'),
      back: true,
    },
    {
      title: Lampa.Lang.translate('torrent_parser_reset'),
      reset: true,
    },
  ]);
  ctx.filter.chosen('filter', [`S${ctx.state.activeSeason} E${epNum}: ${epTitle}`]);

  let renderedFirst = false;

  ctx.state.currentStreamCancel = await streamEpisodeSources(
    ctx.host,
    ctx.movie.id || ctx.movie.imdb_id || '',
    ctx.state.activeSeason,
    epNum,
    (chunk) => {
      ctx.state.currentProvidersMap.set(chunk.name, chunk);
      const providers = Array.from(ctx.state.currentProvidersMap.values());
      updateBalancersTab(ctx, providers);

      if (isPlayerActive(ctx)) {
        return;
      }

      // Auto-upgrade to higher-ranked favorite CDN if user hasn't locked a selection
      if (!ctx.state.userManuallySelectedProvider) {
        const currentRank = favoriteCdnRank(ctx.state.activeProvider);
        const newRank = favoriteCdnRank(chunk.provider || chunk.name);
        if (newRank < currentRank) {
          ctx.state.activeProvider = chunk.name;
          updateBalancersTab(ctx, providers);
          if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
          renderActiveProviderSources(ctx);
          return;
        }
      }

      // If chunk matches activeProvider or if this is the first provider to arrive, render immediately!
      if (
        !renderedFirst ||
        chunk.name.toLowerCase() === ctx.state.activeProvider.toLowerCase()
      ) {
        renderedFirst = true;
        if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
        renderActiveProviderSources(ctx);
      }
    },
    () => {
      if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
      const providers = Array.from(ctx.state.currentProvidersMap.values());
      if (!providers.length) {
        if (!isPlayerActive(ctx)) {
          showEmpty(ctx, Lampa.Lang.translate('uafilms_not_found'), () => {
            renderTvEpisodes(ctx, ctx.state.seasonEpisodes);
          });
        }
      } else if (!renderedFirst && !isPlayerActive(ctx)) {
        renderActiveProviderSources(ctx);
      }
    },
    () => {
      if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
      if (ctx.state.currentProvidersMap.size === 0 && !isPlayerActive(ctx)) {
        showEmpty(ctx, Lampa.Lang.translate('uafilms_error'), () => {
          renderTvEpisodes(ctx, ctx.state.seasonEpisodes);
        });
      }
    }
  );
}

export function renderActiveProviderSources(ctx: ComponentContext): void {
  if (isPlayerActive(ctx)) {
    return;
  }

  resetList(ctx);

  const providerItem =
    ctx.state.currentProvidersMap.get(ctx.state.activeProvider) ||
    Array.from(ctx.state.currentProvidersMap.values())[0];

  if (!providerItem || !providerItem.sources || !providerItem.sources.length) {
    showEmpty(ctx, Lampa.Lang.translate('uafilms_not_found'), () => {
      if (ctx.isTv) renderTvEpisodes(ctx, ctx.state.seasonEpisodes);
    });
    return;
  }

  const sources = providerItem.sources;
  const stillPath =
    (ctx.state.selectedEpisode && ctx.state.selectedEpisode.still_path) ||
    ctx.movie.backdrop_path ||
    ctx.movie.poster_path;

  const displaySources: Array<{
    source: OmssSourceItem;
    voiceName: string;
    playUrl: string;
    quality: string;
  }> = [];

  const seenVoices = new Set<string>();

  sources.forEach((source) => {
    if (source.audioTracks && source.audioTracks.length > 1 && sources.length === 1) {
      source.audioTracks.forEach((trackName) => {
        if (!seenVoices.has(trackName)) {
          seenVoices.add(trackName);
          displaySources.push({
            source,
            voiceName: trackName,
            playUrl: withVoiceQuery(source.url, trackName),
            quality: source.quality ? String(source.quality).trim() : 'Auto',
          });
        }
      });
    } else {
      const voiceName = extractVoiceName(source);
      if (!seenVoices.has(voiceName)) {
        seenVoices.add(voiceName);
        displaySources.push({
          source,
          voiceName,
          playUrl: source.url,
          quality: source.quality ? String(source.quality).trim() : 'Auto',
        });
      }
    }
  });

  displaySources.forEach((entry) => {
    const source = entry.source;
    const voiceName = entry.voiceName;
    const quality = entry.quality;
    const effectiveUrl = entry.playUrl;
    const infoParts: string[] = [];

    if (source.subtitles && source.subtitles.length) {
      infoParts.push(`Субтитри (${source.subtitles.length})`);
    }

    const epNum = ctx.state.selectedEpisode ? ctx.state.selectedEpisode.episode_number : 1;
    const hashTimeline = hashString(
      ctx.isTv
        ? `${ctx.state.activeSeason}_${epNum}_${ctx.movie.original_title || ctx.movie.title || ''}`
        : `movie_${ctx.movie.original_title || ctx.movie.title || ''}`
    );
    const hashBehold = hashString(
      ctx.isTv
        ? `${ctx.state.activeSeason}_${epNum}_${ctx.movie.original_title || ctx.movie.title || ''}_${providerItem.name}_${voiceName}`
        : `movie_${ctx.movie.original_title || ctx.movie.title || ''}_${providerItem.name}_${voiceName}`
    );

    const timeline = Lampa.Timeline.view
      ? Lampa.Timeline.view(
          hashTimeline,
          Lampa.Timeline.link && ctx.isTv ? Lampa.Timeline.link(ctx.movie, ctx.state.activeSeason, epNum) : undefined
        )
      : { percent: 0, time: 0, duration: 0 };

    // Vanilla Lampa prestige item with thumbnail on the left!
    const itemHtml = $(
      Lampa.Template.get('uafilms_item', {
        title: voiceName,
        time: '',
        info: infoParts.join(' • '),
        quality: quality,
      })
    );

    const imgContainer = itemHtml.find('.online-prestige__img');
    const loader = itemHtml.find('.online-prestige__loader');
    const img = itemHtml.find('img')[0];

    if (img && stillPath) {
      img.onload = () => {
        imgContainer.addClass('online-prestige__img--loaded');
        loader.remove();
      };
      img.onerror = () => {
        loader.remove();
      };
      img.src = Lampa.TMDB && Lampa.TMDB.image
        ? Lampa.TMDB.image('t/p/w300' + stillPath)
        : `https://image.tmdb.org/t/p/w300${stillPath}`;
      ctx.state.currentImages.push(img);
    } else {
      loader.remove();
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

    itemHtml.on('hover:focus', (e: any) => {
      ctx.state.lastFocusElement = e.target;
      ctx.scroll.update($(e.target), true);
    });

    const playCurrent = () => {
      ctx.state.isPlaybackActive = true;
      if (ctx.state.currentStreamCancel) {
        ctx.state.currentStreamCancel();
        ctx.state.currentStreamCancel = null;
      }

      if (ctx.movie.id && Lampa.Favorite && Lampa.Favorite.add) {
        Lampa.Favorite.add('history', ctx.movie, 100);
      }
      markViewed(ctx, hashBehold, ctx.state.activeSeason, epNum);

      const playUrl = normalizeStreamUrl(effectiveUrl, ctx.host);
      const subTracks = (source.subtitles || providerItem.subtitles || []).map((sub) => ({
        ...sub,
        url: normalizeStreamUrl(sub.url, ctx.host),
      }));

      if (ctx.isTv && ctx.state.selectedEpisode) {
        startTvPlayback(ctx, source, epNum, timeline, hashBehold, voiceName, providerItem.name, effectiveUrl);
      } else {
        Lampa.Player.play({
          url: playUrl,
          title: `${ctx.movie.title || ''} - ${voiceName}`,
          timeline,
          subtitles: subTracks,
          callback: () => {
            ctx.state.isPlaybackActive = false;
            markViewed(ctx, hashBehold);
          },
        });
      }
    };

    itemHtml.on('hover:enter', playCurrent);

    showContextMenu(ctx, {
      html: itemHtml,
      streamUrl: normalizeStreamUrl(effectiveUrl, ctx.host),
      hashBehold,
      timeline,
      onPlay: playCurrent,
      onClearWatched: () => unmarkViewed(hashBehold),
    });

    ctx.scroll.append(itemHtml);
  });

  const firstItem = ctx.scroll.render().find('.selector').first();
  if (firstItem.length) {
    ctx.state.lastFocusElement = firstItem[0];
  }
  if (!isPlayerActive(ctx)) {
    Lampa.Controller.toggle('content');
  }
}

export async function loadMovie(ctx: ComponentContext): Promise<void> {
  if (ctx.state.currentStreamCancel) {
    ctx.state.currentStreamCancel();
    ctx.state.currentStreamCancel = null;
  }

  if (ctx.self.activity?.loader) ctx.self.activity.loader(true);
  resetList(ctx);
  ctx.state.currentProvidersMap.clear();

  ctx.filter.set('filter', [
    {
      title: Lampa.Lang.translate('torrent_parser_reset'),
      reset: true,
    },
  ]);

  let renderedFirst = false;

  ctx.state.currentStreamCancel = await streamMovieSources(
    ctx.host,
    ctx.movie.id || ctx.movie.imdb_id || '',
    (chunk) => {
      ctx.state.currentProvidersMap.set(chunk.name, chunk);
      const providers = Array.from(ctx.state.currentProvidersMap.values());
      updateBalancersTab(ctx, providers);

      if (isPlayerActive(ctx)) {
        return;
      }

      // Auto-upgrade to higher-ranked favorite CDN if user hasn't locked a selection
      if (!ctx.state.userManuallySelectedProvider) {
        const currentRank = favoriteCdnRank(ctx.state.activeProvider);
        const newRank = favoriteCdnRank(chunk.provider || chunk.name);
        if (newRank < currentRank) {
          ctx.state.activeProvider = chunk.name;
          updateBalancersTab(ctx, providers);
          if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
          renderActiveProviderSources(ctx);
          return;
        }
      }

      if (
        !renderedFirst ||
        chunk.name.toLowerCase() === ctx.state.activeProvider.toLowerCase()
      ) {
        renderedFirst = true;
        if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
        renderActiveProviderSources(ctx);
      }
    },
    () => {
      if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
      const providers = Array.from(ctx.state.currentProvidersMap.values());
      if (!providers.length) {
        if (!isPlayerActive(ctx)) {
          showEmpty(ctx, Lampa.Lang.translate('uafilms_not_found'));
        }
      } else if (!renderedFirst && !isPlayerActive(ctx)) {
        renderActiveProviderSources(ctx);
      }
    },
    () => {
      if (ctx.self.activity?.loader) ctx.self.activity.loader(false);
      if (ctx.state.currentProvidersMap.size === 0 && !isPlayerActive(ctx)) {
        showEmpty(ctx, Lampa.Lang.translate('uafilms_error'));
      }
    }
  );
}
