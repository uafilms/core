declare const Lampa: any;

export function getHost(): string {
  // 1. User manual override in settings (if explicitly specified)
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const custom = Lampa.Storage.get('uafilms_custom_host', '');
      if (custom && typeof custom === 'string' && custom.trim().startsWith('http')) {
        return custom.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    // Ignore storage errors
  }

  // 2. Injected server host from backend /l handler (computed from actual HTTP Host header)
  if (typeof window !== 'undefined' && (window as any).__UAFILMS_SERVER_HOST__) {
    const injected = String((window as any).__UAFILMS_SERVER_HOST__).trim();
    if (injected.startsWith('http')) {
      return injected.replace(/\/+$/, '');
    }
  }

  // 3. Inspect document.currentScript
  try {
    if (typeof document !== 'undefined' && document.currentScript) {
      const src = (document.currentScript as HTMLScriptElement).src || '';
      const match = src.match(/^(https?:\/\/[^/]+)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch {
    // Ignore script inspection errors
  }

  // 4. Inspect Lampa plugin list from storage (where Lampa stores user-entered plugin URLs)
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const rawPlugins = Lampa.Storage.get('plugins', '[]');
      const list = typeof rawPlugins === 'string' ? JSON.parse(rawPlugins) : rawPlugins;
      if (Array.isArray(list)) {
        for (const item of list) {
          const u = typeof item === 'string' ? item : item && item.url;
          if (u && /(?:^|\/)(?:l|lampa)(?:\?|$|\/)/i.test(u)) {
            const match = String(u).match(/^(https?:\/\/[^/]+)/i);
            if (match && match[1]) {
              return match[1];
            }
          }
        }
      }
    }
  } catch {
    // Ignore storage plugins errors
  }

  // 5. Scan all script tags for /l or /lampa endpoint
  try {
    if (typeof document !== 'undefined' && document.getElementsByTagName) {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src || '';
        if (/(?:^|\/)(?:l|lampa)(?:\?|$)/i.test(src)) {
          const match = src.match(/^(https?:\/\/[^/]+)/i);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
    }
  } catch {
    // Ignore DOM scanning errors
  }

  // 6. Fallback to location.origin if valid
  try {
    if (typeof location !== 'undefined' && location.origin && location.origin !== 'null') {
      return location.origin;
    }
  } catch {
    // Ignore location errors
  }

  return '';
}
