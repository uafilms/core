import type { OmssProviderItem } from '../types/index.js';
import type { ComponentContext } from './types.js';
import { getSavedChoice } from './storage.js';

declare const Lampa: any;

export function getFavoriteCdns(): string[] {
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const custom = Lampa.Storage.get('uafilms_fav_cdns', '');
      if (custom && typeof custom === 'string' && custom.trim()) {
        return custom.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      }
    }
  } catch {
    // Ignore
  }
  return ['fenix', 'ashdi'];
}

export function favoriteCdnRank(idOrName?: string): number {
  if (!idOrName) return Number.POSITIVE_INFINITY;
  const clean = idOrName.toLowerCase();
  const favs = getFavoriteCdns();
  const index = favs.findIndex((f) => clean.includes(f));
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

export function sortProvidersWithFavorites(providers: OmssProviderItem[]): OmssProviderItem[] {
  return [...providers].sort((a, b) => {
    const rankA = favoriteCdnRank(a.provider || a.name);
    const rankB = favoriteCdnRank(b.provider || b.name);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name);
  });
}

export function updateBalancersTab(ctx: ComponentContext, providers: OmssProviderItem[]): void {
  if (!providers.length) {
    ctx.filter.set('sort', [
      {
        title: (typeof Lampa !== 'undefined' && Lampa.Lang && Lampa.Lang.translate('loading')) || 'Завантаження...',
        source: '',
        selected: true,
      },
    ]);
    ctx.filter.chosen('sort', [ctx.filterTranslate.source]);
    return;
  }

  const sorted = sortProvidersWithFavorites(providers);
  const cleanActive = (ctx.state.activeProvider || '').replace(/^★\s*/, '').toLowerCase().trim();

  const matchProvider = (target: string) => {
    const cleanTarget = target.replace(/^★\s*/, '').toLowerCase().trim();
    return sorted.find(
      (p) =>
        p.name.toLowerCase().trim() === cleanTarget ||
        (p.provider && p.provider.toLowerCase().trim() === cleanTarget)
    );
  };

  if (!ctx.state.userManuallySelectedProvider) {
    const saved = getSavedChoice(ctx).provider;
    const matchedSaved = saved ? matchProvider(saved) : undefined;
    if (matchedSaved) {
      ctx.state.activeProvider = matchedSaved.name;
    } else {
      ctx.state.activeProvider = sorted[0].name;
    }
  } else {
    const matched = matchProvider(cleanActive);
    if (matched) {
      ctx.state.activeProvider = matched.name;
    } else {
      ctx.state.activeProvider = sorted[0].name;
    }
  }

  ctx.filter.set(
    'sort',
    sorted.map((p) => {
      const isFav = favoriteCdnRank(p.provider || p.name) !== Number.POSITIVE_INFINITY;
      return {
        title: isFav ? `★ ${p.name}` : p.name,
        source: p.name,
        selected: p.name.toLowerCase().trim() === ctx.state.activeProvider.toLowerCase().trim(),
      };
    })
  );
  ctx.filter.chosen('sort', [ctx.state.activeProvider]);
}
