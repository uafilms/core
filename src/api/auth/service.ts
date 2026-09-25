import crypto from 'crypto';
import { sign, verify } from 'hono/jwt';
import { getAuthDb } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'uafilms-auth-secret-key-change-in-prod';

export interface UserProfile {
  id: string;
  email: string;
  created_at: number;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
  total_requests: number;
}

export interface ApiUsageLog {
  id: number;
  key_prefix: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  timestamp: number;
}

export interface UserStats {
  totalRequests: number;
  requests24h: number;
  totalKeys: number;
  lastUsedAt: number | null;
  dailyUsage: Array<{ date: string; requests: number }>;
  endpointBreakdown: Array<{ endpoint: string; count: number }>;
  recentLogs: ApiUsageLog[];
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(key, 'hex'));
}

export function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export async function createAuthToken(user: { id: string; email: string }): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  return await sign({ sub: user.id, email: user.email, exp }, JWT_SECRET, 'HS256');
}

export async function verifyAuthToken(token: string): Promise<{ sub: string; email: string } | null> {
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    if (payload && payload.sub && payload.email) {
      return { sub: String(payload.sub), email: String(payload.email) };
    }
    return null;
  } catch {
    return null;
  }
}

export function isTrustedEmailDomain(email: string): boolean {
  const parts = (email || '').trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];

  const exact = new Set([
    'gmail.com',
    'googlemail.com',
    'ukr.net',
    'pm.me',
    'proton.me',
    'protonmail.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'ymail.com',
    'zoho.com',
  ]);

  if (exact.has(domain)) return true;

  if (/^(outlook|hotmail|live|msn)\.[a-z]{2,4}(\.[a-z]{2})?$/.test(domain)) return true;
  if (/^yahoo\.[a-z]{2,4}(\.[a-z]{2})?$/.test(domain)) return true;

  return false;
}

export async function registerUser(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Некоректний формат email');
  }
  if (!isTrustedEmailDomain(cleanEmail)) {
    throw new Error('Дозволені лише надійні поштові сервіси: Gmail, Outlook/Hotmail, Proton, Yahoo, iCloud, Ukr.net');
  }
  if (!password || password.length < 6) {
    throw new Error('Пароль має містити мінімум 6 символів');
  }

  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    throw new Error('Користувач із таким email вже зареєстрований');
  }

  const userId = crypto.randomUUID();
  const now = Date.now();
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, cleanEmail, passwordHash, now, now);

  const user: UserProfile = {
    id: userId,
    email: cleanEmail,
    created_at: now,
  };

  const token = await createAuthToken(user);
  return { user, token };
}

export async function loginUser(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const db = getAuthDb();
  const row = db.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?').get(cleanEmail) as {
    id: string;
    email: string;
    password_hash: string;
    created_at: number;
  } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error('Невірний email або пароль');
  }

  const user: UserProfile = {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
  };

  const token = await createAuthToken(user);
  return { user, token };
}

export function getUserById(id: string): UserProfile | null {
  const db = getAuthDb();
  const row = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(id) as UserProfile | undefined;
  return row || null;
}

export function changePassword(userId: string, currentPassword: string, newPassword: string): void {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Новий пароль має містити мінімум 6 символів');
  }
  const db = getAuthDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    throw new Error('Поточний пароль введено невірно');
  }
  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, Date.now(), userId);
}

export function deleteAccount(userId: string, password?: string): void {
  const db = getAuthDb();
  if (password) {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new Error('Пароль введено невірно');
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function createApiKey(userId: string, name: string): { key: ApiKeyItem; rawKey: string } {
  const cleanName = (name || '').trim() || 'Default Key';
  const db = getAuthDb();

  const id = crypto.randomUUID();
  const randomSuffix = crypto.randomBytes(20).toString('hex');
  const rawKey = `uaf_live_${randomSuffix}`;
  const keyHash = hashKey(rawKey);
  const prefix = `uaf_live_...${rawKey.slice(-4)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, userId, cleanName, keyHash, prefix, now);

  return {
    key: {
      id,
      name: cleanName,
      prefix,
      created_at: now,
      last_used_at: null,
      total_requests: 0,
    },
    rawKey,
  };
}

export function listUserApiKeys(userId: string): ApiKeyItem[] {
  const db = getAuthDb();
  const rows = db.prepare(`
    SELECT 
      k.id,
      k.name,
      k.prefix,
      k.created_at,
      k.last_used_at,
      COALESCE(SUM(s.total_requests), 0) as total_requests
    FROM api_keys k
    LEFT JOIN api_daily_stats s ON s.api_key_id = k.id
    WHERE k.user_id = ? AND k.is_active = 1
    GROUP BY k.id
    ORDER BY k.created_at DESC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    total_requests: Number(r.total_requests || 0),
  }));
}

export function revokeApiKey(userId: string, keyId: string): boolean {
  const db = getAuthDb();
  const res = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(keyId, userId);
  return res.changes > 0;
}

export function validateApiKey(rawKey: string): { id: string; user_id: string; prefix: string } | null {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const keyHash = hashKey(rawKey.trim());
  const db = getAuthDb();
  const row = db.prepare('SELECT id, user_id, prefix FROM api_keys WHERE key_hash = ? AND is_active = 1').get(keyHash) as
    | { id: string; user_id: string; prefix: string }
    | undefined;
  return row || null;
}

function resolveEndpointGroup(p: string): string {
  if (p.startsWith('/v1/movies')) return '/v1/movies';
  if (p.startsWith('/v1/tv')) return '/v1/tv';
  if (p.startsWith('/v1/refresh')) return '/v1/refresh';
  if (p.startsWith('/master.m3u8')) return '/master.m3u8';
  if (p.startsWith('/subs')) return '/subs';
  if (p === '/home' || p === '/api/home') return '/home';
  if (p === '/search' || p === '/api/search') return '/search';
  if (p === '/details' || p === '/api/details') return '/details';
  if (p === '/season' || p === '/api/season') return '/season';
  if (p === '/comments' || p === '/api/comments') return '/comments';
  if (p === '/segments' || p === '/api/segments') return '/segments';
  return 'other';
}

export function recordApiUsage(
  apiKeyId: string,
  method: string,
  pathname: string,
  status: number,
  durationMs: number
) {
  try {
    const db = getAuthDb();
    const now = Date.now();
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const endpointGroup = resolveEndpointGroup(pathname);

    const is2xx = status >= 200 && status < 300 ? 1 : 0;
    const is4xx = status >= 400 && status < 500 ? 1 : 0;
    const is5xx = status >= 500 ? 1 : 0;

    // Update last_used_at
    db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now, apiKeyId);

    // Upsert daily stats
    db.prepare(`
      INSERT INTO api_daily_stats (api_key_id, date, endpoint_group, status_2xx, status_4xx, status_5xx, total_requests)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(api_key_id, date, endpoint_group) DO UPDATE SET
        total_requests = total_requests + 1,
        status_2xx = status_2xx + excluded.status_2xx,
        status_4xx = status_4xx + excluded.status_4xx,
        status_5xx = status_5xx + excluded.status_5xx
    `).run(apiKeyId, date, endpointGroup, is2xx, is4xx, is5xx);

    // Insert recent log
    db.prepare(`
      INSERT INTO api_recent_logs (api_key_id, method, path, status, duration_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(apiKeyId, method, pathname, status, durationMs, now);

    // Keep recent logs bounded (max 200 per key)
    db.prepare(`
      DELETE FROM api_recent_logs 
      WHERE api_key_id = ? AND id NOT IN (
        SELECT id FROM api_recent_logs WHERE api_key_id = ? ORDER BY timestamp DESC LIMIT 200
      )
    `).run(apiKeyId, apiKeyId);
  } catch (err) {
    // Ignore logging errors so client request is not broken
  }
}

export function getUserStats(userId: string): UserStats {
  const db = getAuthDb();
  const keys = db.prepare('SELECT id, prefix FROM api_keys WHERE user_id = ? AND is_active = 1').all(userId) as Array<{
    id: string;
    prefix: string;
  }>;

  if (keys.length === 0) {
    return {
      totalRequests: 0,
      requests24h: 0,
      totalKeys: 0,
      lastUsedAt: null,
      dailyUsage: [],
      endpointBreakdown: [],
      recentLogs: [],
    };
  }

  const placeholders = keys.map(() => '?').join(',');
  const rawKeyIds = keys.map((k) => k.id);
  const prefixMap = new Map(keys.map((k) => [k.id, k.prefix]));

  // Total requests
  const totalRow = db.prepare(`
    SELECT COALESCE(SUM(total_requests), 0) as total
    FROM api_daily_stats
    WHERE api_key_id IN (${placeholders})
  `).get(...rawKeyIds) as { total: number };

  // Last 24 hours requests
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const recent24hRow = db.prepare(`
    SELECT COUNT(*) as count
    FROM api_recent_logs
    WHERE api_key_id IN (${placeholders}) AND timestamp >= ?
  `).get(...rawKeyIds, since24h) as { count: number };

  // Max last used
  const lastUsedRow = db.prepare(`
    SELECT MAX(last_used_at) as max_last_used
    FROM api_keys
    WHERE id IN (${placeholders})
  `).get(...rawKeyIds) as { max_last_used: number | null };

  // Daily usage (last 14 days)
  const dailyRows = db.prepare(`
    SELECT date, SUM(total_requests) as requests
    FROM api_daily_stats
    WHERE api_key_id IN (${placeholders})
    GROUP BY date
    ORDER BY date ASC
    LIMIT 14
  `).all(...rawKeyIds) as Array<{ date: string; requests: number }>;

  // Endpoint breakdown
  const endpointRows = db.prepare(`
    SELECT endpoint_group as endpoint, SUM(total_requests) as count
    FROM api_daily_stats
    WHERE api_key_id IN (${placeholders})
    GROUP BY endpoint_group
    ORDER BY count DESC
    LIMIT 8
  `).all(...rawKeyIds) as Array<{ endpoint: string; count: number }>;

  // Recent logs
  const logsRows = db.prepare(`
    SELECT id, api_key_id, method, path, status, duration_ms, timestamp
    FROM api_recent_logs
    WHERE api_key_id IN (${placeholders})
    ORDER BY timestamp DESC
    LIMIT 40
  `).all(...rawKeyIds) as any[];

  const recentLogs: ApiUsageLog[] = logsRows.map((r) => ({
    id: r.id,
    key_prefix: prefixMap.get(r.api_key_id) || 'unknown',
    method: r.method,
    path: r.path,
    status: r.status,
    duration_ms: r.duration_ms,
    timestamp: r.timestamp,
  }));

  return {
    totalRequests: Number(totalRow.total || 0),
    requests24h: Number(recent24hRow.count || 0),
    totalKeys: keys.length,
    lastUsedAt: lastUsedRow.max_last_used,
    dailyUsage: dailyRows.map((r) => ({ date: r.date, requests: Number(r.requests) })),
    endpointBreakdown: endpointRows.map((r) => ({ endpoint: r.endpoint, count: Number(r.count) })),
    recentLogs,
  };
}

export interface UserFavoriteItem {
  id: string | number;
  title: string;
  poster_path?: string;
  release_date?: string;
  media_type?: string;
  created_at?: number;
}

export interface UserWatchProgressItem {
  time: number;
  duration: number;
  updated: number;
  title?: string;
  poster?: string;
  mediaType?: string;
  tmdbId?: string | number;
  season?: number;
  episode?: number;
}

export interface UserCollectionItem {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  item_ids: string[];
}

export interface UserSyncPayload {
  favorites?: UserFavoriteItem[];
  watchProgress?: Record<string, UserWatchProgressItem>;
  collections?: UserCollectionItem[];
  settings?: any;
}

export function getUserFavorites(userId: string): UserFavoriteItem[] {
  const db = getAuthDb();
  const rows = db.prepare(`
    SELECT item_id, title, poster_path, release_date, media_type, created_at
    FROM user_favorites
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId) as any[];

  return rows.map((r) => ({
    id: isNaN(Number(r.item_id)) ? r.item_id : Number(r.item_id),
    title: r.title,
    poster_path: r.poster_path,
    release_date: r.release_date,
    media_type: r.media_type,
    created_at: r.created_at,
  }));
}

export function saveUserFavorite(userId: string, item: UserFavoriteItem) {
  const db = getAuthDb();
  const itemId = String(item.id);
  const now = item.created_at || Date.now();
  db.prepare(`
    INSERT INTO user_favorites (user_id, item_id, media_type, title, poster_path, release_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
      title = excluded.title,
      poster_path = excluded.poster_path,
      release_date = excluded.release_date,
      media_type = excluded.media_type
  `).run(
    userId,
    itemId,
    item.media_type || 'movie',
    item.title || 'Невідомо',
    item.poster_path || null,
    item.release_date || null,
    now
  );
}

export function removeUserFavorite(userId: string, itemId: string | number) {
  const db = getAuthDb();
  db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND item_id = ?').run(userId, String(itemId));
}

export function getUserWatchProgress(userId: string): Record<string, UserWatchProgressItem> {
  const db = getAuthDb();
  const rows = db.prepare(`
    SELECT media_id, time, duration, updated_at, title, poster, media_type, tmdb_id, season, episode
    FROM user_watch_progress
    WHERE user_id = ?
  `).all(userId) as any[];

  const result: Record<string, UserWatchProgressItem> = {};
  for (const r of rows) {
    result[r.media_id] = {
      time: r.time,
      duration: r.duration,
      updated: r.updated_at,
      title: r.title || undefined,
      poster: r.poster || undefined,
      mediaType: r.media_type || undefined,
      tmdbId: r.tmdb_id || undefined,
      season: r.season ?? undefined,
      episode: r.episode ?? undefined,
    };
  }
  return result;
}

export function saveUserWatchProgress(
  userId: string,
  mediaId: string,
  progress: UserWatchProgressItem
) {
  const db = getAuthDb();
  const now = progress.updated || Date.now();
  db.prepare(`
    INSERT INTO user_watch_progress (user_id, media_id, time, duration, updated_at, title, poster, media_type, tmdb_id, season, episode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, media_id) DO UPDATE SET
      time = excluded.time,
      duration = excluded.duration,
      updated_at = excluded.updated_at,
      title = COALESCE(excluded.title, user_watch_progress.title),
      poster = COALESCE(excluded.poster, user_watch_progress.poster),
      media_type = COALESCE(excluded.media_type, user_watch_progress.media_type),
      tmdb_id = COALESCE(excluded.tmdb_id, user_watch_progress.tmdb_id),
      season = COALESCE(excluded.season, user_watch_progress.season),
      episode = COALESCE(excluded.episode, user_watch_progress.episode)
  `).run(
    userId,
    mediaId,
    progress.time,
    progress.duration,
    now,
    progress.title || null,
    progress.poster || null,
    progress.mediaType || null,
    progress.tmdbId ? String(progress.tmdbId) : null,
    progress.season ?? null,
    progress.episode ?? null
  );
}

export function deleteUserWatchProgress(userId: string, mediaId: string) {
  const db = getAuthDb();
  db.prepare('DELETE FROM user_watch_progress WHERE user_id = ? AND media_id = ?').run(userId, mediaId);
}

export function getUserSyncSettings(userId: string): any {
  const db = getAuthDb();
  const row = db.prepare('SELECT settings_json FROM user_sync_settings WHERE user_id = ?').get(userId) as any;
  if (!row || !row.settings_json) return null;
  try {
    return JSON.parse(row.settings_json);
  } catch {
    return null;
  }
}

export function saveUserSyncSettings(userId: string, settings: any) {
  const db = getAuthDb();
  const now = Date.now();
  const jsonStr = JSON.stringify(settings || {});
  db.prepare(`
    INSERT INTO user_sync_settings (user_id, settings_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at
  `).run(userId, jsonStr, now);
}

export function getUserCollections(userId: string): UserCollectionItem[] {
  const db = getAuthDb();
  const collections = db.prepare(`
    SELECT id, name, created_at, updated_at
    FROM user_collections
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId) as any[];

  if (collections.length === 0) return [];

  const items = db.prepare(`
    SELECT collection_id, item_id
    FROM user_collection_items
    WHERE user_id = ?
    ORDER BY added_at ASC
  `).all(userId) as any[];

  const itemMap = new Map<string, string[]>();
  for (const it of items) {
    if (!itemMap.has(it.collection_id)) itemMap.set(it.collection_id, []);
    itemMap.get(it.collection_id)!.push(String(it.item_id));
  }

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    updated_at: c.updated_at,
    item_ids: itemMap.get(c.id) || [],
  }));
}

export function saveUserCollection(
  userId: string,
  col: { id?: string; name: string; item_ids?: string[]; created_at?: number; updated_at?: number }
): UserCollectionItem {
  const db = getAuthDb();
  const id = col.id || 'col_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const now = Date.now();
  const createdAt = col.created_at || now;
  const updatedAt = col.updated_at || now;
  const name = (col.name || 'Нова колекція').trim();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO user_collections (user_id, id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `).run(userId, id, name, createdAt, updatedAt);

    if (Array.isArray(col.item_ids)) {
      db.prepare('DELETE FROM user_collection_items WHERE user_id = ? AND collection_id = ?').run(userId, id);
      const insertItem = db.prepare(`
        INSERT OR IGNORE INTO user_collection_items (user_id, collection_id, item_id, added_at)
        VALUES (?, ?, ?, ?)
      `);
      col.item_ids.forEach((itemId, idx) => {
        if (itemId) insertItem.run(userId, id, String(itemId), now + idx);
      });
    }
  });

  tx();

  const itemRows = db.prepare(`
    SELECT item_id FROM user_collection_items WHERE user_id = ? AND collection_id = ? ORDER BY added_at ASC
  `).all(userId, id) as any[];

  return {
    id,
    name,
    created_at: createdAt,
    updated_at: updatedAt,
    item_ids: itemRows.map((r) => String(r.item_id)),
  };
}

export function deleteUserCollection(userId: string, collectionId: string) {
  const db = getAuthDb();
  db.prepare('DELETE FROM user_collections WHERE user_id = ? AND id = ?').run(userId, collectionId);
}

export function toggleCollectionItem(
  userId: string,
  collectionId: string,
  itemId: string | number
): { inCollection: boolean } {
  const db = getAuthDb();
  const sItemId = String(itemId);
  const existing = db.prepare(`
    SELECT 1 FROM user_collection_items WHERE user_id = ? AND collection_id = ? AND item_id = ?
  `).get(userId, collectionId, sItemId);

  const now = Date.now();
  if (existing) {
    db.prepare(`
      DELETE FROM user_collection_items WHERE user_id = ? AND collection_id = ? AND item_id = ?
    `).run(userId, collectionId, sItemId);
    db.prepare('UPDATE user_collections SET updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, collectionId);
    return { inCollection: false };
  } else {
    db.prepare(`
      INSERT OR IGNORE INTO user_collection_items (user_id, collection_id, item_id, added_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, collectionId, sItemId, now);
    db.prepare('UPDATE user_collections SET updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, collectionId);
    return { inCollection: true };
  }
}

export function setItemCollections(
  userId: string,
  itemId: string | number,
  collectionIds: string[]
) {
  const db = getAuthDb();
  const sItemId = String(itemId);
  const now = Date.now();

  const tx = db.transaction(() => {
    db.prepare(`
      DELETE FROM user_collection_items
      WHERE user_id = ? AND item_id = ?
    `).run(userId, sItemId);

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO user_collection_items (user_id, collection_id, item_id, added_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const cId of collectionIds) {
      insertStmt.run(userId, cId, sItemId, now);
      db.prepare('UPDATE user_collections SET updated_at = ? WHERE user_id = ? AND id = ?').run(now, userId, cId);
    }
  });

  tx();
}

export function syncUserData(
  userId: string,
  payload: UserSyncPayload
): {
  favorites: UserFavoriteItem[];
  watchProgress: Record<string, UserWatchProgressItem>;
  collections: UserCollectionItem[];
  settings: any;
} {
  const db = getAuthDb();

  // 1. Sync Favorites (union merge)
  const currentFavs = getUserFavorites(userId);
  const favMap = new Map<string, UserFavoriteItem>();
  for (const f of currentFavs) {
    favMap.set(String(f.id), f);
  }

  if (Array.isArray(payload.favorites)) {
    const insertStmt = db.prepare(`
      INSERT INTO user_favorites (user_id, item_id, media_type, title, poster_path, release_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET
        title = excluded.title,
        poster_path = excluded.poster_path,
        release_date = excluded.release_date,
        media_type = excluded.media_type
    `);

    const syncFavTransaction = db.transaction((favList: UserFavoriteItem[]) => {
      for (const item of favList) {
        if (!item || !item.id) continue;
        const key = String(item.id);
        const existing = favMap.get(key);
        if (!existing) {
          const createdAt = item.created_at || Date.now();
          insertStmt.run(
            userId,
            key,
            item.media_type || 'movie',
            item.title || 'Невідомо',
            item.poster_path || null,
            item.release_date || null,
            createdAt
          );
          favMap.set(key, { ...item, created_at: createdAt });
        }
      }
    });

    syncFavTransaction(payload.favorites);
  }

  // 2. Sync Watch Progress (latest updated wins)
  const currentProgress = getUserWatchProgress(userId);

  if (payload.watchProgress && typeof payload.watchProgress === 'object') {
    const upsertStmt = db.prepare(`
      INSERT INTO user_watch_progress (user_id, media_id, time, duration, updated_at, title, poster, media_type, tmdb_id, season, episode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, media_id) DO UPDATE SET
        time = excluded.time,
        duration = excluded.duration,
        updated_at = excluded.updated_at,
        title = COALESCE(excluded.title, user_watch_progress.title),
        poster = COALESCE(excluded.poster, user_watch_progress.poster),
        media_type = COALESCE(excluded.media_type, user_watch_progress.media_type),
        tmdb_id = COALESCE(excluded.tmdb_id, user_watch_progress.tmdb_id),
        season = COALESCE(excluded.season, user_watch_progress.season),
        episode = COALESCE(excluded.episode, user_watch_progress.episode)
    `);

    const syncProgTransaction = db.transaction((progObj: Record<string, UserWatchProgressItem>) => {
      for (const [mediaId, item] of Object.entries(progObj)) {
        if (!item || typeof item.time !== 'number') continue;
        const existing = currentProgress[mediaId];
        const clientUpdated = item.updated || Date.now();
        if (!existing || clientUpdated > (existing.updated || 0)) {
          upsertStmt.run(
            userId,
            mediaId,
            item.time,
            item.duration || 0,
            clientUpdated,
            item.title || null,
            item.poster || null,
            item.mediaType || null,
            item.tmdbId ? String(item.tmdbId) : null,
            item.season ?? null,
            item.episode ?? null
          );
          currentProgress[mediaId] = {
            ...item,
            updated: clientUpdated,
          };
        }
      }
    });

    syncProgTransaction(payload.watchProgress);
  }

  // 3. Sync Collections
  const serverCollections = getUserCollections(userId);
  const colMap = new Map<string, UserCollectionItem>();
  for (const c of serverCollections) {
    colMap.set(c.id, c);
  }

  if (Array.isArray(payload.collections)) {
    for (const clientCol of payload.collections) {
      if (!clientCol || !clientCol.id) continue;
      const serverCol = colMap.get(clientCol.id);
      if (!serverCol) {
        saveUserCollection(userId, clientCol);
      } else {
        const mergedItemIds = Array.from(new Set([...(serverCol.item_ids || []), ...(clientCol.item_ids || [])]));
        const updatedAt = Math.max(serverCol.updated_at || 0, clientCol.updated_at || 0);
        const name = (clientCol.updated_at || 0) > (serverCol.updated_at || 0) ? clientCol.name : serverCol.name;
        saveUserCollection(userId, {
          id: serverCol.id,
          name,
          created_at: serverCol.created_at,
          updated_at: updatedAt,
          item_ids: mergedItemIds,
        });
      }
    }
  }

  // 4. Settings
  let currentSettings = getUserSyncSettings(userId);
  if (payload.settings && typeof payload.settings === 'object') {
    currentSettings = { ...(currentSettings || {}), ...payload.settings };
    saveUserSyncSettings(userId, currentSettings);
  }

  return {
    favorites: Array.from(favMap.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
    watchProgress: currentProgress,
    collections: getUserCollections(userId),
    settings: currentSettings,
  };
}
