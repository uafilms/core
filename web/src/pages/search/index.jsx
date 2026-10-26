import React from 'react';
import { useSearch } from './hooks/useSearch';
import SearchInput from './components/SearchInput';
import SearchResults from './components/SearchResults';

export default function Search() {
  const {
    query,
    setQuery,
    results,
    page,
    totalPages,
    loading,
    handleManualSearch,
    loadMore,
  } = useSearch();

  return (
    <div style={{ padding: '24px' }}>
      <SearchInput
        query={query}
        setQuery={setQuery}
        onSearch={handleManualSearch}
      />

      <SearchResults
        results={results}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onLoadMore={loadMore}
      />
    </div>
  );
}
