import type { ComponentContext } from './types.js';
import { hashString } from '../utils/index.js';

declare const Lampa: any;

export interface SavedChoice {
  season?: number;
  provider?: string;
  voice?: string;
  episode?: number;
}

export function getEpisodeCardKey(movie: any): string {
  return movie.original_title || movie.original_name || movie.title || movie.name || '';
}

export function getEpisodeHashTimeline(movie: any, season: number, episode: number): string {
  const cardKey = getEpisodeCardKey(movie);
  const key = [season, season > 10 ? ':' : '', episode, cardKey].join('');
  return (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.hash === 'function')
    ? Lampa.Utils.hash(key)
    : hashString(key);
}

export function getEpisodeHashBehold(movie: any, season: number, episode: number): string {
  const cardKey = getEpisodeCardKey(movie);
  const key = [season, season > 10 ? ':' : '', episode, cardKey, 'uafilms'].join('');
  return (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.hash === 'function')
    ? Lampa.Utils.hash(key)
    : hashString(key);
}

export function getMovieHashTimeline(movie: any): string {
  const cardKey = getEpisodeCardKey(movie);
  return (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.hash === 'function')
    ? Lampa.Utils.hash(cardKey)
    : hashString(cardKey);
}

export function getMovieHashBehold(movie: any, provider?: string, voice?: string): string {
  const cardKey = getEpisodeCardKey(movie);
  const key = `${cardKey}_${provider || ''}_${voice || ''}_uafilms`;
  return (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.hash === 'function')
    ? Lampa.Utils.hash(key)
    : hashString(key);
}

export function getSavedChoice(ctx: ComponentContext): { season: number; provider: string; voice: string } {
  try {
    const data = Lampa.Storage.cache('uafilms_choice', 3000, {});
    const key = ctx.movie.id || ctx.movie.imdb_id || ctx.movie.title || ctx.movie.name || '';
    const saved = data[key] || {};
    const globalSaved = Lampa.Storage.get('uafilms_balanser', '');
    return {
      season: saved.season || 1,
      provider: saved.provider || globalSaved || '',
      voice: saved.voice || '',
    };
  } catch {
    return { season: 1, provider: '', voice: '' };
  }
}

export function saveChoice(
  ctx: ComponentContext,
  choice: { season?: number; provider?: string; voice?: string }
): void {
  try {
    const data = Lampa.Storage.cache('uafilms_choice', 3000, {});
    const key = ctx.movie.id || ctx.movie.imdb_id || ctx.movie.title || ctx.movie.name || '';
    data[key] = { ...(data[key] || {}), ...choice };
    Lampa.Storage.set('uafilms_choice', data);

    if (choice.provider) {
      Lampa.Storage.set('uafilms_balanser', choice.provider);
    }
  } catch {
    // Ignore
  }
}

export function markViewed(ctx: ComponentContext, hashBehold: string, season?: number, episode?: number): void {
  try {
    const viewed = Lampa.Storage.cache('online_view', 5000, []);
    if (viewed.indexOf(hashBehold) === -1) {
      viewed.push(hashBehold);
      Lampa.Storage.set('online_view', viewed);
    }
    if (ctx.isTv && season && episode) {
      saveChoice(ctx, { season });
    }
  } catch {
    // Ignore
  }
}

export function unmarkViewed(hashBehold: string): void {
  try {
    const viewed = Lampa.Storage.cache('online_view', 5000, []);
    const idx = viewed.indexOf(hashBehold);
    if (idx !== -1) {
      viewed.splice(idx, 1);
      Lampa.Storage.set('online_view', viewed);
    }
  } catch {
    // Ignore
  }
}

export function isViewed(hashBehold: string): boolean {
  try {
    const viewed = Lampa.Storage.cache('online_view', 5000, []);
    return viewed.indexOf(hashBehold) !== -1;
  } catch {
    return false;
  }
}
