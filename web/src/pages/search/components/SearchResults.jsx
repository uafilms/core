import React from 'react';
import MovieCard from '../../../components/MovieCard';

export default function SearchResults({ results, loading, page, totalPages, onLoadMore }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
        {results.map((movie, index) => (
          <MovieCard key={`${movie.id}-${index}`} movie={movie} />
        ))}
      </div>

      {loading ? (
        <div className="row center-align middle-align" style={{ marginTop: '32px', paddingBottom: '32px' }}>
          <progress className="circle indeterminate"></progress>
        </div>
      ) : (
        results.length > 0 && page < totalPages && (
          <div className="row center-align middle-align" style={{ marginTop: '32px', paddingBottom: '32px' }}>
            <button className="secondary" onClick={onLoadMore}>
              Завантажити ще
            </button>
          </div>
        )
      )}
    </>
  );
}
