import fs from 'fs';
import path from 'path';
import https from 'https';
import axios from 'axios';
import Database from 'better-sqlite3';
import type { UakinoDbRow, UakinoParsedXfields, UakinoRawItem } from './types.js';
import { getUakinoCertificates } from './certs.js';

const API_HOST = 'https://api.uakino.app';
const DB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDbPath(): string {
  const cacheDir = path.resolve(process.cwd(), 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, 'uakino.db');
}

export function parseXfields(xf?: string): UakinoParsedXfields {
  const result: Record<string, string> = {};
  if (!xf) return {};

  const parts = xf.split('||');
  for (const part of parts) {
    const sepIndex = part.indexOf('|');
    if (sepIndex > 0) {
      const key = part.slice(0, sepIndex).trim();
      const val = part.slice(sepIndex + 1).trim();
      result[key] = val;
    }
  }

  const parsedYear = result.year ? parseInt(result.year, 10) : undefined;
  const parsedSeason = result.season ? parseInt(result.season, 10) : undefined;

  return {
    year: isNaN(parsedYear as number) ? undefined : parsedYear,
    origname: result.origname,
    imdb_all: result.imdb_all,
    imdb_id: result.imdb_id,
    imdb: result.imdb,
    kinopoisk_id: result.kinopoisk_id,
    poster: result.poster,
    ashdivip: result.ashdivip,
    playlist: result.playlist,
    season: isNaN(parsedSeason as number) ? undefined : parsedSeason,
    quality: result.quality,
    filmtranslation: result.filmtranslation,
  };
}

let dbInstance: Database.Database | null = null;
let initPromise: Promise<Database.Database> | null = null;

function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Register custom Unicode-aware search function for Ukrainian / Cyrillic
  db.function('ukr_includes', (text: unknown, q: unknown) => {
    if (typeof text !== 'string' || typeof q !== 'string') return 0;
    return text.toLowerCase().includes(q.toLowerCase()) ? 1 : 0;
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS uakino_items (
      id           INTEGER PRIMARY KEY,
      title        TEXT NOT NULL,
      origname     TEXT,
      year         INTEGER,
      imdb_id      TEXT,
      imdb_rating  TEXT,
      poster       TEXT,
      ashdivip     TEXT,
      playlist     TEXT,
      season       INTEGER,
      is_tv        INTEGER DEFAULT 0,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_uakino_imdb     ON uakino_items(imdb_id);
    CREATE INDEX IF NOT EXISTS idx_uakino_title    ON uakino_items(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_uakino_origname ON uakino_items(origname COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_uakino_year     ON uakino_items(year);
  `);

  return db;
}

const MIN_ROWS = 1000;

/** Opens an existing catalog file; returns null when it is missing or too small to be useful. */
function openExistingDb(dbPath: string): Database.Database | null {
  if (!fs.existsSync(dbPath)) return null;
  try {
    const db = createDatabase(dbPath);
    const row = db.prepare('SELECT COUNT(*) as count FROM uakino_items').get() as { count: number };
    if (row.count > MIN_ROWS) return db;
    db.close();
  } catch {
    // Corrupted or incompatible file - fall through to a fresh sync.
  }
  return null;
}

export async function getUakinoDb(forceSync = false): Promise<Database.Database> {
  if (dbInstance && !forceSync) {
    return dbInstance;
  }

  if (initPromise && !forceSync) {
    return initPromise;
  }

  initPromise = (async () => {
    const dbPath = getDbPath();
    const dbExists = fs.existsSync(dbPath);
    let isFresh = false;

    if (dbExists && !forceSync) {
      const stats = fs.statSync(dbPath);
      isFresh = Date.now() - stats.mtimeMs < DB_TTL_MS;
    }

    if (isFresh) {
      const fresh = openExistingDb(dbPath);
      if (fresh) {
        dbInstance = fresh;
        return fresh;
      }
    }

    // Sync database from UAKino REST API with dynamic certificates
    let certs = await getUakinoCertificates();
    let httpsAgent = new https.Agent({
      cert: certs.cert,
      key: certs.key,
    });

    let items: UakinoRawItem[] = [];
    try {
      const response = await axios.get<UakinoRawItem[]>(`${API_HOST}/api/v1/filter?limit=50000`, {
        httpsAgent,
        headers: { 'User-Agent': 'ktor-client' },
        timeout: 90000,
      });

      items = response.data;
      if (!Array.isArray(items)) {
        throw new Error('[UAKino] Failed to fetch catalog: invalid response');
      }
    } catch (error) {
      // If 403 Forbidden, certs might have expired or rotated -> re-download APK and retry!
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        console.warn('[UAKino] Received 403 from API. Downloading fresh APK to update certificates...');
        try {
          certs = await getUakinoCertificates(true);
          httpsAgent = new https.Agent({
            cert: certs.cert,
            key: certs.key,
          });

          const retryResponse = await axios.get<UakinoRawItem[]>(`${API_HOST}/api/v1/filter?limit=50000`, {
            httpsAgent,
            headers: { 'User-Agent': 'ktor-client' },
            timeout: 90000,
          });
          items = retryResponse.data;
        } catch (retryError) {
          console.warn(`[UAKino] Retry with freshly downloaded certificates failed: ${(retryError as Error).message}`);
        }
      }

      if (!items || !items.length) {
        // Fallback to cached database if network or API failed
        const cached = openExistingDb(dbPath);
        if (cached) {
          console.warn(`[UAKino] Catalog sync failed (${(error as Error).message}); using cached database`);
          dbInstance = cached;
          return cached;
        }
        throw error;
      }
    }

    const db = createDatabase(dbPath);
    const now = Date.now();

    const insert = db.prepare(`
      INSERT OR REPLACE INTO uakino_items (
        id, title, origname, year, imdb_id, imdb_rating, poster, ashdivip, playlist, season, is_tv, updated_at
      ) VALUES (
        @id, @title, @origname, @year, @imdb_id, @imdb_rating, @poster, @ashdivip, @playlist, @season, @is_tv, @updated_at
      )
    `);

    const syncTransaction = db.transaction((rawItems: UakinoRawItem[]) => {
      for (const item of rawItems) {
        const xf = parseXfields(item.xfields);
        const title = (item.title || '').trim();
        const origname = (xf.origname || '').trim() || null;
        const isTv = !xf.ashdivip && xf.playlist ? 1 : 0;

        insert.run({
          id: item.id,
          title,
          origname,
          year: xf.year ?? null,
          imdb_id: xf.imdb_id ? xf.imdb_id.trim() : null,
          imdb_rating: xf.imdb ?? null,
          poster: xf.poster ?? null,
          ashdivip: xf.ashdivip ?? null,
          playlist: xf.playlist ?? null,
          season: xf.season ?? null,
          is_tv: isTv,
          updated_at: now,
        });
      }
    });

    syncTransaction(items);
    dbInstance = db;
    return db;
  })();

  return initPromise;
}

export async function findByImdbId(imdbId: string): Promise<UakinoDbRow[]> {
  const db = await getUakinoDb();
  return db
    .prepare('SELECT * FROM uakino_items WHERE imdb_id = ? ORDER BY season ASC, id ASC')
    .all(imdbId.trim()) as UakinoDbRow[];
}

export async function findById(id: number): Promise<UakinoDbRow | null> {
  const db = await getUakinoDb();
  return (db.prepare('SELECT * FROM uakino_items WHERE id = ?').get(id) as UakinoDbRow) || null;
}

export async function searchTitles(query: string, year?: number, limit = 20): Promise<UakinoDbRow[]> {
  const db = await getUakinoDb();
  const clean = query.trim();

  if (year) {
    return db
      .prepare(`
        SELECT * FROM uakino_items 
        WHERE (ukr_includes(title, ?) = 1 OR ukr_includes(origname, ?) = 1)
          AND year BETWEEN ? AND ?
        LIMIT ?
      `)
      .all(clean, clean, year - 1, year + 1, limit) as UakinoDbRow[];
  }

  return db
    .prepare(`
      SELECT * FROM uakino_items 
      WHERE ukr_includes(title, ?) = 1 OR ukr_includes(origname, ?) = 1
      LIMIT ?
    `)
    .all(clean, clean, limit) as UakinoDbRow[];
}
