import React from 'react';

export default function HeroHeader({ backdropUrl, onBack }) {
  return (
    <div style={{ position: 'relative', height: '350px', width: '100%', overflow: 'hidden' }}>
      <img
        src={backdropUrl}
        alt="Cover"
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          background: 'linear-gradient(to top, var(--surface), transparent)',
          height: '220px',
        }}
      />

      {/* Back button aligned with content container */}
      <div style={{ position: 'absolute', top: 16, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 24px' }}>
          <button
            className="circle surface-container"
            onClick={onBack}
            style={{ cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            <i>arrow_back</i>
          </button>
        </div>
      </div>
    </div>
  );
}
