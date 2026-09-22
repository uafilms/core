import React, { useEffect, useState } from 'react';
import MovieCard from '../components/MovieCard';

const Favorites = () => {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('uafilms_favorites') || '[]');
    setFavorites(stored);
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>Збережене</h1>
      
      {favorites.length === 0 ? (
        <p style={{ color: 'var(--md-sys-color-outline)' }}>Ви ще нічого не зберегли.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
          {favorites.map(movie => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Favorites;