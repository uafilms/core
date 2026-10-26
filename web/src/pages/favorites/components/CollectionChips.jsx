import React from 'react';

export default function CollectionChips({
  selectedCollectionId,
  setSelectedCollectionId,
  favoritesCount,
  collections,
  onOpenCreateModal,
  activeCollection,
  onOpenEditModal,
  onOpenDeleteModal,
}) {
  return (
    <>
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
          <span>Всі ({favoritesCount})</span>
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
          onClick={onOpenCreateModal}
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
              onClick={() => onOpenEditModal(activeCollection)}
            >
              <i>edit</i>
            </button>
            <button
              className="circle transparent small"
              style={{ color: 'var(--error)' }}
              title="Видалити колекцію"
              onClick={() => onOpenDeleteModal(activeCollection)}
            >
              <i>delete</i>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
