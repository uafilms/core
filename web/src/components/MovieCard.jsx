import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import 'mdui/components/ripple.js';
import 'mdui/components/icon.js';

const MovieCard = ({ movie, isHero = false }) => {
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
        flexDirection: 'column'
      }}
    >
      <div 
        onClick={() => navigate(`/details/${type}/${movie.id}`, { state: { from: location } })}
        style={{ 
          height: height, 
          borderRadius: '16px', 
          overflow: 'hidden', 
          backgroundColor: 'rgb(var(--mdui-color-surface-container))',
          position: 'relative',
          cursor: 'pointer',
          transition: 'transform 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }}
      >
        <mdui-ripple></mdui-ripple>

        {!showPlaceholder ? (
          <img 
            src={imageUrl} 
            alt={movie.title || movie.name} 
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgb(var(--mdui-color-surface-container-high)) 0%, rgb(var(--mdui-color-surface-container)) 100%)',
            color: 'rgb(var(--mdui-color-on-surface-variant))',
            padding: '16px',
            boxSizing: 'border-box'
          }}>
            <mdui-icon style={{ 
                fontSize: '48px', 
                marginBottom: '8px', 
                opacity: 0.5,
                color: 'rgb(var(--mdui-color-primary))' 
            }} name={type === 'movie' ? 'movie' : 'tv'}></mdui-icon>
            {!isHero && (
                <span style={{ 
                    fontSize: '12px', 
                    textAlign: 'center', 
                    opacity: 0.7, 
                    lineHeight: '1.2',
                    maxHeight: '3.6em',
                    overflow: 'hidden'
                }}>
                    {movie.title || movie.name}
                </span>
            )}
          </div>
        )}
        
        {isHero && (
           <div style={{
             position: 'absolute', bottom: 0, left: 0, right: 0,
             background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
             padding: '16px',
             pointerEvents: 'none'
           }}>
             <h3 style={{ margin: 0, color: 'white', fontFamily: 'Roboto' }}>{movie.title || movie.name}</h3>
           </div>
        )}
      </div>
      
      {!isHero && (
        <div style={{ marginTop: '8px', padding: '0 4px' }}>
          <h4 style={{ 
            margin: 0, 
            fontSize: '14px', 
            fontWeight: 500,
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            color: 'rgb(var(--mdui-color-on-surface))'
          }}>
            {movie.title || movie.name}
          </h4>
          <span style={{ fontSize: '12px', color: 'rgb(var(--mdui-color-on-surface-variant))' }}>
            {(movie.release_date || movie.first_air_date || '').split('-')[0]}
          </span>
        </div>
      )}
    </div>
  );
};

export default MovieCard;