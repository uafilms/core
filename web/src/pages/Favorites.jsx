import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import Dropdown from '../components/Dropdown';
import CollectionModal from '../components/CollectionModal';
import api from '../api/axios';
import {
  getLocalFavorites,
  getWatchHistory,
  removeWatchProgress,
  saveWatchProgress,
  getLocalCollections,
  saveLocalCollection,
  deleteLocalCollection,
  toggleItemInCollection,
} from '../utils/sync.js';
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

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Найновіші додані' },
  { value: 'date_asc', label: 'Найстаріші додані' },
  { value: 'title_asc', label: 'За назвою (А - Я)' },
  { value: 'title_desc', label: 'За назвою (Я - А)' },
  { value: 'year_desc', label: 'За роком (спочатку нові)' },
  { value: 'year_asc', label: 'За роком (спочатку старі)' },
];

const Favorites = () => {
  const [activeTab, setActiveTab] = useState('favorites'); // 'favorites' | 'history'
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'movie' | 'tv'

  // Modal states
  const [selectedMovieForCollection, setSelectedMovieForCollection] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isClosingCreate, setIsClosingCreate] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const [collectionToEdit, setCollectionToEdit] = useState(null);
  const [isClosingEdit, setIsClosingEdit] = useState(false);
  const [editCollectionName, setEditCollectionName] = useState('');

  const [collectionToDelete, setCollectionToDelete] = useState(null);
  const [isClosingDelete, setIsClosingDelete] = useState(false);

  const { user, isSyncing, syncNow, setIsAuthModalOpen } = useAuth();
  const navigate = useNavigate();

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

  // Active selected collection object
  const activeCollection = useMemo(() => {
    if (selectedCollectionId === 'all') return null;
    return collections.find((c) => c.id === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  // Filter & sort favorites
  const displayedFavorites = useMemo(() => {
    let result = [...favorites];

    // 1. Filter by collection
    if (activeCollection) {
      const allowedIds = new Set((activeCollection.item_ids || []).map(String));
      result = result.filter((item) => allowedIds.has(String(item.id)));
    }

    // 2. Filter by media type
    if (filterType !== 'all') {
      result = result.filter((item) => (item.media_type || 'movie') === filterType);
    }

    // 3. Sort
    result.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return (b.created_at || 0) - (a.created_at || 0);
      }
      if (sortBy === 'date_asc') {
        return (a.created_at || 0) - (b.created_at || 0);
      }
      if (sortBy === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '', 'uk');
      }
      if (sortBy === 'title_desc') {
        return (b.title || '').localeCompare(a.title || '', 'uk');
      }
      if (sortBy === 'year_desc' || sortBy === 'year_asc') {
        const yearA = parseInt((a.release_date || '').split('-')[0], 10) || 0;
        const yearB = parseInt((b.release_date || '').split('-')[0], 10) || 0;
        return sortBy === 'year_desc' ? yearB - yearA : yearA - yearB;
      }
      return 0;
    });

    return result;
  }, [favorites, activeCollection, filterType, sortBy]);

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

  // Create Collection
  const handleOpenCreateModal = () => {
    setNewCollectionName('');
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsClosingCreate(true);
    setTimeout(() => {
      setIsClosingCreate(false);
      setIsCreateModalOpen(false);
    }, 200);
  };

  const handleCreateCollection = async (e) => {
    e.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;

    const created = await saveLocalCollection({ name, item_ids: [] });
    if (created) {
      setSelectedCollectionId(created.id);
      handleCloseCreateModal();
    }
  };

  // Edit Collection
  const handleOpenEditModal = (col) => {
    setCollectionToEdit(col);
    setEditCollectionName(col.name);
  };

  const handleCloseEditModal = () => {
    setIsClosingEdit(true);
    setTimeout(() => {
      setIsClosingEdit(false);
      setCollectionToEdit(null);
    }, 200);
  };

  const handleSaveEditCollection = async (e) => {
    e.preventDefault();
    if (!collectionToEdit) return;
    const name = editCollectionName.trim();
    if (!name) return;

    await saveLocalCollection({
      ...collectionToEdit,
      name,
    });
    handleCloseEditModal();
  };

  // Delete Collection
  const handleOpenDeleteModal = (col) => {
    setCollectionToDelete(col);
  };

  const handleCloseDeleteModal = () => {
    setIsClosingDelete(true);
    setTimeout(() => {
      setIsClosingDelete(false);
      setCollectionToDelete(null);
    }, 200);
  };

  const handleConfirmDeleteCollection = async () => {
    if (!collectionToDelete) return;
    await deleteLocalCollection(collectionToDelete.id);
    if (selectedCollectionId === collectionToDelete.id) {
      setSelectedCollectionId('all');
    }
    handleCloseDeleteModal();
  };

  const handleRemoveFromActiveCollection = (e, movieId) => {
    e.stopPropagation();
    if (!activeCollection) return;
    toggleItemInCollection(activeCollection.id, movieId);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Sync Status Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h4 style={{ fontWeight: 600, margin: 0 }}>Медіатека</h4>
          <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
            Збережені фільми, власні колекції та історія перегляду
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

      {/* Material 3 Segmented Control / Main Tabs */}
      <div
        className="round surface-container-low"
        style={{
          display: 'inline-flex',
          padding: '4px',
          gap: '4px',
          marginBottom: '24px',
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

      {/* Tab 1: Favorites & Collections */}
      {activeTab === 'favorites' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Collections Chip Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
              scrollbarWidth: 'none',
            }}
          >
            {/* "All" Chip */}
            <button
              className={`round ${selectedCollectionId === 'all' ? 'primary' : 'surface-container-low border'}`}
              style={{
                height: '36px',
                padding: '0 16px',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
              }}
              onClick={() => setSelectedCollectionId('all')}
            >
              <i>auto_awesome_motion</i>
              <span>Всі ({favorites.length})</span>
            </button>

            {/* Custom Collections Chips */}
            {collections.map((col) => {
              const count = Array.isArray(col.item_ids) ? col.item_ids.length : 0;
              const isSelected = selectedCollectionId === col.id;
              return (
                <button
                  key={col.id}
                  className={`round ${isSelected ? 'primary' : 'surface-container-low border'}`}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                  onClick={() => setSelectedCollectionId(col.id)}
                >
                  <i style={{ fontSize: '18px' }}>collections_bookmark</i>
                  <span>{col.name}</span>
                  <span style={{ opacity: 0.7, fontSize: '11px', marginLeft: '2px' }}>({count})</span>
                </button>
              );
            })}

            {/* "+ New Collection" Button */}
            <button
              className="round border transparent"
              style={{
                height: '36px',
                padding: '0 14px',
                fontSize: '13px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                color: 'var(--primary)',
              }}
              onClick={handleOpenCreateModal}
            >
              <i style={{ fontSize: '18px' }}>add</i>
              <span>Нова колекція</span>
            </button>
          </div>

          {/* Active Collection Header (if custom collection selected) */}
          {activeCollection && (
            <div
              className="round surface-container-low"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="primary-text" style={{ fontSize: '24px' }}>folder_special</i>
                <div>
                  <h6 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{activeCollection.name}</h6>
                  <p className="small-text surface-variant-text" style={{ margin: 0 }}>
                    {activeCollection.item_ids?.length || 0} збережених тайтлів
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="circle transparent small"
                  title="Перейменувати колекцію"
                  onClick={() => handleOpenEditModal(activeCollection)}
                >
                  <i>edit</i>
                </button>
                <button
                  className="circle transparent small"
                  style={{ color: 'var(--error)' }}
                  title="Видалити колекцію"
                  onClick={() => handleOpenDeleteModal(activeCollection)}
                >
                  <i>delete</i>
                </button>
              </div>
            </div>
          )}

          {/* Filter & Sort Controls */}
          {favorites.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {/* Media Type Filter (Segmented) */}
              <div
                className="round surface-container-low"
                style={{
                  display: 'inline-flex',
                  padding: '2px',
                  gap: '2px',
                }}
              >
                <button
                  className={filterType === 'all' ? 'small round primary' : 'small round transparent'}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                  onClick={() => setFilterType('all')}
                >
                  Всі
                </button>
                <button
                  className={filterType === 'movie' ? 'small round primary' : 'small round transparent'}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                  onClick={() => setFilterType('movie')}
                >
                  Фільми
                </button>
                <button
                  className={filterType === 'tv' ? 'small round primary' : 'small round transparent'}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                  onClick={() => setFilterType('tv')}
                >
                  Серіали
                </button>
              </div>

              {/* Sort By Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="small-text surface-variant-text" style={{ fontSize: '12px' }}>
                  Сортувати:
                </span>
                <Dropdown
                  value={sortBy}
                  options={SORT_OPTIONS}
                  onChange={(val) => setSortBy(val)}
                />
              </div>
            </div>
          )}

          {/* Favorites List */}
          {favorites.length === 0 ? (
            <div className="center-align padding" style={{ opacity: 0.6, marginTop: '48px' }}>
              <i style={{ fontSize: '56px', marginBottom: '12px' }}>favorite_border</i>
              <h5>Ви ще нічого не зберегли</h5>
              <p className="small-text surface-variant-text">
                Натискайте іконку сердечка на сторінці фільму, щоб додати його в обране або колекції.
              </p>
            </div>
          ) : displayedFavorites.length === 0 ? (
            <div className="center-align padding" style={{ opacity: 0.6, marginTop: '48px' }}>
              <i style={{ fontSize: '48px', marginBottom: '12px' }}>filter_list_off</i>
              <h5>У цій вибірці немає тайтлів</h5>
              <p className="small-text surface-variant-text">
                {activeCollection
                  ? 'Додайте фільми в цю колекцію, натиснувши іконку колекції на картці фільму.'
                  : 'Спробуйте змінити фільтри або сортування.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
              {displayedFavorites.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  action={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {activeCollection && (
                        <button
                          className="circle transparent small"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.65)',
                            color: 'var(--error, #ff8b8b)',
                            width: '28px',
                            height: '28px',
                          }}
                          title="Видалити з цієї колекції"
                          onClick={(e) => handleRemoveFromActiveCollection(e, movie.id)}
                        >
                          <i style={{ fontSize: '16px' }}>close</i>
                        </button>
                      )}
                      <button
                        className="circle transparent small"
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.65)',
                          color: '#ffffff',
                          width: '28px',
                          height: '28px',
                        }}
                        title="Керувати колекціями"
                        onClick={() => setSelectedMovieForCollection(movie)}
                      >
                        <i style={{ fontSize: '16px' }}>collections_bookmark</i>
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
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

                    {/* Metadata */}
                    <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <h6
                        style={{
                          margin: '0 0 6px 0',
                          fontSize: '14px',
                          fontWeight: 500,
                          lineHeight: '1.3',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {item.title || item.mediaId}
                      </h6>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7, fontSize: '12px' }}>
                        <span>{formatTime(item.time)} / {formatTime(item.duration)}</span>
                        <span>{percent}%</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal: Create Collection */}
      {isCreateModalOpen &&
        createPortal(
          <div
            className={`modal-overlay ${isClosingCreate ? 'closing' : ''}`}
            onClick={handleCloseCreateModal}
          >
            <div
              className={`surface-container round medium-elevate modal-dialog ${isClosingCreate ? 'closing' : ''}`}
              style={{
                padding: '24px',
                maxWidth: '420px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="primary-text" style={{ fontSize: '26px' }}>create_new_folder</i>
                  <h5 style={{ margin: 0, fontWeight: 500, fontSize: '1.25rem' }}>Нова колекція</h5>
                </div>
                <button type="button" className="circle transparent" onClick={handleCloseCreateModal}>
                  <i>close</i>
                </button>
              </div>

              <form onSubmit={handleCreateCollection} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="field label border round prefix">
                  <i>playlist_add</i>
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder=" "
                    autoFocus
                    maxLength={40}
                  />
                  <label>Назва колекції</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="round transparent" onClick={handleCloseCreateModal}>
                    Скасувати
                  </button>
                  <button type="submit" className="round primary" disabled={!newCollectionName.trim()}>
                    Створити
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Edit Collection */}
      {collectionToEdit &&
        createPortal(
          <div
            className={`modal-overlay ${isClosingEdit ? 'closing' : ''}`}
            onClick={handleCloseEditModal}
          >
            <div
              className={`surface-container round medium-elevate modal-dialog ${isClosingEdit ? 'closing' : ''}`}
              style={{
                padding: '24px',
                maxWidth: '420px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="primary-text" style={{ fontSize: '26px' }}>edit</i>
                  <h5 style={{ margin: 0, fontWeight: 500, fontSize: '1.25rem' }}>Перейменувати колекцію</h5>
                </div>
                <button type="button" className="circle transparent" onClick={handleCloseEditModal}>
                  <i>close</i>
                </button>
              </div>

              <form onSubmit={handleSaveEditCollection} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="field label border round prefix">
                  <i>folder</i>
                  <input
                    type="text"
                    value={editCollectionName}
                    onChange={(e) => setEditCollectionName(e.target.value)}
                    placeholder=" "
                    autoFocus
                    maxLength={40}
                  />
                  <label>Назва колекції</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="round transparent" onClick={handleCloseEditModal}>
                    Скасувати
                  </button>
                  <button type="submit" className="round primary" disabled={!editCollectionName.trim()}>
                    Зберегти
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Delete Collection Confirmation */}
      {collectionToDelete &&
        createPortal(
          <div
            className={`modal-overlay ${isClosingDelete ? 'closing' : ''}`}
            onClick={handleCloseDeleteModal}
          >
            <div
              className={`surface-container round medium-elevate modal-dialog ${isClosingDelete ? 'closing' : ''}`}
              style={{
                padding: '24px',
                maxWidth: '400px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="error-text" style={{ fontSize: '28px' }}>delete_forever</i>
                <h5 style={{ margin: 0, fontWeight: 500, fontSize: '1.25rem' }}>Видалити колекцію?</h5>
              </div>

              <p className="surface-variant-text" style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                Ви впевнені, що хочете видалити колекцію <strong>«{collectionToDelete.name}»</strong>? Фільми залишаться у вашому загальному обраному.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="round transparent" onClick={handleCloseDeleteModal}>
                  Скасувати
                </button>
                <button
                  type="button"
                  className="round"
                  style={{ backgroundColor: 'var(--error)', color: 'var(--on-error)' }}
                  onClick={handleConfirmDeleteCollection}
                >
                  Видалити
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Manage movie's collections */}
      <CollectionModal
        isOpen={Boolean(selectedMovieForCollection)}
        onClose={() => setSelectedMovieForCollection(null)}
        item={selectedMovieForCollection}
      />
    </div>
  );
};

export default Favorites;
