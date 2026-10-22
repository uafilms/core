import type { ComponentContext } from './types.js';

declare const Lampa: any;
declare const $: any;

export function clearImages(ctx: ComponentContext): void {
  ctx.state.currentImages.forEach((img) => {
    img.onload = null;
    img.onerror = null;
    img.src = '';
  });
  ctx.state.currentImages = [];
}

export function resetList(ctx: ComponentContext): void {
  ctx.state.lastFocusElement = null;
  clearImages(ctx);
  ctx.scroll.render().find('.uafilms-empty').remove();
  ctx.scroll.clear();
  if (typeof ctx.scroll.reset === 'function') {
    ctx.scroll.reset();
  }
}

export function showEmpty(ctx: ComponentContext, details?: string, backAction?: () => void): void {
  resetList(ctx);
  const html = $(
    Lampa.Template.get('uafilms_empty', {
      details: details || Lampa.Lang.translate('uafilms_not_found'),
    })
  );
  if (backAction) {
    const backBtn = $(
      `<div class="selector" style="margin-top: 1.5em; display: inline-block; padding: 0.8em 1.5em; background: rgba(255,255,255,0.1); border-radius: 0.3em; cursor: pointer;">
        ${Lampa.Lang.translate('uafilms_back_to_episodes')}
      </div>`
    );
    backBtn.on('hover:enter', backAction);
    html.append(backBtn);
  }
  ctx.scroll.append(html);
}
