import React from 'react';

export default function ItemPreview({ item }) {
  const poster = item.poster_path || item.posterUrl;
  const posterUrl = poster
    ? poster.startsWith('http')
      ? poster
      : `https://image.tmdb.org/t/p/w200${poster}`
    : null;

  return (
    <div
      className="surface-container-low round"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 14px',
      }}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          style={{ width: '36px', height: '52px', objectFit: 'cover', borderRadius: '4px' }}
        />
      ) : (
        <i style={{ fontSize: '32px', opacity: 0.5 }}>movie</i>
      )}
      <div style={{ overflow: 'hidden' }}>
        <h6 style={{ margin: 0, fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title || item.originalTitle || 'Тайтл'}
        </h6>
        <span className="small-text surface-variant-text">
          Оберіть колекції для сортування
        </span>
      </div>
    </div>
  );
}
