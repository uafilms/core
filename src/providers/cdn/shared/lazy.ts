/**
 * Побудова lazy-посилання на наш проксі: `/master.m3u8?cdn=<cdn>&...`.
 * Порожні значення пропускаються.
 */
export function buildLazyMasterUrl(
  cdn: string,
  params: Record<string, string | number | undefined | null> = {},
): string {
  const search = new URLSearchParams();
  search.set('cdn', cdn);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  return `/master.m3u8?${search.toString()}`;
}
