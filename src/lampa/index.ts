/**
 * UAFilms Plugin for Lampa
 *
 * Entry point compiled into standalone browser bundle served at {host}/l
 */

import { initUAFilmsPlugin } from './bootstrap/index.js';

export * from './types/index.js';
export * from './bootstrap/index.js';
export * from './component/index.js';
export * from './api/index.js';
export * from './pow/index.js';
export * from './cache/index.js';
export * from './utils/index.js';
export * from './settings/index.js';
export * from './templates/index.js';

declare const Lampa: any;

// Bootstrap wrapper
(function () {
  if (typeof window === 'undefined') return;
  if ((window as any).__uafilms_plugin_installed__) return;
  (window as any).__uafilms_plugin_installed__ = true;

  if ((window as any).appready) {
    initUAFilmsPlugin();
  } else {
    if (typeof Lampa !== 'undefined' && Lampa.Listener) {
      Lampa.Listener.follow('app', (e: any) => {
        if (e.type === 'ready') initUAFilmsPlugin();
      });
    }
    let retries = 0;
    const timer = setInterval(() => {
      retries++;
      if (typeof Lampa !== 'undefined' && Lampa.Component && Lampa.Activity) {
        clearInterval(timer);
        initUAFilmsPlugin();
      } else if (retries >= 35) {
        clearInterval(timer);
      }
    }, 200);
  }
})();
