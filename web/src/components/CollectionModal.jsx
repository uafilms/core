import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getLocalCollections,
  saveLocalCollection,
  toggleItemInCollection,
  toggleFavoriteItem,
  getLocalFavorites,
} from '../utils/sync.js';

export default function CollectionModal({ isOpen, onClose, item }) {
  const [collections, setCollections] = useState([]);
  const [selectedColIds, setSelectedColIds] = useState(new Set());
  const [newColName, setNewColName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;

    const cols = getLocalCollections();
    setCollections(cols);

    const sItemId = String(item.id);
    const selected = new Set(
      cols
        .filter((c) => Array.isArray(c.item_ids) && c.item_ids.includes(sItemId))
        .map((c) => c.id)
    );
    setSelectedColIds(selected);

    const handleUpdate = () => {
      const updated = getLocalCollections();
      setCollections(updated);
      setSelectedColIds(
        new Set(
          updated
            .filter((c) => Array.isArray(c.item_ids) && c.item_ids.includes(sItemId))
            .map((c) => c.id)
        )
      );
    };

    window.addEventListener('uafilms_collections_updated', handleUpdate);
    return () => window.removeEventListener('uafilms_collections_updated', handleUpdate);
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleToggle = async (colId) => {
    const sItemId = String(item.id);
    const nextSelected = new Set(selectedColIds);
    const willAdd = !nextSelected.has(colId);

    if (willAdd) {
      nextSelected.add(colId);
      // Ensure item is also in favorites
      const favorites = getLocalFavorites();
      const inFavs = favorites.some((f) => String(f.id) === sItemId);
      if (!inFavs) {
        toggleFavoriteItem(item, true);
      }
    } else {
      nextSelected.delete(colId);
    }

    setSelectedColIds(nextSelected);
    await toggleItemInCollection(colId, sItemId);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newColName.trim();
    if (!name) return;

    const sItemId = String(item.id);
    // Ensure item is also in favorites
    const favorites = getLocalFavorites();
    const inFavs = favorites.some((f) => String(f.id) === sItemId);
    if (!inFavs) {
      toggleFavoriteItem(item, true);
    }

    const created = await saveLocalCollection({
      name,
      item_ids: [sItemId],
    });

    if (created) {
      setSelectedColIds((prev) => new Set([...prev, created.id]));
      setNewColName('');
      setIsCreating(false);
    }
  };

  return createPortal(
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`surface-container round medium-elevate modal-dialog ${isClosing ? 'closing' : ''}`}
        style={{
          padding: '24px',
          maxWidth: '460px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="primary-text" style={{ fontSize: '26px' }}>collections_bookmark</i>
            <h5 style={{ margin: 0, fontWeight: 500, fontSize: '1.25rem' }}>Колекції</h5>
          </div>
          <button
            type="button"
            className="circle transparent"
            onClick={handleClose}
          >
            <i>close</i>
          </button>
        </div>

        {/* Item Title Preview */}
        <div
          className="surface-container-low round"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
          }}
        >
          {item.poster_path || item.posterUrl ? (
            <img
              src={
                (item.poster_path || item.posterUrl).startsWith('http')
                  ? item.poster_path || item.posterUrl
                  : `https://image.tmdb.org/t/p/w200${item.poster_path || item.posterUrl}`
              }
              alt=""
              style={{ width: '36px', height: '52px', objectFit: 'cover', borderRadius: '4px' }}
            />
          ) : (
            <i style={{ fontSize: '32px', opacity: 0.5 }}>movie</i>
          )}
          <div style={{ overflow: 'hidden' }}>
            <h6 style={{ margin: 0, fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.title || item.originalTitle || 'Тайтл'}
            </h6>
            <span className="small-text surface-variant-text">
              Оберіть колекції для сортування
            </span>
          </div>
        </div>

        {/* Collections List */}
        <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {collections.length === 0 ? (
            <div className="center-align" style={{ padding: '20px 0', opacity: 0.6 }}>
              <p className="small-text surface-variant-text" style={{ margin: 0 }}>
                У вас ще немає створених колекцій
              </p>
            </div>
          ) : (
            collections.map((col) => {
              const isChecked = selectedColIds.has(col.id);
              const count = Array.isArray(col.item_ids) ? col.item_ids.length : 0;
              return (
                <label
                  key={col.id}
                  className="wave surface-container-low round"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    margin: 0,
                  }}
                  onClick={() => handleToggle(col.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i style={{ fontSize: '20px', color: isChecked ? 'var(--primary)' : 'inherit', opacity: isChecked ? 1 : 0.7 }}>
                      {isChecked ? 'check_box' : 'check_box_outline_blank'}
                    </i>
                    <span style={{ fontWeight: isChecked ? 500 : 400, fontSize: '14px' }}>
                      {col.name}
                    </span>
                  </div>
                  <span className="small-text surface-variant-text">
                    {count} {count === 1 ? 'тайтл' : 'тайтлів'}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {/* New Collection Form */}
        {isCreating ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="field label border round prefix" style={{ flex: 1, margin: 0 }}>
              <i>playlist_add</i>
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder=" "
                autoFocus
                maxLength={40}
              />
              <label>Назва нової колекції</label>
            </div>
            <button type="submit" className="round primary" disabled={!newColName.trim()} style={{ height: '48px', padding: '0 16px' }}>
              Створити
            </button>
            <button
              type="button"
              className="circle transparent"
              onClick={() => {
                setIsCreating(false);
                setNewColName('');
              }}
              style={{ height: '48px', width: '48px' }}
            >
              <i>close</i>
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="round border"
            onClick={() => setIsCreating(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px' }}
          >
            <i>add</i>
            <span>Нова колекція</span>
          </button>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            type="button"
            className="round primary"
            onClick={handleClose}
            style={{ padding: '8px 24px' }}
          >
            Готово
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
