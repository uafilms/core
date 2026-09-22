export function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbStr(r, g, b) { return `${r}, ${g}, ${b}`; }

function lighten(r, g, b, f) {
  return { r: Math.round(r + (255 - r) * f), g: Math.round(g + (255 - g) * f), b: Math.round(b + (255 - b) * f) };
}

function darken(r, g, b, f) {
  return { r: Math.round(r * (1 - f)), g: Math.round(g * (1 - f)), b: Math.round(b * (1 - f)) };
}

function shiftHue(r, g, b, deg) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  h = (h || 0) * 360;
  h = (h + deg) % 360; h /= 360;
  let r2, g2, b2;
  if (s === 0) { r2 = g2 = b2 = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1/3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r2 * 255), g: Math.round(g2 * 255), b: Math.round(b2 * 255) };
}

function generateScheme(hex) {
  const { r, g, b } = hexToRgb(hex);
  const sec = shiftHue(r, g, b, 30);
  const ter = shiftHue(r, g, b, 60);
  const D = 0.93, M = 0.87, H = 0.78, B = 0.65;
  const lD = 0.92, lM = 0.82, lH = 0.72, lB = 0.55;

  return {
    '.mdui-theme-dark': {
      '--mdui-color-primary': rgbStr(...Object.values(lighten(r, g, b, 0.08))),
      '--mdui-color-on-primary': '255, 255, 255',
      '--mdui-color-primary-container': rgbStr(...Object.values(darken(r, g, b, 0.6))),
      '--mdui-color-on-primary-container': rgbStr(...Object.values(lighten(r, g, b, 0.65))),
      '--mdui-color-secondary': rgbStr(sec.r, sec.g, sec.b),
      '--mdui-color-on-secondary': '255, 255, 255',
      '--mdui-color-secondary-container': rgbStr(...Object.values(darken(sec.r, sec.g, sec.b, 0.6))),
      '--mdui-color-on-secondary-container': rgbStr(...Object.values(lighten(sec.r, sec.g, sec.b, 0.55))),
      '--mdui-color-tertiary': rgbStr(ter.r, ter.g, ter.b),
      '--mdui-color-on-tertiary': '255, 255, 255',
      '--mdui-color-tertiary-container': rgbStr(...Object.values(darken(ter.r, ter.g, ter.b, 0.6))),
      '--mdui-color-on-tertiary-container': rgbStr(...Object.values(lighten(ter.r, ter.g, ter.b, 0.55))),
      '--mdui-color-surface': rgbStr(...Object.values(darken(r, g, b, D))),
      '--mdui-color-surface-dim': rgbStr(...Object.values(darken(r, g, b, D + 0.02))),
      '--mdui-color-surface-bright': rgbStr(...Object.values(darken(r, g, b, B))),
      '--mdui-color-surface-container-lowest': rgbStr(...Object.values(darken(r, g, b, D + 0.04))),
      '--mdui-color-surface-container-low': rgbStr(...Object.values(darken(r, g, b, D - 0.02))),
      '--mdui-color-surface-container': rgbStr(...Object.values(darken(r, g, b, M))),
      '--mdui-color-surface-container-high': rgbStr(...Object.values(darken(r, g, b, H))),
      '--mdui-color-surface-container-highest': rgbStr(...Object.values(darken(r, g, b, H - 0.05))),
      '--mdui-color-on-surface': '227, 227, 227',
      '--mdui-color-on-surface-variant': '194, 194, 194',
      '--mdui-color-background': rgbStr(...Object.values(darken(r, g, b, D))),
      '--mdui-color-on-background': '227, 227, 227',
      '--mdui-color-outline': '142, 142, 142',
      '--mdui-color-outline-variant': '66, 66, 66',
      '--mdui-color-inverse-primary': rgbStr(r, g, b),
      '--mdui-color-inverse-surface': '227, 227, 227',
      '--mdui-color-inverse-on-surface': '18, 18, 18',
      '--mdui-color-error': '226, 21, 53',
      '--mdui-color-on-error': '255, 255, 255',
      '--mdui-color-error-container': '96, 0, 12',
      '--mdui-color-on-error-container': '255, 186, 177',
    },
    '.mdui-theme-light': {
      '--mdui-color-primary': rgbStr(...Object.values(darken(r, g, b, 0.08))),
      '--mdui-color-on-primary': '255, 255, 255',
      '--mdui-color-primary-container': rgbStr(...Object.values(lighten(r, g, b, lB))),
      '--mdui-color-on-primary-container': rgbStr(...Object.values(darken(r, g, b, 0.35))),
      '--mdui-color-secondary': rgbStr(...Object.values(darken(sec.r, sec.g, sec.b, 0.08))),
      '--mdui-color-on-secondary': '255, 255, 255',
      '--mdui-color-secondary-container': rgbStr(...Object.values(lighten(sec.r, sec.g, sec.b, lB))),
      '--mdui-color-on-secondary-container': rgbStr(...Object.values(darken(sec.r, sec.g, sec.b, 0.35))),
      '--mdui-color-tertiary': rgbStr(...Object.values(darken(ter.r, ter.g, ter.b, 0.08))),
      '--mdui-color-on-tertiary': '255, 255, 255',
      '--mdui-color-tertiary-container': rgbStr(...Object.values(lighten(ter.r, ter.g, ter.b, lB))),
      '--mdui-color-on-tertiary-container': rgbStr(...Object.values(darken(ter.r, ter.g, ter.b, 0.35))),
      '--mdui-color-surface': rgbStr(...Object.values(lighten(r, g, b, lD))),
      '--mdui-color-surface-dim': rgbStr(...Object.values(lighten(r, g, b, lD - 0.05))),
      '--mdui-color-surface-bright': rgbStr(...Object.values(lighten(r, g, b, lD + 0.05))),
      '--mdui-color-surface-container-lowest': rgbStr(...Object.values(lighten(r, g, b, lD + 0.04))),
      '--mdui-color-surface-container-low': rgbStr(...Object.values(lighten(r, g, b, lM))),
      '--mdui-color-surface-container': rgbStr(...Object.values(lighten(r, g, b, lM - 0.05))),
      '--mdui-color-surface-container-high': rgbStr(...Object.values(lighten(r, g, b, lH - 0.05))),
      '--mdui-color-surface-container-highest': rgbStr(...Object.values(lighten(r, g, b, lH - 0.1))),
      '--mdui-color-on-surface': '28, 28, 28',
      '--mdui-color-on-surface-variant': '66, 66, 66',
      '--mdui-color-background': rgbStr(...Object.values(lighten(r, g, b, lD))),
      '--mdui-color-on-background': '28, 28, 28',
      '--mdui-color-outline': '120, 120, 120',
      '--mdui-color-outline-variant': '194, 194, 194',
      '--mdui-color-inverse-primary': rgbStr(...Object.values(lighten(r, g, b, 0.08))),
      '--mdui-color-inverse-surface': '28, 28, 28',
      '--mdui-color-inverse-on-surface': '240, 240, 240',
      '--mdui-color-error': '179, 38, 30',
      '--mdui-color-on-error': '255, 255, 255',
      '--mdui-color-error-container': '255, 218, 214',
      '--mdui-color-on-error-container': '65, 0, 0',
    },
  };
}

export const PALETTES = {
  default: { name: 'Стандартна', hex: null },
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

export function applyPalette(paletteId, customHex) {
  if (paletteId === 'default') {
    document.getElementById('md-palette-style')?.remove();
    return;
  }
  const hex = paletteId === 'custom' ? customHex : PALETTES[paletteId]?.hex;
  if (!hex) return;
  document.getElementById('md-palette-style')?.remove();
  const scheme = generateScheme(hex);
  let css = '';
  for (const [selector, vars] of Object.entries(scheme)) {
    css += `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('')}}`;
  }
  const style = document.createElement('style');
  style.id = 'md-palette-style';
  style.textContent = css;
  document.head.appendChild(style);
}

export function applyPureDark(enabled) {
  const existing = document.getElementById('md-pure-dark-style');
  if (existing) existing.remove();
  if (!enabled) return;
  const css = '.mdui-theme-dark{--mdui-color-surface:0,0,0;--mdui-color-surface-dim:0,0,0;--mdui-color-surface-bright:18,18,18;--mdui-color-surface-container-lowest:0,0,0;--mdui-color-surface-container-low:8,8,8;--mdui-color-surface-container:12,12,12;--mdui-color-surface-container-high:18,18,18;--mdui-color-surface-container-highest:22,22,22;--mdui-color-surface-container-lowest:0,0,0;--mdui-color-background:0,0,0;--mdui-color-on-background:227,227,227;--mdui-color-on-surface:227,227,227;--mdui-color-outline:142,142,142;--mdui-color-outline-variant:48,48,48;--mdui-color-inverse-surface:227,227,227;--mdui-color-inverse-on-surface:0,0,0}';
  const style = document.createElement('style');
  style.id = 'md-pure-dark-style';
  style.textContent = css;
  document.head.appendChild(style);
}

export function initPalette() {
  const palette = localStorage.getItem('uafilms_palette') || 'default';
  const customColor = localStorage.getItem('uafilms_custom_color');
  const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
  applyPalette(palette, customColor || '#5B8DEF');
  applyPureDark(settings.pureDark || false);
}
