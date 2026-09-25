import axios from '../api/axios.js';

let progressSyncDebounceTimer = null;
let pendingProgressUpdates = new Map();
let lastProgressServerSyncTime = 0;
const SERVER_SYNC_INTERVAL_MS = 20000; // 20s (in 10-30s range to prevent spam)

/**
 * Flush all pending progress updates to cloud immediately
 */
export async function flushWatchProgress() {
  if (progressSyncDebounceTimer) {
    clearTimeout(progressSyncDebounceTimer);
    progressSyncDebounceTimer = null;
  }

  if (pendingProgressUpdates.size === 0) return;

  const token = localStorage.getItem('uafilms_auth_token');
  if (!token) {
    pendingProgressUpdates.clear();
    return;
  }

  const toSend = Array.from(pendingProgressUpdates.entries());
  pendingProgressUpdates.clear();
  lastProgressServerSyncTime = Date.now();

  const apiBase = import.meta.env?.VITE_API_BASE_URL || '/api';

  for (const [mId, prog] of toSend) {
    const payload = { mediaId: mId, ...prog };
    try {
      if (typeof fetch !== 'undefined') {
        fetch(`${apiBase}/auth/sync/progress`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      } else {
        await axios.post('/auth/sync/progress', payload);
      }
    } catch (err) {
      console.warn('Watch progress sync failed:', err);
    }
  }
}

/**
 * Returns array of collections from localStorage
 * Each: { id, name, created_at, updated_at, item_ids: string[] }
 */
export function getLocalCollections() {
  try {
    return JSON.parse(localStorage.getItem('uafilms_collections') || '[]');
  } catch {
    return [];
  }
}

/**
 * Create or update collection locally and push to cloud
 */
export async function saveLocalCollection(collection) {
  if (!collection || !collection.name) return null;

  const collections = getLocalCollections();
  const now = Date.now();
  const id = collection.id || 'col_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  
  const existingIdx = collections.findIndex((c) => c.id === id);
  let updatedCol;

  if (existingIdx >= 0) {
    updatedCol = {
      ...collections[existingIdx],
      name: collection.name.trim(),
      updated_at: now,
      item_ids: Array.isArray(collection.item_ids) ? collection.item_ids : collections[existingIdx].item_ids || [],
    };
    collections[existingIdx] = updatedCol;
  } else {
    updatedCol = {
      id,
      name: collection.name.trim(),
      created_at: collection.created_at || now,
      updated_at: now,
      item_ids: Array.isArray(collection.item_ids) ? collection.item_ids : [],
    };
    collections.push(updatedCol);
  }

  localStorage.setItem('uafilms_collections', JSON.stringify(collections));
  window.dispatchEvent(new CustomEvent('uafilms_collections_updated', { detail: collections }));

  const token = localStorage.getItem('uafilms_auth_token');
  if (token) {
    try {
      await axios.post('/auth/collections', updatedCol);
    } catch (err) {
      console.warn('Collection cloud save failed:', err);
    }
  }

  return updatedCol;
}

/**
 * Delete collection locally and on cloud
 */
export async function deleteLocalCollection(collectionId) {
  if (!collectionId) return;

  const collections = getLocalCollections().filter((c) => c.id !== collectionId);
  localStorage.setItem('uafilms_collections', JSON.stringify(collections));
  window.dispatchEvent(new CustomEvent('uafilms_collections_updated', { detail: collections }));

  const token = localStorage.getItem('uafilms_auth_token');
  if (token) {
    try {
      await axios.delete(`/auth/collections/${collectionId}`);
    } catch (err) {
      console.warn('Collection cloud delete failed:', err);
    }
  }
}

/**
 * Toggle single item in collection
 */
export async function toggleItemInCollection(collectionId, itemId) {
  if (!collectionId || !itemId) return;
  const sItemId = String(itemId);
  const collections = getLocalCollections();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return;

  const items = Array.isArray(col.item_ids) ? [...col.item_ids] : [];
  const idx = items.indexOf(sItemId);
  if (idx >= 0) {
    items.splice(idx, 1);
  } else {
    items.push(sItemId);
  }

  col.item_ids = items;
  col.updated_at = Date.now();

  localStorage.setItem('uafilms_collections', JSON.stringify(collections));
  window.dispatchEvent(new CustomEvent('uafilms_collections_updated', { detail: collections }));

  const token = localStorage.getItem('uafilms_auth_token');
  if (token) {
    try {
      await axios.post(`/auth/collections/${collectionId}/toggle`, { itemId: sItemId });
    } catch (err) {
      console.warn('Collection toggle cloud sync failed:', err);
    }
  }
}

/**
 * Set which collections an item belongs to
 */
export async function setItemCollections(itemId, collectionIds) {
  if (!itemId || !Array.isArray(collectionIds)) return;
  const sItemId = String(itemId);
  const collections = getLocalCollections();
  const now = Date.now();

  for (const col of collections) {
    const shouldHave = collectionIds.includes(col.id);
    let items = Array.isArray(col.item_ids) ? [...col.item_ids] : [];
    const has = items.includes(sItemId);

    if (shouldHave && !has) {
      items.push(sItemId);
      col.item_ids = items;
      col.updated_at = now;
    } else if (!shouldHave && has) {
      items = items.filter((id) => id !== sItemId);
      col.item_ids = items;
      col.updated_at = now;
    }
  }

  localStorage.setItem('uafilms_collections', JSON.stringify(collections));
  window.dispatchEvent(new CustomEvent('uafilms_collections_updated', { detail: collections }));

  const token = localStorage.getItem('uafilms_auth_token');
  if (token) {
    try {
      await axios.post('/auth/collections/item-collections', {
        itemId: sItemId,
        collectionIds,
      });
    } catch (err) {
      console.warn('Item collections cloud sync failed:', err);
    }
  }
}

/**
 * Returns collection IDs that contain the given itemId
 */
export function getItemCollectionIds(itemId) {
  if (!itemId) return [];
  const sItemId = String(itemId);
  const collections = getLocalCollections();
  return collections
    .filter((col) => Array.isArray(col.item_ids) && col.item_ids.includes(sItemId))
    .map((col) => col.id);
}

/**
 * Returns array of favorites from localStorage
 */
export function getLocalFavorites() {
  try {
    return JSON.parse(localStorage.getItem('uafilms_favorites') || '[]');
  } catch {
    return [];
  }
}

/**
 * Returns map of watch progress from localStorage
 */
export function getLocalWatchProgress() {
  try {
    return JSON.parse(localStorage.getItem('uafilms_watch_progress') || '{}');
  } catch {
    return {};
  }
}

/**
 * Formats watch progress into an array for history views.
 * Groups TV series episodes into a single entry showing the most recently watched episode.
 */
export function getWatchHistory() {
  const store = getLocalWatchProgress();
  const rawList = Object.entries(store)
    .map(([mediaId, val]) => ({
      mediaId,
      ...val,
    }))
    .filter((item) => item.time > 5)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));

  // Group TV series: 1 card per TV show
  const grouped = new Map();
  for (const item of rawList) {
    let isTv = item.mediaType === 'tv';
    let tvId = item.tmdbId;

    if (!isTv && typeof item.mediaId === 'string' && item.mediaId.startsWith('tv_')) {
      isTv = true;
      const parts = item.mediaId.split('_');
      tvId = parts[1];
    }

    const groupKey = isTv && tvId ? `tv_${tvId}` : item.mediaId;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        ...item,
        allEpisodeMediaIds: [item.mediaId],
      });
    } else {
      const existing = grouped.get(groupKey);
      existing.allEpisodeMediaIds.push(item.mediaId);
      // Keep title and poster if existing didn't have them
      if (!existing.title && item.title) existing.title = item.title;
      if (!existing.poster && item.poster) existing.poster = item.poster;
    }
  }

  return Array.from(grouped.values()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

/**
 * Full sync with cloud (bi-directional merge)
 */
export async function syncWithCloud() {
  const token = localStorage.getItem('uafilms_auth_token');
  if (!token) return null;

  try {
    const localFavs = getLocalFavorites();
    const localProgress = getLocalWatchProgress();
    const localCollections = getLocalCollections();
    let localSettings = {};
    try {
      localSettings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    } catch {}

    const res = await axios.post('/auth/sync', {
      favorites: localFavs,
      watchProgress: localProgress,
      collections: localCollections,
      settings: localSettings,
    });

    if (res.data) {
      if (Array.isArray(res.data.favorites)) {
        localStorage.setItem('uafilms_favorites', JSON.stringify(res.data.favorites));
      }
      if (res.data.watchProgress && typeof res.data.watchProgress === 'object') {
        localStorage.setItem('uafilms_watch_progress', JSON.stringify(res.data.watchProgress));
      }
      if (Array.isArray(res.data.collections)) {
        localStorage.setItem('uafilms_collections', JSON.stringify(res.data.collections));
        window.dispatchEvent(new CustomEvent('uafilms_collections_updated'));
      }
      if (res.data.settings && typeof res.data.settings === 'object') {
        const cur = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
        const merged = { ...cur, ...res.data.settings };
        localStorage.setItem('uafilms_settings', JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('uafilms_settings_updated', { detail: merged }));
      }

      window.dispatchEvent(new CustomEvent('uafilms_sync_completed', { detail: res.data }));
      window.dispatchEvent(new CustomEvent('uafilms_favorites_updated'));
      window.dispatchEvent(new CustomEvent('uafilms_progress_updated'));
      return res.data;
    }
  } catch (err) {
    console.error('Failed to sync with cloud:', err);
  }
  return null;
}

/**
 * Toggle favorite item and sync with cloud
 */
export async function toggleFavoriteItem(item, isFav) {
  if (!item || !item.id) return [];

  const favorites = getLocalFavorites();
  let updatedFavs;
  if (isFav) {
    const minData = {
      id: item.id,
      title: item.title || item.originalTitle || 'Невідомо',
      poster_path: item.poster_path || item.posterUrl || null,
      release_date: item.release_date || (item.year ? `${item.year}-` : ''),
      media_type: item.media_type || 'movie',
      created_at: Date.now(),
    };
    updatedFavs = [minData, ...favorites.filter((f) => String(f.id) !== String(item.id))];
  } else {
    updatedFavs = favorites.filter((f) => String(f.id) !== String(item.id));
  }

  localStorage.setItem('uafilms_favorites', JSON.stringify(updatedFavs));
  window.dispatchEvent(new CustomEvent('uafilms_favorites_updated'));

  const token = localStorage.getItem('uafilms_auth_token');
  if (token) {
    try {
      await axios.post('/auth/sync/favorite', {
        item: {
          id: item.id,
          title: item.title || item.originalTitle || 'Невідомо',
          poster_path: item.poster_path || item.posterUrl || null,
          release_date: item.release_date || (item.year ? `${item.year}-` : ''),
          media_type: item.media_type || 'movie',
        },
        isFav,
      });
    } catch (err) {
      console.warn('Favorite cloud sync failed, will retry on next sync:', err);
    }
  }

  return updatedFavs;
}

/**
 * Save watch progress locally and throttle/push to cloud
 * @param {string} mediaId
 * @param {object} data
 * @param {object} options - { immediate: boolean }
 */
export function saveWatchProgress(mediaId, data, options = {}) {
  if (!mediaId) return;

  const store = getLocalWatchProgress();
  const prev = store[mediaId] || {};
  const entry = {
    time: typeof data.time === 'number' ? Math.floor(data.time) : (prev.time || 0),
    duration: typeof data.duration === 'number' ? Math.floor(data.duration) : (prev.duration || 0),
    updated: data.updated || prev.updated || Date.now(),
    title: data.title || prev.title || undefined,
    poster: data.poster || prev.poster || undefined,
    mediaType: data.mediaType || prev.mediaType || undefined,
    tmdbId: data.tmdbId || prev.tmdbId || undefined,
    season: data.season ?? prev.season,
    episode: data.episode ?? prev.episode,
  };

  store[mediaId] = entry;
  localStorage.setItem('uafilms_watch_progress', JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('uafilms_progress_updated'));

  const token = localStorage.getItem('uafilms_auth_token');
  if (!token) return;

  pendingProgressUpdates.set(mediaId, entry);

  // If immediate requested (e.g. pause, stop, pagehide, unmount)
  if (options.immediate) {
    flushWatchProgress();
    return;
  }

  // Periodic auto-sync during playback: every 20s (10-30s range to prevent spam)
  const now = Date.now();
  if (now - lastProgressServerSyncTime >= SERVER_SYNC_INTERVAL_MS) {
    flushWatchProgress();
  } else if (!progressSyncDebounceTimer) {
    const delay = Math.max(1000, SERVER_SYNC_INTERVAL_MS - (now - lastProgressServerSyncTime));
    progressSyncDebounceTimer = setTimeout(() => {
      progressSyncDebounceTimer = null;
      flushWatchProgress();
    }, delay);
  }
}

/**
 * Delete watch progress (e.g. when video completed or cleared from history)
 * Supports single mediaId string or array of mediaIds (e.g. all episodes of a series)
 * @param {string|string[]} mediaIdOrIds
 */
export async function removeWatchProgress(mediaIdOrIds) {
  if (!mediaIdOrIds) return;
  const ids = Array.isArray(mediaIdOrIds) ? mediaIdOrIds : [mediaIdOrIds];
  if (ids.length === 0) return;

  const store = getLocalWatchProgress();
  for (const mId of ids) {
    delete store[mId];
    pendingProgressUpdates.delete(mId);
  }
  localStorage.setItem('uafilms_watch_progress', JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('uafilms_progress_updated'));

  const token = localStorage.getItem('uafilms_auth_token');
  if (token) {
    const apiBase = import.meta.env?.VITE_API_BASE_URL || '/api';
    for (const mId of ids) {
      try {
        const payload = { mediaId: mId, deleted: true };
        if (typeof fetch !== 'undefined') {
          fetch(`${apiBase}/auth/sync/progress`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        } else {
          await axios.post('/auth/sync/progress', payload);
        }
      } catch (err) {
        console.warn('Watch progress delete sync failed:', err);
      }
    }
  }
}
