import type { VodExtractor, VodExtractionOptions, VodExtractionResult } from '../../../types/vod.js';
import type { Season } from '../../../types/media.js';
import { parseTortugaEmbed, parseTortugaVod } from './extract.js';

export class TortugaVodExtractor implements VodExtractor {
  readonly name = 'tortuga';

  /**
   * Головний метод витягування потоків з Tortuga VOD / Embed сторінок
   */
  async extract(_url: string, _options: VodExtractionOptions = {}): Promise<VodExtractionResult | null> {
    // Tortuga CDN повністю відключений / не працює (404 на всіх VOD / embed)
    return null;
  }

  /**
   * Парсинг фільму (/vod/)
   */
  async parseVod(vodUrl: string, options: VodExtractionOptions = {}): Promise<{ file: string; poster?: string | null; subtitle?: string | null } | null> {
    return parseTortugaVod(vodUrl, options);
  }

  /**
   * Парсинг серіалу (/embed/)
   */
  async parseEmbed(embedUrl: string, options: VodExtractionOptions = {}): Promise<Season[] | null> {
    return parseTortugaEmbed(embedUrl, options);
  }
}

export const tortugaVod = new TortugaVodExtractor();
export * from './config.js';
export * from './extract.js';
export { decodeTortuga } from './decrypt.js';
