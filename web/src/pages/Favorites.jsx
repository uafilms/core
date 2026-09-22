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
      <h4 style={{ fontWeight: 600, marginBottom: '24px' }}>Збережене</h4>

      {favorites.length === 0 ? (
        <div className="center-align padding" style={{ opacity: 0.6, marginTop: '48px' }}>
          <i style={{ fontSize: '48px', marginBottom: '8px' }}>favorite_border</i>
          <p>Ви ще нічого не зберегли.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
          {favorites.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Favorites;
