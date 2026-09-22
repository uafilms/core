import type { Season, StreamSource } from '../../types/media.js';

export interface BambooPlaylistItem {
  title?: string;
  file?: string;
  folder?: BambooPlaylistItem[];
}

export interface ParseBambooResult {
  sources?: StreamSource[];
  seasons?: Season[];
}

/**
 * Checks if a file entry is a placeholder or paywalled sponsor video.
 */
export function isBambooSponsorFile(fileUrl?: string): boolean {
  if (!fileUrl) return true;
  const lower = fileUrl.toLowerCase();
  return (
    lower.includes('be_sponsors.mp4') ||
    lower.includes('/uploads/be_sponsors') ||
    !lower.startsWith('http') ||
    (!lower.includes('.m3u8') && !lower.includes('.mp4') && !lower.includes('.webm'))
  );
}

/**
 * Cleans audio studio or translation title.
 */
export function cleanBambooTitle(title?: string): string {
  if (!title) return 'Original';
  return title
    .replace(/\s*\(для підписників\)/gi, '')
    .replace(/\s*\(для спонсорів\)/gi, '')
    .trim() || 'Original';
}

/**
 * Parses BambooUA playlist tree into sorted StreamSource[] or Season[].
 */
export function parseBambooPlaylist(rawPlaylist: BambooPlaylistItem[]): ParseBambooResult {
  const movieSources: StreamSource[] = [];
  const seasonMap = new Map<number, Map<number, StreamSource[]>>();

  function walk(items: BambooPlaylistItem[], ctx: { season?: number; episode?: number; audio?: string }) {
    for (const item of items) {
      if (!item) continue;
      const title = item.title || '';
      const currentCtx = { ...ctx };

      const sMatch = title.match(/(?:season|сезон|s)\s*(\d+)/i) || title.match(/(\d+)\s*(?:season|сезон)/i);
      if (sMatch) currentCtx.season = parseInt(sMatch[1], 10);

      const eMatch = title.match(/(?:episode|серія|епізод|ep)\s*(\d+)/i) || title.match(/(\d+)\s*(?:episode|серія|епізод|ep)/i);
      if (eMatch) currentCtx.episode = parseInt(eMatch[1], 10);

      if (item.folder && Array.isArray(item.folder)) {
        if (!sMatch && !eMatch && title.trim()) {
          currentCtx.audio = cleanBambooTitle(title);
        }
        walk(item.folder, currentCtx);
      } else if (item.file && typeof item.file === 'string') {
        const fileUrl = item.file.trim();
        if (isBambooSponsorFile(fileUrl)) {
          continue;
        }

        // Try extracting season/episode from URL: /s(\d+)\/(\d+)\/
        const urlMatch = fileUrl.match(/\/s(\d+)\/(\d+)\//i);
        const seasonNum = currentCtx.season || (urlMatch ? parseInt(urlMatch[1], 10) : undefined);
        const epNum = currentCtx.episode || (urlMatch ? parseInt(urlMatch[2], 10) : undefined);
        const audioName = currentCtx.audio || cleanBambooTitle(title);

        const source: StreamSource = {
          title: audioName || 'Оригінал',
          quality: '1080p',
          url: fileUrl,
          audio: audioName,
          headers: {
            Referer: 'https://bambooua.com/',
            Origin: 'https://bambooua.com',
          },
          lazy: {
            cdn: 'bamboo',
            type: 'hls',
            id: fileUrl,
            url: `/master.m3u8?cdn=bamboo&url=${encodeURIComponent(fileUrl)}`,
          },
        };

        if (epNum != null) {
          const s = seasonNum || 1;
          if (!seasonMap.has(s)) seasonMap.set(s, new Map());
          const epMap = seasonMap.get(s)!;
          if (!epMap.has(epNum)) epMap.set(epNum, []);
          epMap.get(epNum)!.push(source);
        } else {
          movieSources.push(source);
        }
      }
    }
  }

  walk(rawPlaylist, {});

  if (seasonMap.size > 0) {
    const seasons: Season[] = Array.from(seasonMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sNum, epMap]) => ({
        season: sNum,
        episodes: Array.from(epMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([epNum, sources]) => ({
            episode: epNum,
            title: `Серія ${epNum}`,
            sources,
          })),
      }));
    return { seasons };
  }

  return { sources: movieSources };
}
