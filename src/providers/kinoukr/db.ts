import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { httpRequest } from '../../utils/http.js';
import { log, logWarn, logError } from '../../utils/logger.js';
import type { KinoUkrDbRow, KinoUkrJsonMap } from './types.js';

const JSON_URL = 'https://raw.githubusercontent.com/lampac-nextgen/lampac/refs/heads/main/Core/data/kinoukr.json';
const DB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let dbInstance: Database.Database | null = null;
let initPromise: Promise<Database.Database> | null = null;

function getDbPath(): string {
  const cacheDir = path.resolve(process.cwd(), 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, 'kinoukr.db');
}

function norm(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/ґ/g, 'г')
    .replace(/є/g, 'е');
}

function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.function('ukr_includes', (text: unknown, q: unknown) => {
    if (typeof text !== 'string' || typeof q !== 'string') return 0;
    return norm(text).includes(norm(q)) ? 1 : 0;
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS kinoukr_items (
      slug         TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      eng_name     TEXT,
      year         INTEGER,
      kp_id        TEXT,
      imdb_id      TEXT,
      ashdi        TEXT,
      tortuga      TEXT,
      is_tv        INTEGER DEFAULT 0,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kinoukr_imdb     ON kinoukr_items(imdb_id);
    CREATE INDEX IF NOT EXISTS idx_kinoukr_title    ON kinoukr_items(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_kinoukr_eng_name ON kinoukr_items(eng_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_kinoukr_year     ON kinoukr_items(year);
  `);

  return db;
}

export async function getKinoUkrDb(forceSync = false): Promise<Database.Database> {
  if (dbInstance && !forceSync) {
    return dbInstance;
  }

  if (initPromise && !forceSync) {
    return initPromise;
  }

  initPromise = (async () => {
    const dbPath = getDbPath();
    const db = createDatabase(dbPath);

    const now = Date.now();
    let shouldSync = forceSync;

    if (!shouldSync) {
      try {
        const row = db.prepare('SELECT COUNT(*) as count, MAX(updated_at) as last_update FROM kinoukr_items').get() as {
          count: number;
          last_update: number | null;
        };

        if (row.count === 0 || !row.last_update || (now - row.last_update > DB_TTL_MS)) {
          shouldSync = true;
        }
      } catch {
        shouldSync = true;
      }
    }

    if (shouldSync) {
      try {
        log('kinoukr', 'syncing database from lampac repository...');
        const res = await httpRequest<KinoUkrJsonMap>({
          url: JSON_URL,
          method: 'GET',
          timeout: 45000,
        });

        const data = res.data;
        if (data && typeof data === 'object') {
          const insert = db.prepare(`
            INSERT OR REPLACE INTO kinoukr_items (
              slug, title, eng_name, year, kp_id, imdb_id, ashdi, tortuga, is_tv, updated_at
            ) VALUES (
              @slug, @title, @eng_name, @year, @kp_id, @imdb_id, @ashdi, @tortuga, @is_tv, @updated_at
            )
          `);

          const syncTime = Date.now();
          const insertMany = db.transaction((entries: [string, any][]) => {
            for (const [slug, item] of entries) {
              const ashdi = (item.ashdi || '').trim();
              const tortuga = (item.tortuga || '').trim();
              const isTv = ashdi.includes('serial/') || tortuga.includes('embed/') ? 1 : 0;
              const parsedYear = item.year ? parseInt(item.year, 10) : null;

              insert.run({
                slug,
                title: (item.name || '').trim(),
                eng_name: (item.eng_name || '').trim(),
                year: isNaN(parsedYear as number) ? null : parsedYear,
                kp_id: item.kp_id || null,
                imdb_id: item.imdb_id || null,
                ashdi: ashdi || null,
                tortuga: tortuga || null,
                is_tv: isTv,
                updated_at: syncTime,
              });
            }
          });

          insertMany(Object.entries(data));
          const count = db.prepare('SELECT COUNT(*) as c FROM kinoukr_items').get() as { c: number };
          log('kinoukr', `synced ${count.c} items successfully`);
        }
      } catch (err: any) {
        logError('kinoukr', `failed to sync from lampac: ${err.message}`);
        // If DB already has data, continue running degraded
        const existingCount = (db.prepare('SELECT COUNT(*) as c FROM kinoukr_items').get() as { c: number }).c;
        if (existingCount === 0) {
          throw err;
        }
      }
    }

    dbInstance = db;
    return db;
  })();

  return initPromise;
}

export async function findByImdbId(imdbId: string): Promise<KinoUkrDbRow | null> {
  const db = await getKinoUkrDb();
  const row = db.prepare('SELECT * FROM kinoukr_items WHERE imdb_id = ? LIMIT 1').get(imdbId) as KinoUkrDbRow | undefined;
  return row || null;
}

export async function findBySlug(slug: string): Promise<KinoUkrDbRow | null> {
  const db = await getKinoUkrDb();
  const row = db.prepare('SELECT * FROM kinoukr_items WHERE slug = ? LIMIT 1').get(slug) as KinoUkrDbRow | undefined;
  return row || null;
}

export async function searchKinoUkrDbRows(query: string, year?: number, limit = 20): Promise<KinoUkrDbRow[]> {
  const db = await getKinoUkrDb();
  const cleanQ = query.trim();

  if (cleanQ.startsWith('tt')) {
    const byImdb = await findByImdbId(cleanQ);
    return byImdb ? [byImdb] : [];
  }

  if (year) {
    return db
      .prepare(`
        SELECT * FROM kinoukr_items 
        WHERE (ukr_includes(title, @query) = 1 OR ukr_includes(eng_name, @query) = 1)
          AND year = @year
        LIMIT @limit
      `)
      .all({ query: cleanQ, year, limit }) as KinoUkrDbRow[];
  }

  return db
    .prepare(`
      SELECT * FROM kinoukr_items 
      WHERE ukr_includes(title, @query) = 1 OR ukr_includes(eng_name, @query) = 1
      LIMIT @limit
    `)
    .all({ query: cleanQ, limit }) as KinoUkrDbRow[];
}
