import React from 'react';

export default function CollectionItem({ col, isChecked, onToggle }) {
  const count = Array.isArray(col.item_ids) ? col.item_ids.length : 0;

  return (
    <label
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
      onClick={onToggle}
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
}
