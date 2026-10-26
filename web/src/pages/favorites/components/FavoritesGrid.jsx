import React from 'react';
import MovieCard from '../../../components/MovieCard';

export default function FavoritesGrid({
  favoritesCount,
  activeCollection,
  displayedFavorites,
  onRemoveFromActiveCollection,
  onRemoveFavorite,
  onSelectMovieForCollection,
}) {
  if (favoritesCount === 0) {
    return (
      <div className="center-align padding" style={{ opacity: 0.6, marginTop: '48px' }}>
        <i style={{ fontSize: '56px', marginBottom: '12px' }}>favorite_border</i>
        <h5>Ви ще нічого не зберегли</h5>
        <p className="small-text surface-variant-text">
          Натискайте іконку сердечка на сторінці фільму, щоб додати його в обране або колекції.
        </p>
      </div>
    );
  }

  if (displayedFavorites.length === 0) {
    return (
      <div className="center-align padding" style={{ opacity: 0.6, marginTop: '48px' }}>
        <i style={{ fontSize: '48px', marginBottom: '12px' }}>filter_list_off</i>
        <h5>У цій вибірці немає тайтлів</h5>
        <p className="small-text surface-variant-text">
          {activeCollection
            ? 'Додайте фільми в цю колекцію, натиснувши іконку колекції на картці фільму.'
            : 'Спробуйте змінити фільтри або сортування.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
      {displayedFavorites.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {activeCollection ? (
                <button
                  className="circle transparent small"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    color: 'var(--error, #ff8b8b)',
                    width: '28px',
                    height: '28px',
                  }}
                  title="Видалити з цієї колекції"
                  onClick={(e) => onRemoveFromActiveCollection(e, movie.id)}
                >
                  <i style={{ fontSize: '16px' }}>close</i>
                </button>
              ) : (
                <button
                  className="circle transparent small"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    color: '#ff5252',
                    width: '28px',
                    height: '28px',
                  }}
                  title="Видалити з обраного"
                  onClick={(e) => onRemoveFavorite(e, movie)}
                >
                  <i style={{ fontSize: '16px' }}>favorite</i>
                </button>
              )}
              <button
                className="circle transparent small"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  color: '#ffffff',
                  width: '28px',
                  height: '28px',
                }}
                title="Керувати колекціями"
                onClick={() => onSelectMovieForCollection(movie)}
              >
                <i style={{ fontSize: '16px' }}>collections_bookmark</i>
              </button>
            </div>
          }
        />
      ))}
    </div>
  );
}
