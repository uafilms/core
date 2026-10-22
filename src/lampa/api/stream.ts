import type { OmssProviderItem } from '../types/index.js';
import { requestJson } from '../utils/index.js';

export function streamOmssSources(
  url: string,
  onProvider: (chunk: OmssProviderItem) => void,
  onComplete: () => void,
  onError: (err: any) => void
): () => void {
  // Use EventSource if available in environment
  if (typeof EventSource !== 'undefined') {
    let closed = false;
    const es = new EventSource(url);

    es.addEventListener('provider', (event: any) => {
      if (closed) return;
      try {
        const chunk = JSON.parse(event.data);
        onProvider(chunk);
      } catch (e) {
        console.error('[UAFilms SSE] Parse error:', e);
      }
    });

    es.addEventListener('complete', () => {
      if (closed) return;
      closed = true;
      es.close();
      onComplete();
    });

    es.addEventListener('error', (err) => {
      if (closed) return;
      closed = true;
      es.close();
      onError(err);
    });

    return () => {
      closed = true;
      es.close();
    };
  }

  // Fallback to fetch / XHR if EventSource is unavailable
  let cancelled = false;
  requestJson<any>(url)
    .then((res) => {
      if (cancelled) return;
      if (res && res.providers && Array.isArray(res.providers)) {
        res.providers.forEach((p: any) => onProvider(p));
      } else if (res && res.sources && Array.isArray(res.sources)) {
        onProvider({
          provider: 'default',
          name: 'UAFilms',
          sources: res.sources,
          subtitles: res.subtitles || [],
        });
      }
      onComplete();
    })
    .catch((err) => {
      if (!cancelled) onError(err);
    });

  return () => {
    cancelled = true;
  };
}
