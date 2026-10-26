import { useState, useEffect, useCallback } from 'react';
import api from '../../../api/axios';
import {
  getLocalFavorites,
  getWatchHistory,
  saveWatchProgress,
  getLocalCollections,
} from '../../../utils/sync.js';

export function useFavoritesData() {
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [collections, setCollections] = useState([]);

  const loadData = useCallback(() => {
    setFavorites(getLocalFavorites());
    setHistory(getWatchHistory());
    setCollections(getLocalCollections());
  }, []);

  const enrichHistoryMetadata = useCallback(async () => {
    const list = getWatchHistory();
    const missing = list.filter((item) => !item.title || !item.poster);
    if (missing.length === 0) return;

    const requestItems = [];
    const itemMap = new Map();

    for (const item of missing) {
      let type = item.mediaType;
      let id = item.tmdbId;

      if (!type || !id) {
        const parts = String(item.mediaId).split('_');
        type = parts[0] === 'tv' ? 'tv' : 'movie';
        id = parts[1];
      }

      if (id) {
        const key = `${type}_${id}`;
        if (!itemMap.has(key)) {
          itemMap.set(key, []);
          requestItems.push({ id, type });
        }
        itemMap.get(key).push(item);
      }
    }

    if (requestItems.length === 0) return;

    try {
      const res = await api.post('/batch-meta', { items: requestItems });
      const results = res.data?.items || [];
      let updatedAny = false;

      for (const meta of results) {
        const key = `${meta.type}_${meta.id}`;
        const targets = itemMap.get(key) || [];
        for (const target of targets) {
          const allTargetIds = target.allEpisodeMediaIds || [target.mediaId];
          for (const mId of allTargetIds) {
            saveWatchProgress(
              mId,
              {
                title: meta.title,
                poster: meta.posterUrl || meta.backdropUrl,
                mediaType: meta.type,
                tmdbId: meta.id,
              },
              { immediate: true }
            );
          }
          updatedAny = true;
        }
      }

      if (updatedAny) {
        setHistory(getWatchHistory());
        return;
      }
    } catch {}

    let updatedAny = false;
    await Promise.allSettled(
      missing.map(async (item) => {
        let type = item.mediaType;
        let id = item.tmdbId;

        if (!type || !id) {
          const parts = String(item.mediaId).split('_');
          type = parts[0] === 'tv' ? 'tv' : 'movie';
          id = parts[1];
        }

        if (!id) return;

        try {
          const res = await api.get(`/details?id=${id}&type=${type}`);
          if (res.data) {
            const title = res.data.title || res.data.name || '';
            const poster = res.data.posterUrl || res.data.backdropUrl || '';
            const allTargetIds = item.allEpisodeMediaIds || [item.mediaId];
            for (const mId of allTargetIds) {
              saveWatchProgress(
                mId,
                {
                  title,
                  poster,
                  mediaType: type,
                  tmdbId: id,
                },
                { immediate: true }
              );
            }
            updatedAny = true;
          }
        } catch {}
      })
    );

    if (updatedAny) {
      setHistory(getWatchHistory());
    }
  }, []);

  useEffect(() => {
    loadData();
    enrichHistoryMetadata();

    const handleFav = () => setFavorites(getLocalFavorites());
    const handleProg = () => setHistory(getWatchHistory());
    const handleCol = () => setCollections(getLocalCollections());

    window.addEventListener('uafilms_favorites_updated', handleFav);
    window.addEventListener('uafilms_progress_updated', handleProg);
    window.addEventListener('uafilms_collections_updated', handleCol);
    window.addEventListener('uafilms_sync_completed', loadData);

    return () => {
      window.removeEventListener('uafilms_favorites_updated', handleFav);
      window.removeEventListener('uafilms_progress_updated', handleProg);
      window.removeEventListener('uafilms_collections_updated', handleCol);
      window.removeEventListener('uafilms_sync_completed', loadData);
    };
  }, [loadData, enrichHistoryMetadata]);

  return {
    favorites,
    setFavorites,
    history,
    setHistory,
    collections,
    setCollections,
    loadData,
  };
}
