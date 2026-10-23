import type { OmssSourceItem } from '../types/index.js';
import { streamMovieSources } from '../api/index.js';
import {
  extractVoiceName,
  normalizeStreamUrl,
  withVoiceQuery,
} from '../utils/index.js';
import type { ComponentContext } from './types.js';
import {
  getMovieHashBehold,
  getMovieHashTimeline,
  isViewed,
  markViewed,
  unmarkViewed,
} from './storage.js';
import { favoriteCdnRank, updateBalancersTab } from './favorites.js';
import { resetList, showEmpty } from './empty.js';
import { showContextMenu } from './context-menu.js';
import { isPlayerActive } from './playback.js';

declare const Lampa: any;
declare const $: any;

export function renderActiveProviderSources(ctx: ComponentContext): void {
  if (isPlayerActive(ctx)) {
    return;
  }

  resetList(ctx);

  const providerItem =
    ctx.state.currentProvidersMap.get(ctx.state.activeProvider) ||
    Array.from(ctx.state.currentProvidersMap.values())[0];

  if (!providerItem || !providerItem.sources || !providerItem.sources.length) {
    showEmpty(ctx, Lampa.Lang.translate('uafilms_not_found'));
    return;
  }

  const sources = providerItem.sources;
  const stillPath = ctx.movie.backdrop_path || ctx.movie.poster_path;

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

    const hashTimeline = getMovieHashTimeline(ctx.movie);
    const hashBehold = getMovieHashBehold(ctx.movie, providerItem.name, voiceName);

    const timeline =
      typeof Lampa !== 'undefined' && Lampa.Timeline && Lampa.Timeline.view
        ? Lampa.Timeline.view(
            hashTimeline,
            Lampa.Timeline.link ? Lampa.Timeline.link(ctx.movie) : undefined
          )
        : { percent: 0, time: 0, duration: 0, hash: hashTimeline };

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
      img.src =
        Lampa.TMDB && Lampa.TMDB.image
          ? Lampa.TMDB.image('t/p/w300' + stillPath)
          : `https://image.tmdb.org/t/p/w300${stillPath}`;
      ctx.state.currentImages.push(img);
    } else {
      loader.remove();
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
      markViewed(ctx, hashBehold);

      const playUrl = normalizeStreamUrl(effectiveUrl, ctx.host);
      const subTracks = (source.subtitles || providerItem.subtitles || []).map((sub: any) => ({
        ...sub,
        url: normalizeStreamUrl(sub.url, ctx.host),
      }));

      const availableTracks: string[] =
        source.audioTracks && source.audioTracks.length > 1
          ? source.audioTracks
          : displaySources.length > 1
          ? displaySources.map((d) => d.voiceName)
          : [];

      const moviePlayObj: any = {
        url: playUrl,
        title: `${ctx.movie.title || ctx.movie.name || ''} - ${voiceName}`,
        timeline,
        subtitles: subTracks,
        callback: () => {
          ctx.state.isPlaybackActive = false;
          markViewed(ctx, hashBehold);
          imgContainer.find('.online-prestige__viewed, .torrent-item__viewed').remove();
          imgContainer.append(
            '<div class="online-prestige__viewed">' +
              ((typeof Lampa !== 'undefined' && Lampa.Template && Lampa.Template.get)
                ? Lampa.Template.get('icon_viewed', {}, true)
                : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>') +
              '</div>'
          );
        },
      };

      if (availableTracks.length > 1) {
        moviePlayObj.translate = {
          tracks: availableTracks.map((name: string) => ({ name })),
        };
        moviePlayObj.voiceovers = availableTracks.map((trackName: string, idx: number) => {
          const matchedEntry = displaySources.find(
            (d) => d.voiceName.toLowerCase().trim() === trackName.toLowerCase().trim()
          );
          const trackUrl = matchedEntry
            ? normalizeStreamUrl(matchedEntry.playUrl, ctx.host)
            : source.sharedVideo
            ? withVoiceQuery(playUrl, trackName)
            : playUrl;
          return {
            title: trackName,
            selected: trackName.toLowerCase().trim() === voiceName.toLowerCase().trim(),
            index: idx,
            url: trackUrl,
          };
        });
      }

      try {
        Lampa.Player.play(moviePlayObj);
      } catch (err: any) {
        ctx.state.isPlaybackActive = false;
        if (typeof Lampa !== 'undefined' && Lampa.Noty && Lampa.Noty.show) {
          Lampa.Noty.show(`UAFilms: ${(err && err.message) || 'Помилка запуску плеєра'}`);
        }
      }
    };

    itemHtml.on('hover:enter', playCurrent);

    showContextMenu(ctx, {
      html: itemHtml,
      streamUrl: normalizeStreamUrl(effectiveUrl, ctx.host),
      hashBehold,
      timeline,
      onPlay: playCurrent,
      onClearWatched: () => {
        unmarkViewed(hashBehold);
        imgContainer.find('.online-prestige__viewed, .torrent-item__viewed').remove();
      },
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

      // Auto-upgrade to higher-ranked favorite CDN if user has not manually selected provider
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
