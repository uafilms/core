import React from 'react';

export default function MetaInfo({
  data,
  type,
  isFav,
  onToggleFavorite,
  onOpenCollectionModal,
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', margin: '20px 0 16px 0' }}>
        <h4 style={{ margin: 0, fontWeight: 500, fontSize: '1.75rem', lineHeight: 1.25 }}>{data.title}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            className="circle surface-container"
            onClick={onOpenCollectionModal}
            style={{ cursor: 'pointer' }}
            title="Додати в колекцію"
          >
            <i>playlist_add</i>
          </button>
          <button
            className={`circle ${isFav ? 'secondary' : 'surface-container'}`}
            onClick={onToggleFavorite}
            style={{ cursor: 'pointer' }}
            title={isFav ? 'Видалити з обраного' : 'Додати в обране'}
          >
            <i>{isFav ? 'favorite' : 'favorite_border'}</i>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <span className="chip border surface-container-low">{data.year?.toString() || '-'}</span>
        <span className="chip border surface-container-low">{type === 'movie' ? 'Фільм' : 'Серіал'}</span>

        {data.imdbRating && (
          <span className="chip border surface-container-low" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <i style={{ fontSize: '16px', color: '#f59e0b' }}>star</i>
            <span>{data.imdbRating.toString()}</span>
          </span>
        )}

        {data.genres && data.genres.map((genre) => (
          <span key={genre} className="chip border surface-container-low">{genre}</span>
        ))}
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h6 className="primary-text" style={{ fontWeight: 500, marginBottom: '8px' }}>
          Про тайтл
        </h6>
        <p style={{ lineHeight: '1.6', opacity: 0.9, margin: 0, fontSize: '0.95rem' }}>
          {data.overview || 'Опис відсутній.'}
        </p>
      </div>
    </>
  );
}
