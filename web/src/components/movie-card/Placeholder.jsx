import React from 'react';

export default function Placeholder({ type, isHero, title }) {
  return (
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
          {title}
        </span>
      )}
    </div>
  );
}
