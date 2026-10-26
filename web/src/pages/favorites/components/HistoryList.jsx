import React from 'react';
import { formatTime } from '../utils/format';

export default function HistoryList({
  history,
  onContinueWatching,
  onRemoveHistory,
}) {
  if (history.length === 0) {
    return (
      <div className="center-align padding" style={{ opacity: 0.6, marginTop: '64px' }}>
        <i style={{ fontSize: '56px', marginBottom: '12px' }}>history</i>
        <h5>Історія перегляду порожня</h5>
        <p className="small-text surface-variant-text">
          Коли ви почнете переглядати фільми чи серіали, тут автоматично зберігатиметься прогрес і таймстампи.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
      {history.map((item) => {
        const percent = item.duration > 0 ? Math.min(100, Math.round((item.time / item.duration) * 100)) : 0;
        const posterUrl = item.poster
          ? item.poster.startsWith('http')
            ? item.poster
            : `https://image.tmdb.org/t/p/w500${item.poster}`
          : null;

        const isTv = item.mediaType === 'tv' || item.mediaId.startsWith('tv_');
        const seasonLabel = isTv && item.season ? `S${item.season} E${item.episode || 1}` : null;

        return (
          <article
            key={item.mediaId}
            className="no-padding round wave surface-container-low"
            style={{
              cursor: 'pointer',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={() => onContinueWatching(item)}
          >
            {/* Poster + Overlay Progress */}
            <div style={{ position: 'relative', width: '100%', height: '140px', backgroundColor: 'var(--surface-container-high)' }}>
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={item.title || 'Медіа'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i style={{ fontSize: '40px', opacity: 0.4 }}>movie</i>
                </div>
              )}

              {/* Play overlay hover indicator */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.1) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i
                  style={{
                    fontSize: '44px',
                    color: '#ffffff',
                    opacity: 0.9,
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  play_circle
                </i>
              </div>

              {/* Delete button */}
              <button
                className="circle transparent small"
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: '#ffffff',
                  width: '28px',
                  height: '28px',
                }}
                onClick={(e) => onRemoveHistory(e, item)}
                title="Видалити з історії"
              >
                <i style={{ fontSize: '16px' }}>close</i>
              </button>

              {/* TV Badge */}
              {seasonLabel && (
                <span
                  className="chip primary"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    fontSize: '11px',
                    padding: '2px 8px',
                    height: '22px',
                    fontWeight: 600,
                  }}
                >
                  {seasonLabel}
                </span>
              )}

              {/* Bottom Progress Bar */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.3)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${percent}%`,
                    backgroundColor: 'var(--primary)',
                  }}
                />
              </div>
            </div>

            {/* Metadata */}
            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <h6
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '14px',
                  fontWeight: 500,
                  lineHeight: '1.3',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.title || item.mediaId}
              </h6>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7, fontSize: '12px' }}>
                <span>{formatTime(item.time)} / {formatTime(item.duration)}</span>
                <span>{percent}%</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
