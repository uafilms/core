import { cardButtonHtml } from '../templates/index.js';
import { openUAFilms } from './manifest.js';

declare const Lampa: any;
declare const $: any;

export function addCardButton(render: any, movie: any): void {
  try {
    if (!render || !render.length || render.find('.view--uafilms').length) return;
    const btn = $(Lampa.Lang.translate(cardButtonHtml));
    btn.on('hover:enter', () => {
      openUAFilms(movie);
    });

    const buttons = render.find('.full-start__button').filter(function (this: any) {
      return !$(this).closest('.modal, .selectbox, .settings, .menu').length;
    });

    let anchor = buttons.filter('.view--torrent').first();
    if (!anchor.length) {
      anchor = buttons.filter('.view--online:not(.view--uafilms)').first();
    }
    if (!anchor.length) {
      anchor = buttons.not('.view--uafilms').first();
    }

    if (anchor.length) {
      anchor.after(btn);
    } else {
      const container = render.find('.full-start-new__buttons, .full-start__buttons');
      if (container.length) {
        container.append(btn);
      }
    }
  } catch {
    // Ignore DOM injection errors
  }
}

export function initCardButtonListener(): void {
  // Follow 'full' card view event
  Lampa.Listener.follow('full', (e: any) => {
    if (e.type === 'complite') {
      addCardButton(e.object.activity.render(), e.data.movie);
    }
  });

  // If a full card is already active upon plugin load, inject immediately
  try {
    const active = Lampa.Activity.active ? Lampa.Activity.active() : null;
    if (active && active.component === 'full') {
      const movie = active.card || active.movie;
      const render =
        active.activity && active.activity.render
          ? active.activity.render()
          : $('.full').last();
      addCardButton(render, movie);
    }
  } catch {
    // Ignore
  }
}
