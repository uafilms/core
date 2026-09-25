import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import api from '../api/axios';
import { getLocalFavorites, getWatchHistory, removeWatchProgress, saveWatchProgress } from '../utils/sync.js';
import { useAuth } from '../context/AuthContext';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const Favorites = () => {
  const [activeTab, setActiveTab] = useState('favorites'); // 'favorites' | 'history'
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const { user, isSyncing, syncNow, setIsAuthModalOpen } = useAuth();
  const navigate = useNavigate();

  const loadData = useCallback(() => {
    setFavorites(getLocalFavorites());
    setHistory(getWatchHistory());
  }, []);

  const enrichHistoryMetadata = useCallback(async () => {
    const list = getWatchHistory();
    const missing = list.filter((item) => !item.title || !item.poster);
    if (missing.length === 0) return;

    // Collect unique items to resolve
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
      // 1. Fast batch metadata request in single network call
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
    } catch {
      // Fallback below if batch request fails
    }

    // Fallback: individual queries
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
    const handleProg = () => {
      setHistory(getWatchHistory());
    };

    window.addEventListener('uafilms_favorites_updated', handleFav);
    window.addEventListener('uafilms_progress_updated', handleProg);
    window.addEventListener('uafilms_sync_completed', loadData);

    return () => {
      window.removeEventListener('uafilms_favorites_updated', handleFav);
      window.removeEventListener('uafilms_progress_updated', handleProg);
      window.removeEventListener('uafilms_sync_completed', loadData);
    };
  }, [loadData, enrichHistoryMetadata]);

  const handleContinueWatching = (item) => {
    let type = item.mediaType;
    let id = item.tmdbId;
    let season = item.season;
    let episode = item.episode;

    if (!type || !id) {
      const parts = item.mediaId.split('_');
      type = parts[0] === 'tv' ? 'tv' : 'movie';
      id = parts[1];
      if (type === 'tv' && parts.length >= 4) {
        const sMatch = parts[2]?.match(/s(\d+)/i);
        const eMatch = parts[3]?.match(/e(\d+)/i);
        if (sMatch) season = parseInt(sMatch[1], 10);
        if (eMatch) episode = parseInt(eMatch[1], 10);
      }
    }

    let url = `/details/${type}/${id}`;
    if (type === 'tv' && season) {
      url += `?s=${season}&e=${episode || 1}`;
    }
    navigate(url);
  };

  const handleRemoveHistory = (e, item) => {
    e.stopPropagation();
    const targets = item.allEpisodeMediaIds || item.mediaId;
    removeWatchProgress(targets);
    setHistory(getWatchHistory());
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Sync Status Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h4 style={{ fontWeight: 600, margin: 0 }}>Медіатека</h4>
          <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
            Збережені фільми та прогрес перегляду
          </p>
        </div>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="chip tertiary-container surface-variant-text" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i style={{ fontSize: '16px', color: 'var(--primary)' }}>cloud_done</i>
              <span>Синхронізовано з акаунтом</span>
            </span>
            <button
              className="circle transparent small"
              onClick={syncNow}
              disabled={isSyncing}
              title="Синхронізувати зараз"
            >
              <i style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>sync</i>
            </button>
          </div>
        ) : (
          <div
            className="round surface-container-high"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
            onClick={() => setIsAuthModalOpen(true)}
          >
            <i style={{ fontSize: '18px', color: 'var(--primary)' }}>cloud_off</i>
            <span style={{ fontSize: '13px' }}>Увійдіть для синхронізації між пристроями</span>
            <button className="small round primary" style={{ padding: '4px 10px', height: '28px', fontSize: '12px' }}>
              Увійти
            </button>
          </div>
        )}
      </div>

      {/* Material 3 Segmented Control / Tabs */}
      <div
        className="round surface-container-low"
        style={{
          display: 'inline-flex',
          padding: '4px',
          gap: '4px',
          marginBottom: '28px',
        }}
      >
        <button
          className={activeTab === 'favorites' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 20px', fontWeight: 500, fontSize: '14px', height: '36px' }}
          onClick={() => setActiveTab('favorites')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>favorite</i>
          <span>Обране ({favorites.length})</span>
        </button>
        <button
          className={activeTab === 'history' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 20px', fontWeight: 500, fontSize: '14px', height: '36px' }}
          onClick={() => setActiveTab('history')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>history</i>
          <span>Історія перегляду ({history.length})</span>
        </button>
      </div>

      {/* Tab 1: Favorites */}
      {activeTab === 'favorites' && (
        <>
          {favorites.length === 0 ? (
            <div className="center-align padding" style={{ opacity: 0.6, marginTop: '64px' }}>
              <i style={{ fontSize: '56px', marginBottom: '12px' }}>favorite_border</i>
              <h5>Ви ще нічого не зберегли</h5>
              <p className="small-text surface-variant-text">
                Натискайте іконку сердечка на сторінці фільму, щоб додати його сюди.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
              {favorites.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Watch History / Timestamps */}
      {activeTab === 'history' && (
        <>
          {history.length === 0 ? (
            <div className="center-align padding" style={{ opacity: 0.6, marginTop: '64px' }}>
              <i style={{ fontSize: '56px', marginBottom: '12px' }}>history</i>
              <h5>Історія перегляду порожня</h5>
              <p className="small-text surface-variant-text">
                Коли ви почнете переглядати фільми чи серіали, тут автоматично зберігатиметься прогрес і таймстампи.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
              {history.map((item) => {
                const percent = item.duration > 0 ? Math.min(100, Math.round((item.time / item.duration) * 100)) : 0;
                const posterUrl = item.poster
                  ? item.poster.startsWith('http')
                    ? item.poster
                    : `https://image.tmdb.org/t/p/w500${item.poster}`
                  : null;

                const isTv = item.mediaType === 'tv' || item.mediaId.startsWith('tv_');
                const seasonLabel = isTv && item.season ? `S${item.season} E${item.episode || 1}` : null;

                return (
                  <article
                    key={item.mediaId}
                    className="no-padding round wave surface-container-low"
                    style={{
                      cursor: 'pointer',
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    onClick={() => handleContinueWatching(item)}
                  >
                    {/* Poster + Overlay Progress */}
                    <div style={{ position: 'relative', width: '100%', height: '140px', backgroundColor: 'var(--surface-container-high)' }}>
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={item.title || 'Медіа'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i style={{ fontSize: '40px', opacity: 0.4 }}>movie</i>
                        </div>
                      )}

                      {/* Play overlay hover indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.1) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <i
                          style={{
                            fontSize: '44px',
                            color: '#ffffff',
                            opacity: 0.9,
                            fontVariationSettings: "'FILL' 1",
                          }}
                        >
                          play_circle
                        </i>
                      </div>

                      {/* Delete button */}
                      <button
                        className="circle transparent small"
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          backgroundColor: 'rgba(0, 0, 0, 0.6)',
                          color: '#ffffff',
                          width: '28px',
                          height: '28px',
                        }}
                        onClick={(e) => handleRemoveHistory(e, item)}
                        title="Видалити з історії"
                      >
                        <i style={{ fontSize: '16px' }}>close</i>
                      </button>

                      {/* TV Badge */}
                      {seasonLabel && (
                        <span
                          className="chip primary"
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            height: '22px',
                            fontWeight: 600,
                          }}
                        >
                          {seasonLabel}
                        </span>
                      )}

                      {/* Bottom Progress Bar */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${percent}%`,
                            backgroundColor: 'var(--primary)',
                          }}
                        />
                      </div>
                    </div>

                    {/* Card Details */}
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: '14px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={item.title || (isTv ? 'Серіал' : 'Фільм')}
                      >
                        {item.title || (
                          <span style={{ opacity: 0.65, fontStyle: 'italic' }}>
                            {isTv ? 'Серіал' : 'Фільм'} #{item.tmdbId || item.mediaId.split('_')[1] || ''}
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                        <span>
                          {formatTime(item.time)} / {formatTime(item.duration)}
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--primary)' }}>
                          {percent}%
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Favorites;
