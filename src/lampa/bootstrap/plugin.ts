import { initTranslations, initTemplates } from '../templates/index.js';
import { initSettings } from '../settings/index.js';
import { UAFilmsComponent } from '../component/index.js';
import { registerManifest } from './manifest.js';
import { initCardButtonListener } from './card-button.js';

declare const Lampa: any;

export function initUAFilmsPlugin(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__uafilms_plugin_initialized__) return;
  if (typeof Lampa === 'undefined' || !Lampa.Component || !Lampa.Listener) return;

  (window as any).__uafilms_plugin_initialized__ = true;

  initTranslations();
  initTemplates();
  initSettings();

  Lampa.Component.add('uafilms', UAFilmsComponent);

  registerManifest();
  initCardButtonListener();
}
