export const PALETTES = {
  default: { name: 'Стандартна', hex: '#6750A4' },
  blue:    { name: 'Синя',        hex: '#5B8DEF' },
  darkblue:{ name: 'Темно-синя',  hex: '#3F6BCA' },
  orange:  { name: 'Помаранчева', hex: '#F5923E' },
  green:   { name: 'Зелена',      hex: '#45A865' },
  purple:  { name: 'Фіолетова',   hex: '#B47CEC' },
  pink:    { name: 'Рожева',      hex: '#E96BAF' },
  red:     { name: 'Червона',     hex: '#E05858' },
  gray:    { name: 'Сіра',        hex: '#8A9199' },
  custom:  { name: 'Кастомна',    hex: null },
};

export async function applyPalette(paletteId, customHex) {
  const hex = paletteId === 'custom' ? customHex : PALETTES[paletteId]?.hex;
  if (!hex) {
    document.body.removeAttribute('style');
    return;
  }

  if (typeof window !== 'undefined' && typeof window.ui === 'function') {
    try {
      await window.ui('theme', hex);
    } catch (err) {
      console.warn('Failed to apply theme color:', err);
    }
  }
}

export function applyPureDark(enabled) {
  const existing = document.getElementById('beer-pure-dark-style');
  if (existing) existing.remove();
  if (!enabled) return;

  const css = `
    body.dark {
      --background: #000000 !important;
      --surface: #000000 !important;
      --surface-container-lowest: #000000 !important;
      --surface-container-low: #0a0a0a !important;
      --surface-container: #121212 !important;
      --surface-container-high: #1a1a1a !important;
      --surface-container-highest: #222222 !important;
    }
  `;
  const style = document.createElement('style');
  style.id = 'beer-pure-dark-style';
  style.textContent = css;
  document.head.appendChild(style);
}

export function initPalette() {
  const palette = localStorage.getItem('uafilms_palette') || 'default';
  const customColor = localStorage.getItem('uafilms_custom_color');
  const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');

  if (palette !== 'default') {
    applyPalette(palette, customColor || '#5B8DEF');
  }
  applyPureDark(settings.pureDark || false);
}
