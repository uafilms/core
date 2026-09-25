import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const MovieCard = ({ movie, isHero = false, action = null }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [imgError, setImgError] = useState(false);

  const type = movie.media_type || 'movie';
  const hasPoster = !!movie.poster_path;
  const hasBackdrop = !!movie.backdrop_path;

  const posterUrl = hasPoster
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null;

  const backdropUrl = hasBackdrop
    ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`
    : null;

  const imageUrl = isHero ? backdropUrl : posterUrl;
  const showPlaceholder = !imageUrl || imgError;

  const width = isHero ? '100%' : '140px';
  const height = isHero ? '220px' : '210px';

  return (
    <div
      style={{
        width: width,
        position: 'relative',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <article
        onClick={() => navigate(`/details/${type}/${movie.id}`, { state: { from: location, movie } })}
        className="no-padding round wave surface-container-low"
        style={{
          height: height,
          position: 'relative',
          cursor: 'pointer',
          overflow: 'hidden',
          margin: 0,
        }}
      >
        {!showPlaceholder ? (
          <img
            src={imageUrl}
            alt={movie.title || movie.name}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box',
            }}
          >
            <i style={{ fontSize: '48px', opacity: 0.5, marginBottom: '8px' }}>
              {type === 'movie' ? 'movie' : 'tv'}
            </i>
            {!isHero && (
              <span
                style={{
                  fontSize: '12px',
                  textAlign: 'center',
                  opacity: 0.7,
                  lineHeight: '1.2',
                  maxHeight: '3.6em',
                  overflow: 'hidden',
                }}
              >
                {movie.title || movie.name}
              </span>
            )}
          </div>
        )}

        {isHero && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
              padding: '16px',
              pointerEvents: 'none',
            }}
          >
            <h5 className="white-text" style={{ margin: 0 }}>
              {movie.title || movie.name}
            </h5>
          </div>
        )}

        {action && (
          <div
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              zIndex: 3,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </article>

      {!isHero && (
        <div style={{ marginTop: '8px', padding: '0 4px' }}>
          <h6
            style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {movie.title || movie.name}
          </h6>
          <span className="small-text surface-variant-text" style={{ opacity: 0.7 }}>
            {(movie.release_date || movie.first_air_date || '').split('-')[0]}
          </span>
        </div>
      )}
    </div>
  );
};

export default MovieCard;
