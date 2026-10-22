declare const Lampa: any;

export function hashString(str: string): string {
  if (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.hash === 'function') {
    return Lampa.Utils.hash(str);
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function secondsToTime(secs: number): string {
  if (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.secondsToTime === 'function') {
    return Lampa.Utils.secondsToTime(secs, true);
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function formatFullDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Utils && typeof Lampa.Utils.parseTime === 'function') {
      const parsed = Lampa.Utils.parseTime(dateStr);
      if (parsed && parsed.full) {
        return parsed.full;
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  } catch {
    // Ignore date parse errors
  }
  return dateStr;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
