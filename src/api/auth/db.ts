import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

let dbInstance: Database.Database | null = null;

export function getAuthDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.AUTH_DB_PATH || path.resolve(process.cwd(), 'cache', 'auth.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS api_daily_stats (
      api_key_id TEXT NOT NULL,
      date TEXT NOT NULL,
      endpoint_group TEXT NOT NULL,
      status_2xx INTEGER DEFAULT 0,
      status_4xx INTEGER DEFAULT 0,
      status_5xx INTEGER DEFAULT 0,
      total_requests INTEGER DEFAULT 0,
      PRIMARY KEY (api_key_id, date, endpoint_group),
      FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_daily_stats_key_date ON api_daily_stats(api_key_id, date);

    CREATE TABLE IF NOT EXISTS api_recent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_recent_logs_key_time ON api_recent_logs(api_key_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'movie',
      title TEXT NOT NULL,
      poster_path TEXT,
      release_date TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, item_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);

    CREATE TABLE IF NOT EXISTS user_watch_progress (
      user_id TEXT NOT NULL,
      media_id TEXT NOT NULL,
      time INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title TEXT,
      poster TEXT,
      media_type TEXT,
      tmdb_id TEXT,
      season INTEGER,
      episode INTEGER,
      PRIMARY KEY (user_id, media_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_watch_progress_user_id ON user_watch_progress(user_id);

    CREATE TABLE IF NOT EXISTS user_sync_settings (
      user_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_collections (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id);

    CREATE TABLE IF NOT EXISTS user_collection_items (
      user_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, collection_id, item_id),
      FOREIGN KEY(user_id, collection_id) REFERENCES user_collections(user_id, id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_coll_items ON user_collection_items(user_id, collection_id);
  `);

  dbInstance = db;
  return dbInstance;
}
