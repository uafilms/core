declare const Lampa: any;

const inMemoryCache = new Map<string, { data: any; expiresAt: number }>();

export function getLocalCache<T>(key: string): T | null {
  const now = Date.now();

  // 1. In-memory check
  const mem = inMemoryCache.get(key);
  if (mem) {
    if (mem.expiresAt > now) {
      return mem.data as T;
    }
    inMemoryCache.delete(key);
  }

  // 2. Lampa.Storage check
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const storageKey = `uafilms_c_${key}`;
      const entry = Lampa.Storage.get(storageKey, null);
      if (entry && entry.exp && entry.exp > now) {
        inMemoryCache.set(key, { data: entry.data, expiresAt: entry.exp });
        return entry.data as T;
      }
    }
  } catch {
    // Ignore storage errors
  }

  return null;
}

export function setLocalCache<T>(key: string, data: T, ttlSeconds = 900): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  // 1. In-memory save
  inMemoryCache.set(key, { data, expiresAt });

  // 2. Lampa.Storage save
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      const storageKey = `uafilms_c_${key}`;
      Lampa.Storage.set(storageKey, { data, exp: expiresAt });
    }
  } catch {
    // Ignore storage errors
  }
}
