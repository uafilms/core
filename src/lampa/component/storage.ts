import type { ComponentContext } from './types.js';

declare const Lampa: any;

export function getSavedChoice(ctx: ComponentContext): { season: number; provider: string } {
  try {
    const data = Lampa.Storage.cache('uafilms_choice', 3000, {});
    const saved = data[ctx.movie.id || ctx.movie.imdb_id || ctx.movie.title || ''] || {};
    const globalSaved = Lampa.Storage.get('uafilms_balanser', '');
    return {
      season: saved.season || 1,
      provider: saved.provider || globalSaved || '',
    };
  } catch {
    return { season: 1, provider: '' };
  }
}

export function saveChoice(ctx: ComponentContext, choice: { season?: number; provider?: string }): void {
  try {
    const data = Lampa.Storage.cache('uafilms_choice', 3000, {});
    const key = ctx.movie.id || ctx.movie.imdb_id || ctx.movie.title || '';
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
