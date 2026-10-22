import type { ComponentContext } from './types.js';
import { renderTvEpisodes } from './episodes.js';

declare const Lampa: any;

function getNav() {
  return (
    (typeof window !== 'undefined' && (window as any).Navigator) ||
    (typeof Lampa !== 'undefined' && Lampa.Navigator) ||
    null
  );
}

export function setupController(ctx: ComponentContext): void {
  Lampa.Controller.add('content', {
    toggle: () => {
      Lampa.Controller.collectionSet(ctx.scroll.render(), ctx.files.render());
      Lampa.Controller.collectionFocus(ctx.state.lastFocusElement || false, ctx.scroll.render());
    },
    update: () => {},
    up: () => {
      const nav = getNav();
      if (nav && typeof nav.canmove === 'function' && nav.canmove('up')) {
        nav.move('up');
      } else {
        Lampa.Controller.toggle('head');
      }
    },
    down: () => {
      const nav = getNav();
      if (nav && typeof nav.move === 'function') {
        nav.move('down');
      }
    },
    right: () => {
      const nav = getNav();
      if (nav && typeof nav.canmove === 'function' && nav.canmove('right')) {
        nav.move('right');
      } else if (ctx.filter && ctx.filter.render().find('.filter--filter').length) {
        ctx.filter.render().find('.filter--filter').trigger('hover:enter');
      }
    },
    left: () => {
      const nav = getNav();
      if (nav && typeof nav.canmove === 'function' && nav.canmove('left')) {
        nav.move('left');
      } else if (ctx.files.toggle) {
        ctx.files.toggle();
      }
    },
    back: () => {
      if (ctx.isTv && ctx.state.viewMode === 'sources') {
        // Return to episodes list
        ctx.state.viewMode = 'episodes';
        renderTvEpisodes(ctx, ctx.state.seasonEpisodes);
        return;
      }
      Lampa.Activity.backward();
    },
  });

  Lampa.Controller.toggle('content');
}
