import { cssStyles } from './styles.js';
import { itemTemplate, movieItemTemplate, emptyTemplate } from './html.js';
import { initTranslations } from './translations.js';

declare const Lampa: any;
declare const $: any;

export { initTranslations } from './translations.js';
export { cardButtonHtml, itemTemplate, movieItemTemplate, emptyTemplate } from './html.js';
export { cssStyles } from './styles.js';

export function initTemplates(): void {
  if (typeof Lampa === 'undefined' || !Lampa.Template) return;

  // 1. CSS styles injection
  Lampa.Template.add('uafilms_css', cssStyles);

  if (typeof $ !== 'undefined') {
    $('body').append(Lampa.Template.get('uafilms_css', {}, true));
  }

  // 2. Full item template
  Lampa.Template.add('uafilms_item', itemTemplate);

  // 3. Simple list item template (for movie streams)
  Lampa.Template.add('uafilms_movie_item', movieItemTemplate);

  // 4. Empty template
  Lampa.Template.add('uafilms_empty', emptyTemplate);
}
