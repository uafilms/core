import videojs from 'video.js';

export function registerPlayerButtons() {
  const Button = videojs.getComponent('Button');
  if (!Button) return;

  // Register custom Next Episode button once
  if (!videojs.getComponent('BeerNextButton')) {
    class BeerNextButton extends Button {
      constructor(player, options) {
        super(player, options);
        this.addClass('vjs-next-btn');
        this.controlText('Наступна серія');
      }
      handleClick(event) {
        super.handleClick(event);
        this.player_.trigger('nextEpisodeTrigger');
      }
      createEl() {
        const el = super.createEl();
        const placeholder = el.querySelector('.vjs-icon-placeholder');
        if (placeholder) placeholder.remove();
        const icon = videojs.dom.createEl('span', {
          className: 'material-symbols-rounded',
          innerHTML: 'skip_next',
        }, {
          'aria-hidden': 'true',
          style: 'pointer-events:none;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;',
        });
        el.appendChild(icon);
        return el;
      }
    }
    videojs.registerComponent('BeerNextButton', BeerNextButton);
  }

  // Register custom Settings button once
  if (!videojs.getComponent('BeerSettingsButton')) {
    class BeerSettingsButton extends Button {
      constructor(player, options) {
        super(player, options);
        this.addClass('vjs-settings-btn');
        this.controlText('Налаштування');
      }
      handleClick(event) {
        super.handleClick(event);
        this.player_.trigger('toggleSettings');
      }
      createEl() {
        const el = super.createEl();
        const placeholder = el.querySelector('.vjs-icon-placeholder');
        if (placeholder) placeholder.remove();
        const icon = videojs.dom.createEl('span', {
          className: 'material-symbols-rounded',
          innerHTML: 'settings',
        }, {
          'aria-hidden': 'true',
          style: 'pointer-events:none;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;',
        });
        el.appendChild(icon);
        return el;
      }
    }
    videojs.registerComponent('BeerSettingsButton', BeerSettingsButton);
  }
}
