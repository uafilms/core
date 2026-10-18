import { UAKINO_AX_INTRO_SEGMENT_RE } from './config.js';

/**
 * Вирізає власне інтро uakino.ax з медіа-плейлиста.
 *
 * Плеєр цього сайту вклеює на початок потоку сегменти вигляду
 * `/intro/v2/<height>/intro0.ts` (перед ними стоїть #EXT-X-DISCONTINUITY,
 * який відділяє інтро від основного відео). Прибираємо і сегменти, і цей
 * роздільник, інакше у плеєрі лишається зайвий розрив таймлайну.
 */
export function stripUakinoAxIntro(playlist: string): string {
  const lines = playlist.split('\n');
  const out: string[] = [];
  let pendingTags: string[] = [];
  let skipNextDiscontinuity = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-DISCONTINUITY') && skipNextDiscontinuity) {
        skipNextDiscontinuity = false;
        pendingTags = [];
        continue;
      }
      if (line.startsWith('#EXTINF') || line.startsWith('#EXT-X-BYTERANGE') || line.startsWith('#EXT-X-PROGRAM-DATE-TIME')) {
        pendingTags.push(line);
        continue;
      }
      pendingTags = [];
      out.push(line);
      continue;
    }

    if (UAKINO_AX_INTRO_SEGMENT_RE.test(line)) {
      pendingTags = [];
      skipNextDiscontinuity = true;
      continue;
    }

    out.push(...pendingTags);
    pendingTags = [];
    out.push(line);
  }

  if (pendingTags.length > 0) out.push(...pendingTags);

  return out.join('\n');
}
