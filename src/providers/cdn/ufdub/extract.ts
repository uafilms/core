import type { Episode, Season, StreamSource } from '../../../types/media.js';
import type { VodExtractionResult } from '../../../types/vod.js';
import { sortSeasons } from '../../../utils/sort.js';
import { UFDUB_ARRAY_ITEM_RE } from './config.js';

export function parseEpisodeNumber(title: string, indexFallback: number): number {
  const bracketMatch = title.match(/\[0*(\d+)\]/);
  if (bracketMatch) return parseInt(bracketMatch[1], 10);

  const labeledMatch = title.match(/(?:серія|серiя|episode|ep|e)\s*0*(\d+)/i);
  if (labeledMatch) return parseInt(labeledMatch[1], 10);

  const prefixMatch = title.match(/^0*(\d+)\s*(?:серія|серiя|cерія|cерiя|\.|\b)/i);
  if (prefixMatch) return parseInt(prefixMatch[1], 10);

  const singleNumMatch = title.trim().match(/^0*(\d+)$/);
  if (singleNumMatch) return parseInt(singleNumMatch[1], 10);

  const anyNumMatch = title.match(/\b0*(\d+)\b/);
  if (anyNumMatch) return parseInt(anyNumMatch[1], 10);

  return indexFallback;
}

export function parseUfdubPlayerHtml(html: string): VodExtractionResult | null {
  if (!html) return null;

  const aMatch = html.match(/a\s*=\s*\[([\s\S]*?)\];/);
  if (!aMatch) return null;

  const arrayContent = aMatch[1];
  const items: Array<{ title: string; type: string; url: string }> = [];

  const regex = new RegExp(UFDUB_ARRAY_ITEM_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(arrayContent)) !== null) {
    const title = match[1]?.trim();
    const type = match[2]?.trim();
    let url = match[3]?.trim();
    if (!url) continue;
    if (url.startsWith('//')) url = `https:${url}`;
    items.push({ title, type, url });
  }

  if (items.length === 0) return null;

  // Single movie item
  if (items.length === 1 && !/\b(?:серія|серiя|episode|ep|e)\b/i.test(items[0].title)) {
    const item = items[0];
    return {
      sources: [{
        title: item.title || 'UFDUB',
        url: item.url,
        mime: 'video/mp4',
        lazy: {
          cdn: 'ufdub',
          type: 'vod',
          url: item.url,
          directUrl: item.url,
        },
      }],
    };
  }

  // Serial / episodes
  const episodes: Episode[] = [];
  items.forEach((item, idx) => {
    const epNum = parseEpisodeNumber(item.title, idx + 1);
    episodes.push({
      episode: epNum,
      title: item.title,
      sources: [{
        title: 'UFDUB',
        url: item.url,
        mime: 'video/mp4',
        lazy: {
          cdn: 'ufdub',
          type: 'vod',
          url: item.url,
          directUrl: item.url,
        },
      }],
    });
  });

  episodes.sort((a, b) => a.episode - b.episode);

  return {
    seasons: sortSeasons([
      {
        season: 1,
        episodes,
      },
    ]),
  };
}
