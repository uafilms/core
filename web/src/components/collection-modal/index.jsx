import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getLocalCollections,
  saveLocalCollection,
  toggleItemInCollection,
  toggleFavoriteItem,
  getLocalFavorites,
} from '../../utils/sync.js';

import ItemPreview from './ItemPreview';
import CollectionItem from './CollectionItem';
import NewCollectionForm from './NewCollectionForm';

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

        <ItemPreview item={item} />

        {/* Collections List */}
        <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {collections.length === 0 ? (
            <div className="center-align" style={{ padding: '20px 0', opacity: 0.6 }}>
              <p className="small-text surface-variant-text" style={{ margin: 0 }}>
                У вас ще немає створених колекцій
              </p>
            </div>
          ) : (
            collections.map((col) => (
              <CollectionItem
                key={col.id}
                col={col}
                isChecked={selectedColIds.has(col.id)}
                onToggle={() => handleToggle(col.id)}
              />
            ))
          )}
        </div>

        <NewCollectionForm
          isCreating={isCreating}
          setIsCreating={setIsCreating}
          newColName={newColName}
          setNewColName={setNewColName}
          onSubmit={handleCreate}
        />

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
