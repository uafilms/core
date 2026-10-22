declare const Lampa: any;

export function getAuthHeadersAndParams(): {
  headers: Record<string, string>;
  params: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const params: Record<string, string> = {};

  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const apiKey = Lampa.Storage.get('uafilms_api_key', '');
      if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
        headers['x-api-key'] = apiKey.trim();
        params['api_key'] = apiKey.trim();
      }
    }
  } catch {
    // Ignore storage read error
  }

  return { headers, params };
}
