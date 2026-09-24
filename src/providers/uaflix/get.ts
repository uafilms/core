import * as cheerio from 'cheerio';
import { httpRequest, getHtml } from '../../utils/http.js';
import { extractVod } from '../../vods/index.js';
import { searchUaflix } from './search.js';
import { sortSeasons, sortSources } from '../../utils/sort.js';
import type {
  ProviderResult,
  SearchResult,
  StreamSource,
  Season,
  Episode,
  MediaType,
  ProviderGetOptions,
} from '../../types/index.js';

const BASE_URL = 'https://uafix.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface PlayerTab {
  label: string;
  iframeSrc: string;
}

interface EpisodeLink {
  season: number;
  episode: number;
  url: string;
}

function extractPlayerTabs($: cheerio.CheerioAPI): PlayerTab[] {
  const tabs: PlayerTab[] = [];
  const labels: string[] = [];

  $('.tabs-sel .tabs-link').each((_, el) => {
    labels.push($(el).text().trim());
  });

  const boxes = $('.tabs-b.video-box, .video-box');
  boxes.each((idx, el) => {
    let iframeSrc = $(el).find('iframe').attr('src');
    if (!iframeSrc) return;
    if (iframeSrc.startsWith('//')) {
      iframeSrc = 'https:' + iframeSrc;
    }
    // Ignore trailer / youtube / vimeo embeds
    if (iframeSrc.includes('youtube.com') || iframeSrc.includes('youtu.be') || iframeSrc.includes('vimeo.com')) {
      return;
    }
    const label = labels[idx] || `Плеєр ${idx + 1}`;
    tabs.push({ label, iframeSrc });
  });

  // Fallback: any iframe on page
  if (tabs.length === 0) {
    $('iframe').each((idx, el) => {
      let src = $(el).attr('src');
      if (!src) return;
      if (src.startsWith('//')) {
        src = 'https:' + src;
      }
      if (!src.includes('youtube.com') && !src.includes('youtu.be') && !src.includes('vimeo.com')) {
        tabs.push({ label: `Плеєр ${idx + 1}`, iframeSrc: src });
      }
    });
  }

  return tabs;
}

function extractEpisodeLinks($: cheerio.CheerioAPI, pageUrl: string): EpisodeLink[] {
  const seen = new Set<string>();
  const epLinks: EpisodeLink[] = [];

  $('a[href*="-episode-"], a.vi-img, .videos-list a, .one-s a').each((_, el) => {
    const rawHref = $(el).attr('href');
    if (!rawHref) return;

    const fullUrl = rawHref.startsWith('http') ? rawHref : `${BASE_URL}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
    if (seen.has(fullUrl)) return;

    // Pattern: /season-(\d+)-episode-(\d+)/ or episode-(\d+)
    const match = fullUrl.match(/season-(\d+)-episode-(\d+)/i) || fullUrl.match(/episode-(\d+)/i);
    if (match) {
      seen.add(fullUrl);
      if (match.length >= 3) {
        epLinks.push({
          season: parseInt(match[1], 10),
          episode: parseInt(match[2], 10),
          url: fullUrl,
        });
      } else {
        epLinks.push({
          season: 1,
          episode: parseInt(match[1], 10),
          url: fullUrl,
        });
      }
    }
  });

  // Sort by season asc, episode asc
  epLinks.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
  return epLinks;
}

async function batchMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 5): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function getUaflix(
  target: SearchResult | string,
  options?: ProviderGetOptions
): Promise<ProviderResult | null> {
  let pageUrl = '';
  const meta = options?.meta;

  if (typeof target === 'object') {
    pageUrl = target.url || target.id;
  } else if (typeof target === 'string') {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      pageUrl = target;
    } else {
      pageUrl = `${BASE_URL}${target.startsWith('/') ? '' : '/'}${target}`;
    }
  }

  if (!pageUrl && meta?.title) {
    const results = await searchUaflix(meta.title, {
      signal: options?.signal,
      year: meta.year,
      type: meta.type,
    });
    if (results.length > 0) {
      pageUrl = results[0].url || results[0].id;
    }
  }

  if (!pageUrl) return null;

  try {
    const mainHtml = await getHtml(pageUrl, {
      signal: options?.signal,
      headers: {
        'Referer': `${BASE_URL}/`,
        'User-Agent': UA,
      },
    });

    if (!mainHtml || typeof mainHtml !== 'string') return null;

    const $ = cheerio.load(mainHtml);

    const isSerial = pageUrl.includes('/serials/') || meta?.type === 'tv';
    const episodeLinks = extractEpisodeLinks($, pageUrl);

    // Case 1: Serial with episode links on main page (e.g. pervorodnij-grih-takopi or venzdej)
    if (isSerial && episodeLinks.length > 0) {
      const targetSeason = meta?.season;
      const targetEpisode = meta?.episode;

      // Determine initial episode to probe
      let probeLink = episodeLinks[0];
      if (targetSeason !== undefined && targetEpisode !== undefined) {
        const found = episodeLinks.find(l => l.season === targetSeason && l.episode === targetEpisode);
        if (found) probeLink = found;
      }

      const probeHtml = await getHtml(probeLink.url, {
        signal: options?.signal,
        headers: {
          'Referer': pageUrl,
          'User-Agent': UA,
        },
      });

      const $probe = cheerio.load(probeHtml);
      const probeTabs = extractPlayerTabs($probe);

      // Check if probe episode iframe points to full serial playlist (e.g. ashdi.vip/serial/... or zetvideo.net/serial/...)
      for (const tab of probeTabs) {
        if (tab.iframeSrc.includes('/serial/')) {
          const serialVod = await extractVod(tab.iframeSrc, {
            referer: probeLink.url,
            signal: options?.signal,
          });

          if (serialVod?.seasons && serialVod.seasons.length > 0) {
            return {
              provider: 'uaflix',
              type: 'tv',
              seasons: serialVod.seasons,
            };
          }
        }
      }

      // If probe did not return full serial, episodes are individual VOD pages (e.g. venzdej with zetvideo /vod/)
      // If specific season & episode requested by orchestrator:
      if (targetSeason !== undefined && targetEpisode !== undefined) {
        const epSources: StreamSource[] = [];
        for (const tab of probeTabs) {
          const res = await extractVod(tab.iframeSrc, {
            referer: probeLink.url,
            signal: options?.signal,
          });
          if (res?.sources) {
            for (const s of res.sources) {
              epSources.push({
                ...s,
                title: tab.label !== 'Плеєр 1' && tab.label !== 'Дивитись онлайн' ? `${tab.label} (${s.title})` : s.title,
              });
            }
          }
        }

        // Build season array with all known episodes, placing extracted sources in the target episode
        const seasonsMap = new Map<number, Episode[]>();
        for (const link of episodeLinks) {
          if (!seasonsMap.has(link.season)) seasonsMap.set(link.season, []);
          const epList = seasonsMap.get(link.season)!;
          if (link.season === targetSeason && link.episode === targetEpisode) {
            epList.push({
              episode: link.episode,
              sources: sortSources(epSources),
            });
          } else {
            epList.push({
              episode: link.episode,
              sources: [],
            });
          }
        }

        const seasons: Season[] = [];
        for (const [seasonNum, episodes] of seasonsMap.entries()) {
          seasons.push({ season: seasonNum, episodes });
        }

        return {
          provider: 'uaflix',
          type: 'tv',
          seasons: sortSeasons(seasons),
        };
      }

      // If no specific episode requested and list is manageable (<= 30 episodes), fetch all in parallel
      const toFetch = episodeLinks.slice(0, 30);
      const fetchedEpisodes = await batchMap(toFetch, async (link) => {
        try {
          const html = link.url === probeLink.url ? probeHtml : await getHtml(link.url, {
            signal: options?.signal,
            headers: { 'Referer': pageUrl, 'User-Agent': UA },
          });

          const $ep = cheerio.load(html);
          const tabs = extractPlayerTabs($ep);
          const epSources: StreamSource[] = [];

          for (const tab of tabs) {
            const res = await extractVod(tab.iframeSrc, {
              referer: link.url,
              signal: options?.signal,
            });
            if (res?.sources) {
              for (const s of res.sources) {
                epSources.push({
                  ...s,
                  title: tab.label !== 'Плеєр 1' && tab.label !== 'Дивитись онлайн' ? `${tab.label} (${s.title})` : s.title,
                });
              }
            }
          }

          return { season: link.season, episode: link.episode, sources: sortSources(epSources) };
        } catch {
          return { season: link.season, episode: link.episode, sources: [] };
        }
      }, 5);

      const seasonsMap = new Map<number, Episode[]>();
      for (const item of fetchedEpisodes) {
        if (!seasonsMap.has(item.season)) seasonsMap.set(item.season, []);
        seasonsMap.get(item.season)!.push({
          episode: item.episode,
          sources: item.sources,
        });
      }

      const seasons: Season[] = [];
      for (const [seasonNum, episodes] of seasonsMap.entries()) {
        seasons.push({ season: seasonNum, episodes });
      }

      return {
        provider: 'uaflix',
        type: 'tv',
        seasons: sortSeasons(seasons),
      };
    }

    // Case 2: Direct player tabs on main page (movies or serials with embedded multi-episode player)
    const playerTabs = extractPlayerTabs($);
    if (playerTabs.length === 0) {
      return null;
    }

    const allSources: StreamSource[] = [];
    let discoveredSeasons: Season[] | undefined;

    for (const tab of playerTabs) {
      const vodResult = await extractVod(tab.iframeSrc, {
        referer: pageUrl,
        signal: options?.signal,
      });

      if (!vodResult) continue;

      if (vodResult.seasons && vodResult.seasons.length > 0) {
        discoveredSeasons = vodResult.seasons;
        break;
      }

      if (vodResult.sources && vodResult.sources.length > 0) {
        for (const s of vodResult.sources) {
          allSources.push({
            ...s,
            title: tab.label !== 'Плеєр 1' && tab.label !== 'Дивитись онлайн' ? `${tab.label} (${s.title})` : s.title,
          });
        }
      }
    }

    if (discoveredSeasons && discoveredSeasons.length > 0) {
      return {
        provider: 'uaflix',
        type: 'tv',
        seasons: sortSeasons(discoveredSeasons),
      };
    }

    if (allSources.length > 0) {
      return {
        provider: 'uaflix',
        type: isSerial ? 'tv' : 'movie',
        sources: sortSources(allSources),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export const get = getUaflix;
