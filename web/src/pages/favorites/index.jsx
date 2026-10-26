import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CollectionModal from '../../components/CollectionModal';
import {
  removeWatchProgress,
  saveLocalCollection,
  deleteLocalCollection,
  toggleItemInCollection,
  toggleFavoriteItem,
} from '../../utils/sync.js';
import { useAuth } from '../../context/AuthContext';

import { useFavoritesData } from './hooks/useFavoritesData';
import HeaderTabs from './components/HeaderTabs';
import CollectionChips from './components/CollectionChips';
import FilterSortBar from './components/FilterSortBar';
import FavoritesGrid from './components/FavoritesGrid';
import HistoryList from './components/HistoryList';
import CreateCollectionModal from './components/modals/CreateCollectionModal';
import EditCollectionModal from './components/modals/EditCollectionModal';
import DeleteCollectionModal from './components/modals/DeleteCollectionModal';

export default function Favorites() {
  const [activeTab, setActiveTab] = useState('favorites'); // 'favorites' | 'history'
  const [selectedCollectionId, setSelectedCollectionId] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'movie' | 'tv'

  // Modals state
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

  const { favorites, history, setHistory, collections } = useFavoritesData();

  // Active selected collection object
  const activeCollection = useMemo(() => {
    if (selectedCollectionId === 'all') return null;
    return collections.find((c) => c.id === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  // Filter & sort favorites
  const displayedFavorites = useMemo(() => {
    let result = [...favorites];

    if (activeCollection) {
      const allowedIds = new Set((activeCollection.item_ids || []).map(String));
      result = result.filter((item) => allowedIds.has(String(item.id)));
    }

    if (filterType !== 'all') {
      result = result.filter((item) => (item.media_type || 'movie') === filterType);
    }

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
    setHistory((prev) => prev.filter((p) => p.mediaId !== item.mediaId));
  };

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

  const handleRemoveFavorite = (e, movie) => {
    e.stopPropagation();
    toggleFavoriteItem(movie, false);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <HeaderTabs
        user={user}
        isSyncing={isSyncing}
        syncNow={syncNow}
        setIsAuthModalOpen={setIsAuthModalOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        favoritesCount={favorites.length}
        historyCount={history.length}
      />

      {activeTab === 'favorites' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <CollectionChips
            selectedCollectionId={selectedCollectionId}
            setSelectedCollectionId={setSelectedCollectionId}
            favoritesCount={favorites.length}
            collections={collections}
            onOpenCreateModal={handleOpenCreateModal}
            activeCollection={activeCollection}
            onOpenEditModal={handleOpenEditModal}
            onOpenDeleteModal={handleOpenDeleteModal}
          />

          {favorites.length > 0 && (
            <FilterSortBar
              filterType={filterType}
              setFilterType={setFilterType}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />
          )}

          <FavoritesGrid
            favoritesCount={favorites.length}
            activeCollection={activeCollection}
            displayedFavorites={displayedFavorites}
            onRemoveFromActiveCollection={handleRemoveFromActiveCollection}
            onRemoveFavorite={handleRemoveFavorite}
            onSelectMovieForCollection={setSelectedMovieForCollection}
          />
        </div>
      )}

      {activeTab === 'history' && (
        <HistoryList
          history={history}
          onContinueWatching={handleContinueWatching}
          onRemoveHistory={handleRemoveHistory}
        />
      )}

      <CreateCollectionModal
        isOpen={isCreateModalOpen}
        isClosing={isClosingCreate}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateCollection}
        name={newCollectionName}
        setName={setNewCollectionName}
      />

      <EditCollectionModal
        collection={collectionToEdit}
        isClosing={isClosingEdit}
        onClose={handleCloseEditModal}
        onSubmit={handleSaveEditCollection}
        name={editCollectionName}
        setName={setEditCollectionName}
      />

      <DeleteCollectionModal
        collection={collectionToDelete}
        isClosing={isClosingDelete}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDeleteCollection}
      />

      <CollectionModal
        isOpen={Boolean(selectedMovieForCollection)}
        onClose={() => setSelectedMovieForCollection(null)}
        item={selectedMovieForCollection}
      />
    </div>
  );
}
