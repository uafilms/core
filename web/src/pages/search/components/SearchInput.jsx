import React from 'react';

export default function SearchInput({ query, setQuery, onSearch }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <div className="field prefix round fill surface-container no-margin" style={{ width: '100%' }}>
        <i>search</i>
        <input
          type="search"
          placeholder="Пошук фільмів..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
