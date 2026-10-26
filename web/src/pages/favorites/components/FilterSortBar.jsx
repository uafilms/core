import React from 'react';
import Dropdown from '../../../components/Dropdown';
import { SORT_OPTIONS } from '../utils/format';

export default function FilterSortBar({
  filterType,
  setFilterType,
  sortBy,
  setSortBy,
}) {
  return (
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
  );
}
