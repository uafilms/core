import { getHost } from '../utils/index.js';

declare const Lampa: any;

export function initSettings(): void {
  if (typeof Lampa === 'undefined' || !Lampa.SettingsApi) return;

  try {
    if (Lampa.Params && Lampa.Params.select) {
      Lampa.Params.select('uafilms_custom_host', '', '');
      Lampa.Params.select('uafilms_api_key', '', '');
      Lampa.Params.select('uafilms_fav_cdns', '', '');
    }

    Lampa.SettingsApi.addComponent({
      component: 'uafilms',
      name: 'UAFilms',
      icon: '<svg height="36" viewBox="0 0 31 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0.557816 9.24832L29.4367 0.035822C30.033 -0.154392 30.6108 0.380053 30.4678 0.989283L23.505 30.6436C23.3493 31.3074 22.4888 31.4853 22.0783 30.9384L13.0188 18.8739C12.961 18.7969 12.89 18.7308 12.809 18.6788L0.371912 10.6918C-0.201881 10.3233 -0.0899653 9.45505 0.557816 9.24832Z" fill="white"/></svg>',
    });

    Lampa.Template.add(
      'settings_uafilms',
      `<div>
        <div class="settings-param selector" data-name="uafilms_custom_host" data-type="input" placeholder="https://...">
          <div class="settings-param__name">#{uafilms_server_url}</div>
          <div class="settings-param__value"></div>
          <div class="settings-param__descr">#{uafilms_server_descr}</div>
        </div>
        <div class="settings-param selector" data-name="uafilms_api_key" data-type="input" placeholder="uaf_...">
          <div class="settings-param__name">#{uafilms_api_key_title}</div>
          <div class="settings-param__value"></div>
          <div class="settings-param__descr">#{uafilms_api_key_descr}</div>
        </div>
        <div class="settings-param selector" data-name="uafilms_fav_cdns" data-type="input" placeholder="fenix, ashdi">
          <div class="settings-param__name">#{uafilms_fav_sources}</div>
          <div class="settings-param__value"></div>
          <div class="settings-param__descr">#{uafilms_fav_sources_descr}</div>
        </div>
      </div>`
    );

    if (Lampa.Settings && Lampa.Settings.listener) {
      Lampa.Settings.listener.follow('open', (e: any) => {
        if (e.name !== 'uafilms') return;
        const currentCustom = Lampa.Storage.get('uafilms_custom_host', '');
        const detected = getHost();
        e.body
          .find('[data-name="uafilms_custom_host"] .settings-param__value')
          .text(currentCustom || (detected ? `(${detected})` : ''));
        const currentApiKey = Lampa.Storage.get('uafilms_api_key', '');
        e.body
          .find('[data-name="uafilms_api_key"] .settings-param__value')
          .text(currentApiKey || '');
        const currentFavs = Lampa.Storage.get('uafilms_fav_cdns', 'fenix, ashdi');
        e.body
          .find('[data-name="uafilms_fav_cdns"] .settings-param__value')
          .text(currentFavs || 'fenix, ashdi');
      });
    }
  } catch {
    // Ignore settings errors on older Lampa versions
  }
}
