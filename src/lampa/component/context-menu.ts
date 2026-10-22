import type { ComponentContext } from './types.js';
import { isViewed, markViewed, unmarkViewed } from './storage.js';

declare const Lampa: any;

export function showContextMenu(
  ctx: ComponentContext,
  params: {
    html: any;
    streamUrl?: string;
    hashBehold: string;
    timeline: any;
    onPlay: (player?: string) => void;
    onClearWatched: () => void;
  }
): void {
  params.html.on('hover:long', () => {
    const menu: any[] = [];

    if (Lampa.Platform && Lampa.Platform.is('webos')) {
      menu.push({
        title: `${Lampa.Lang.translate('player_lauch')} - WebOS`,
        player: 'webos',
      });
    }
    if (Lampa.Platform && Lampa.Platform.is('android')) {
      menu.push({
        title: `${Lampa.Lang.translate('player_lauch')} - Android`,
        player: 'android',
      });
    }
    menu.push({
      title: `${Lampa.Lang.translate('player_lauch')} - Lampa`,
      player: 'lampa',
    });

    menu.push({
      title: isViewed(params.hashBehold)
        ? Lampa.Lang.translate('torrent_parser_label_cancel_title')
        : Lampa.Lang.translate('torrent_parser_label_title'),
      toggleMark: true,
    });

    menu.push({
      title: Lampa.Lang.translate('uafilms_clear_timecode'),
      timeclear: true,
    });

    if (params.streamUrl) {
      menu.push({
        title: Lampa.Lang.translate('uafilms_copy_link'),
        copylink: true,
      });
    }

    Lampa.Select.show({
      title: Lampa.Lang.translate('title_action'),
      items: menu,
      onBack: () => {
        Lampa.Controller.toggle('content');
      },
      onSelect: (item: any) => {
        Lampa.Controller.toggle('content');

        if (item.player) {
          if (Lampa.Player.runas) Lampa.Player.runas(item.player);
          params.onPlay(item.player);
        } else if (item.toggleMark) {
          if (isViewed(params.hashBehold)) {
            unmarkViewed(params.hashBehold);
            params.html.find('.online-prestige__viewed, .torrent-item__viewed').remove();
          } else {
            markViewed(ctx, params.hashBehold);
            params.html
              .find('.online-prestige__img')
              .append(
                '<div class="online-prestige__viewed">' +
                  Lampa.Template.get('icon_viewed', {}, true) +
                  '</div>'
              );
          }
        } else if (item.timeclear) {
          if (params.timeline) {
            params.timeline.percent = 0;
            params.timeline.time = 0;
            params.timeline.duration = 0;
            if (Lampa.Timeline.update) Lampa.Timeline.update(params.timeline);
          }
        } else if (item.copylink && params.streamUrl) {
          if (Lampa.Utils.copyTextToClipboard) {
            Lampa.Utils.copyTextToClipboard(
              params.streamUrl,
              () => Lampa.Noty.show(Lampa.Lang.translate('uafilms_copy_success')),
              () => Lampa.Noty.show(Lampa.Lang.translate('copy_fail'))
            );
          }
        }
      },
    });
  });
}
