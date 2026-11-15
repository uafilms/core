/**
 * URLSearchParams replacement. Tizen 2.x/3.0 (Chromium 47) has no
 * URLSearchParams, and the plugin must run there.
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const parts: string[] = [];

  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null) return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  });

  return parts.join('&');
}
