import { UAFilmsComponent } from '../component/index.js';
import { isAntiScamNoticeViewed, showAntiScamNotice } from './anti-scam.js';

declare const Lampa: any;

export function openUAFilms(movie: any) {
  if (!movie) return;
  if (!isAntiScamNoticeViewed()) {
    showAntiScamNotice(() => {
      openUAFilms(movie);
    });
    return;
  }
  Lampa.Component.add('uafilms', UAFilmsComponent);
  Lampa.Activity.push({
    url: '',
    title: 'UAFilms',
    component: 'uafilms',
    movie: movie,
    search: movie.title || movie.name,
    page: 1,
  });
}

export function registerManifest(): void {
  const manifest = {
    type: 'video',
    version: '1.0.0',
    name: 'UAFilms',
    description: 'Українські онлайн кінотеатри (UaKino, KinoUkr, Eneyida, Franko та ін.)',
    component: 'uafilms',
    onContextMenu: (_object: any) => ({
      name: 'UAFilms',
      description: Lampa.Lang.translate('uafilms_watch'),
    }),
    onContextLauch: (object: any) => {
      openUAFilms(object);
    },
  };

  try {
    let plugins = Lampa.Manifest.plugins || [];
    if (!Array.isArray(plugins)) plugins = [plugins];
    const exists = plugins.some((p: any) => p && p.component === manifest.component);
    if (!exists) {
      plugins.push(manifest);
    }
    Lampa.Manifest.plugins = plugins;
  } catch {
    // Ignore manifest errors
  }
}
